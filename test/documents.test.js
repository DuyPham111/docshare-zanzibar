const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

describe('Xác thực', () => {
  test('không có token → 401', async () => {
    const res = await api().get('/documents/handbook')
    expect(res.status).toBe(401)
  })
  test('token sai chữ ký → 401', async () => {
    const res = await api().get('/documents/handbook').set('Authorization', 'Bearer abc.def.ghi')
    expect(res.status).toBe(401)
  })
  test('token của user không tồn tại → 401', async () => {
    const res = await api().get('/documents/handbook').set(as('mallory'))
    expect(res.status).toBe(401)
  })
})

describe('Đọc và sửa tài liệu', () => {
  test('không có quyền xem → 404 giống hệt tài liệu không tồn tại', async () => {
    const hidden = await api().get('/documents/bob-notes').set(as('carol'))
    const missing = await api().get('/documents/khong-ton-tai').set(as('carol'))
    expectDenied(hidden, 404)
    expect(missing.body).toEqual(hidden.body)
  })

  test('xem được nhưng không được sửa → 403', async () => {
    const res = await api().patch('/documents/handbook').set(as('erin')).send({ title: 'Hacked' })
    expectDenied(res, 403)
  })

  test('editor qua nhóm sửa được; field ngoài danh sách (orgId, createdBy) bị bỏ qua', async () => {
    const res = await api()
      .patch('/documents/api-spec')
      .set(as('carol'))
      .send({ title: 'API spec v3', orgId: 'globex', createdBy: 'carol', owner: 'carol' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'API spec v3', orgId: 'acme', createdBy: 'bob' })
    // Không leo thang: carol vẫn không xóa được.
    expectDenied(await api().delete('/documents/api-spec').set(as('carol')), 403)
  })

  test('commenter không sửa được nội dung', async () => {
    expectDenied(await api().patch('/documents/draft').set(as('carol')).send({ content: 'x' }), 403)
  })

  test('title không hợp lệ → 400 (sau khi đã qua kiểm quyền)', async () => {
    const res = await api().patch('/documents/api-spec').set(as('bob')).send({ title: '' })
    expect(res.status).toBe(400)
  })
})

describe('Tạo tài liệu', () => {
  test('tạo trong thư mục có quyền editor: người tạo là owner, org lấy từ thư mục', async () => {
    const res = await api()
      .post('/documents')
      .set(as('frank'))
      .send({ title: 'Index tuning', content: '...', folderId: 'specs', orgId: 'globex' })
    expect(res.status).toBe(201)
    expect(res.body.orgId).toBe('acme')

    const doc = await api().get(`/documents/${res.body.id}`).set(as('frank'))
    expect(doc.body.capabilities.can_delete).toBe(true)
    // Kế thừa ngay: cả nhóm eng sửa được, sales không thấy.
    expect((await api().get(`/documents/${res.body.id}`).set(as('carol'))).body.capabilities.can_edit).toBe(true)
    expectDenied(await api().get(`/documents/${res.body.id}`).set(as('dave')), 404)
  })

  test('tạo trong thư mục chỉ xem → 403; thư mục không thấy → 404', async () => {
    expectDenied(await api().post('/documents').set(as('erin')).send({ title: 'x', folderId: 'public' }), 403)
    expectDenied(await api().post('/documents').set(as('erin')).send({ title: 'x', folderId: 'specs' }), 404)
  })

  test('khách ngoài org có quyền editor ở thư mục vẫn tạo được; tài liệu thuộc org của thư mục', async () => {
    await api().post('/folders/sales-docs/shares').set(as('dave')).send({ subject: 'user:hank', relation: 'editor' })
    const res = await api().post('/documents').set(as('hank')).send({ title: 'Quote', folderId: 'sales-docs' })
    expect(res.status).toBe(201)
    expect(res.body.orgId).toBe('acme')
  })
})

describe('Chuyển tài liệu sang thư mục khác', () => {
  test('quyền đổi theo thư mục mới: một tuple parent thay đổi', async () => {
    expect((await api().get('/documents/db-schema').set(as('dave'))).status).toBe(404)
    const res = await api().patch('/documents/db-schema').set(as('alice')).send({ folderId: 'sales-docs' })
    expect(res.status).toBe(200)
    expect((await api().get('/documents/db-schema').set(as('dave'))).body.capabilities.can_edit).toBe(true)
    expectDenied(await api().get('/documents/db-schema').set(as('carol')), 404)
    // frank vẫn là owner trực tiếp nên vẫn thấy.
    expect((await api().get('/documents/db-schema').set(as('frank'))).status).toBe(200)
  })

  test('cần can_create ở thư mục đích', async () => {
    // carol sửa được api-spec nhưng không có quyền gì ở sales-docs.
    expectDenied(await api().patch('/documents/api-spec').set(as('carol')).send({ folderId: 'sales-docs' }), 404)
  })

  test('không chuyển sang thư mục của org khác', async () => {
    // gina là owner globex-plan; thử chuyển vào thư mục acme mà gina có quyền editor (qua chia sẻ).
    await api().post('/folders/sales-docs/shares').set(as('dave')).send({ subject: 'user:gina', relation: 'editor' })
    const res = await api().patch('/documents/globex-plan').set(as('gina')).send({ folderId: 'sales-docs' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('cross_org_move')
  })
})

describe('Xóa tài liệu', () => {
  test('owner xóa được; tuple bị xóa nên không còn ai thấy, kể cả qua danh sách', async () => {
    expect((await api().delete('/documents/forecast').set(as('dave'))).status).toBe(204)
    expectDenied(await api().get('/documents/forecast').set(as('erin')), 404)
    const list = await api().get('/documents').set(as('erin'))
    expect(list.body.map(d => d.id)).not.toContain('forecast')
  })

  test('editor không xóa được', async () => {
    expectDenied(await api().delete('/documents/api-spec').set(as('frank')), 403)
  })
})

describe('Tìm kiếm có phân quyền', () => {
  test('chỉ trả tài liệu người gọi xem được', async () => {
    const alice = await api().get('/documents?q=plan').set(as('alice'))
    expect(alice.body).toEqual([])
    const hank = await api().get('/documents?q=plan').set(as('hank'))
    expect(hank.body.map(d => d.id)).toEqual(['globex-plan'])
  })

  test('filter=shared: tài liệu người khác chia sẻ cho mình', async () => {
    const res = await api().get('/documents?filter=shared').set(as('carol'))
    expect(res.body.map(d => d.id).sort()).toEqual(['api-spec', 'db-schema', 'draft', 'handbook'])
  })
})

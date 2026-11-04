const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

const folder = (user, id) => api().get(`/folders/${id}`).set(as(user))

describe('Xem thư mục', () => {
  test('con bị chặn không xuất hiện trong danh sách con', async () => {
    const res = await folder('carol', 'engineering')
    expect(res.status).toBe(200)
    expect(res.body.folders.map(f => f.id)).toEqual(['specs'])
    const frank = await folder('frank', 'engineering')
    expect(frank.body.folders.map(f => f.id)).toEqual(['specs', 'incidents'])
  })

  test('breadcrumb chỉ gồm thư mục cha người gọi xem được', async () => {
    const carol = await folder('carol', 'specs')
    expect(carol.body.path.map(p => p.id)).toEqual(['engineering'])
    const alice = await folder('alice', 'specs')
    expect(alice.body.path.map(p => p.id)).toEqual(['acme-drive', 'engineering'])
  })

  test('GET /folders: root là thư mục đầu tiên người gọi thấy trên mỗi nhánh', async () => {
    const res = await api().get('/folders').set(as('dave'))
    const roots = res.body.filter(f => f.root).map(f => f.id).sort()
    expect(roots).toEqual(['public', 'sales-docs'])
  })

  test('thư mục không thấy → 404', async () => {
    expectDenied(await folder('dave', 'engineering'), 404)
  })
})

describe('Tạo thư mục', () => {
  test('tạo thư mục con: kế thừa quyền từ cha ngay lập tức', async () => {
    const res = await api().post('/folders').set(as('frank')).send({ name: 'RFCs', parentId: 'specs' })
    expect(res.status).toBe(201)
    expect((await folder('carol', res.body.id)).body.capabilities.can_edit).toBe(true)
  })

  test('tạo thư mục gốc: thuộc org của người gọi, chỉ người tạo (và admin org) thấy', async () => {
    const res = await api().post('/folders').set(as('erin')).send({ name: 'Erin drive', orgId: 'globex' })
    expect(res.status).toBe(201)
    expect(res.body.orgId).toBe('acme')
    expect((await folder('alice', res.body.id)).status).toBe(200)
    expectDenied(await folder('bob', res.body.id), 404)
  })

  test('chỉ có quyền xem thì không tạo được thư mục con', async () => {
    expectDenied(await api().post('/folders').set(as('erin')).send({ name: 'x', parentId: 'public' }), 403)
  })
})

describe('Chuyển thư mục: đổi một tuple parent, cả cây con đổi quyền', () => {
  test('chuyển specs từ engineering sang sales-docs', async () => {
    const res = await api().patch('/folders/specs').set(as('alice')).send({ parentId: 'sales-docs' })
    expect(res.status).toBe(200)
    // carol (eng) mất quyền api-spec; dave (sales) có quyền sửa.
    expectDenied(await api().get('/documents/api-spec').set(as('carol')), 404)
    const dave = await api().get('/documents/api-spec').set(as('dave'))
    expect(dave.body.capabilities.can_edit).toBe(true)
  })

  test('không chuyển vào chính nó hoặc thư mục con của nó', async () => {
    const res = await api().patch('/folders/engineering').set(as('alice')).send({ parentId: 'specs' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('cycle')
  })

  test('chỉ owner chuyển được thư mục', async () => {
    expectDenied(await api().patch('/folders/specs').set(as('carol')).send({ parentId: 'incidents' }), 403)
  })

  test('đổi tên cần can_edit', async () => {
    expect((await api().patch('/folders/specs').set(as('carol')).send({ name: 'Specifications' })).status).toBe(200)
    expectDenied(await api().patch('/folders/public').set(as('erin')).send({ name: 'x' }), 403)
  })
})

describe('Chia sẻ và xóa thư mục', () => {
  test('chia sẻ thư mục cho user → thấy mọi tài liệu bên trong', async () => {
    const res = await api().post('/folders/sales-docs/shares').set(as('dave')).send({ subject: 'user:erin', relation: 'viewer' })
    expect(res.status).toBe(201)
    const list = await api().get('/documents').set(as('erin'))
    expect(list.body.map(d => d.id).sort()).toEqual(['forecast', 'handbook', 'pricing'])
  })

  test('xóa thư mục xóa cả cây; tuple bị xóa theo nên không còn quyền mồ côi', async () => {
    expect((await api().delete('/folders/engineering').set(as('alice'))).status).toBe(204)
    expectDenied(await api().get('/documents/api-spec').set(as('bob')), 404)
    expectDenied(await folder('bob', 'specs'), 404)
    const list = await api().get('/documents').set(as('frank'))
    expect(list.body.map(d => d.id)).toEqual([])
  })

  test('editor không xóa được thư mục', async () => {
    expectDenied(await api().delete('/folders/engineering').set(as('bob')), 403)
  })
})

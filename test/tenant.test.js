// Tenant boundary: không có tuple nào nối org này sang org kia thì không có đường quyền nào đi qua.
const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

describe('Cách ly org', () => {
  test('admin acme không thấy gì của globex, kể cả danh sách', async () => {
    expectDenied(await api().get('/documents/globex-plan').set(as('alice')), 404)
    expectDenied(await api().get('/folders/globex-drive').set(as('alice')), 404)
    expectDenied(await api().get('/orgs/globex').set(as('alice')), 404)
    const folders = await api().get('/folders').set(as('alice'))
    expect(folders.body.map(f => f.orgId)).not.toContain('globex')
  })

  test('admin globex chỉ thấy tài liệu acme được chia sẻ hoặc public', async () => {
    const res = await api().get('/documents').set(as('gina'))
    expect(res.body.map(d => d.id).sort()).toEqual(['globex-plan', 'handbook', 'pricing'])
  })

  test('nhật ký thay đổi quyền chỉ cho admin org, chỉ gồm object của org đó', async () => {
    await api().post('/documents/api-spec/shares').set(as('bob')).send({ subject: 'user:erin', relation: 'viewer' })
    const res = await api().get('/orgs/acme/changes').set(as('alice'))
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ operation: 'write', tuple: 'document:api-spec#viewer@user:erin' })
    expect(res.body.some(c => c.tuple.includes('globex'))).toBe(false)
    expectDenied(await api().get('/orgs/acme/changes').set(as('bob')), 403)
    expectDenied(await api().get('/orgs/acme/changes').set(as('gina')), 404)
  })
})

describe('Thuộc tính tự khai của client không có tác dụng', () => {
  test('header X-Org-Id, query orgId, body role không tăng quyền', async () => {
    const res = await api()
      .get('/documents/globex-plan?orgId=globex&role=admin')
      .set(as('alice'))
      .set('X-Org-Id', 'globex')
      .set('X-Role', 'admin')
    expectDenied(res, 404)
  })

  test('body { role: "owner" } khi sửa tài liệu không làm editor thành owner', async () => {
    await api().patch('/documents/api-spec').set(as('frank')).send({ role: 'owner', relation: 'owner' })
    expectDenied(await api().delete('/documents/api-spec').set(as('frank')), 403)
  })

  test('không ghi được tuple tùy ý: chia sẻ quan hệ ngoài danh sách cho phép → 400', async () => {
    for (const relation of ['owner', 'blocked', 'parent', 'org']) {
      const res = await api().post('/documents/api-spec/shares').set(as('bob')).send({ subject: 'user:erin', relation })
      expect(res.status).toBe(400)
    }
  })
})

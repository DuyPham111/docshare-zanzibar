const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

const addMember = (by, group, subject) => api().post(`/groups/${group}/members`).set(as(by)).send({ subject })

describe('Nhóm lồng nhau', () => {
  test('effectiveMembers của eng gồm cả member qua backend và dba (3 tầng)', async () => {
    const res = await api().get('/groups/eng').set(as('carol'))
    expect(res.status).toBe(200)
    expect(res.body.members).toEqual(['group:backend', 'group:frontend'])
    expect(res.body.effectiveMembers).toEqual(['bob', 'carol', 'frank'])
    expect(res.body.capabilities.can_manage).toBe(true)
  })

  test('/me liệt kê mọi nhóm user thuộc về, kể cả gián tiếp', async () => {
    const res = await api().get('/me').set(as('frank'))
    expect(res.body.groups.sort()).toEqual(['backend', 'dba', 'eng'])
  })

  test('mọi member org xem được nhóm của org; org khác → 404', async () => {
    expect((await api().get('/groups/eng').set(as('erin'))).status).toBe(200)
    expectDenied(await api().get('/groups/eng').set(as('hank')), 404)
    const list = await api().get('/groups').set(as('hank'))
    expect(list.body.map(g => g.id)).toEqual(['ops'])
  })
})

describe('Quản lý thành viên', () => {
  test('manager thêm user → user nhận ngay quyền của nhóm ở mọi thư mục', async () => {
    expectDenied(await api().get('/documents/api-spec').set(as('erin')), 404)
    expect((await addMember('carol', 'eng', 'user:erin')).status).toBe(201)
    expect((await api().get('/documents/api-spec').set(as('erin'))).body.capabilities.can_edit).toBe(true)
  })

  test('member thường không quản lý được nhóm', async () => {
    expectDenied(await addMember('bob', 'eng', 'user:erin'), 403)
  })

  test('admin org quản lý mọi nhóm của org nhưng không vì thế mà thành member', async () => {
    expect((await addMember('alice', 'backend', 'user:erin')).status).toBe(201)
    const me = await api().get('/me').set(as('alice'))
    expect(me.body.groups).toEqual([])
  })

  test('gỡ bob khỏi backend → mất quyền editor ở engineering ngay (thu hồi không chờ cache/token)', async () => {
    // bob là owner của specs/incidents nên thử trên tài liệu mới đặt thẳng trong engineering (chỉ có quyền qua nhóm).
    const doc = await api().post('/documents').set(as('alice')).send({ title: 'Roadmap', folderId: 'engineering' })
    expect((await api().get(`/documents/${doc.body.id}`).set(as('bob'))).status).toBe(200)

    const res = await api().delete('/groups/backend/members?subject=user:bob').set(as('alice'))
    expect(res.status).toBe(204)
    expectDenied(await api().get(`/documents/${doc.body.id}`).set(as('bob')), 404)
  })

  test('không thêm user hoặc nhóm của org khác', async () => {
    expect((await addMember('carol', 'eng', 'user:hank')).status).toBe(400)
    expect((await addMember('carol', 'eng', 'group:ops')).status).toBe(400)
  })

  test('thêm trùng → 409; gỡ người không phải member → 404', async () => {
    expect((await addMember('carol', 'eng', 'group:backend')).status).toBe(409)
    expect((await api().delete('/groups/eng/members?subject=user:dave').set(as('carol'))).status).toBe(404)
  })
})

describe('Chống chu trình nhóm', () => {
  test('thêm eng vào dba (dba ⊂ backend ⊂ eng) → 409', async () => {
    const res = await addMember('alice', 'dba', 'group:eng')
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('cycle')
  })

  test('thêm nhóm vào chính nó → 409', async () => {
    expect((await addMember('alice', 'eng', 'group:eng')).status).toBe(409)
  })

  test('thêm nhóm không tạo chu trình thì được', async () => {
    expect((await addMember('alice', 'sales', 'group:dba')).status).toBe(201)
    const res = await api().get('/documents/pricing').set(as('frank'))
    expect(res.body.capabilities.can_edit).toBe(true)
  })
})

describe('Tạo nhóm', () => {
  test('người tạo là manager, nhóm thuộc org của người tạo', async () => {
    const res = await api().post('/groups').set(as('erin')).send({ name: 'Interns', orgId: 'globex' })
    expect(res.status).toBe(201)
    expect(res.body.orgId).toBe('acme')
    expect((await addMember('erin', res.body.id, 'user:bob')).status).toBe(201)
  })
})

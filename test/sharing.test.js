const clock = require('../src/clock')
const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

const share = (by, doc, body) => api().post(`/documents/${doc}/shares`).set(as(by)).send(body)
const view = (user, doc) => api().get(`/documents/${doc}`).set(as(user))

describe('Chia sẻ cho user, nhóm, public link', () => {
  test('owner chia sẻ viewer cho user → người đó xem được, không sửa được', async () => {
    expectDenied(await view('erin', 'api-spec'), 404)
    const res = await share('bob', 'api-spec', { subject: 'user:erin', relation: 'viewer' })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ relation: 'viewer', subject: 'user:erin', expiresAt: null })
    const doc = await view('erin', 'api-spec')
    expect(doc.status).toBe(200)
    expect(doc.body.capabilities).toMatchObject({ can_comment: false, can_edit: false })
  })

  test('chia sẻ cho nhóm: mọi member, kể cả qua nhóm con, nhận quyền', async () => {
    await share('dave', 'forecast', { subject: 'group:eng', relation: 'commenter' })
    for (const user of ['bob', 'carol', 'frank']) {
      expect((await view(user, 'forecast')).body.capabilities.can_comment).toBe(true)
    }
  })

  test('public link: mọi user đã đăng nhập xem được, kể cả org khác', async () => {
    await share('bob', 'bob-notes', { subject: 'public', relation: 'viewer' })
    expect((await view('hank', 'bob-notes')).status).toBe(200)
  })

  test('public link chỉ ở mức viewer', async () => {
    const res = await share('bob', 'bob-notes', { subject: 'public', relation: 'editor' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('public_is_view_only')
  })

  test('đổi mức chia sẻ: thay mức cũ chứ không cộng dồn', async () => {
    await share('bob', 'draft', { subject: 'user:carol', relation: 'editor' })
    const shares = await api().get('/documents/draft/shares').set(as('bob'))
    expect(shares.body.filter(s => s.subject === 'user:carol')).toEqual([
      { relation: 'editor', subject: 'user:carol', expiresAt: null },
    ])
  })

  test('gỡ chia sẻ → mất quyền ngay ở request kế tiếp', async () => {
    expect((await view('erin', 'forecast')).status).toBe(200)
    const res = await api().delete('/documents/forecast/shares?subject=user:erin').set(as('dave'))
    expect(res.status).toBe(204)
    expectDenied(await view('erin', 'forecast'), 404)
  })

  test('gỡ chia sẻ không tồn tại → 404', async () => {
    const res = await api().delete('/documents/forecast/shares?subject=user:bob').set(as('dave'))
    expect(res.status).toBe(404)
  })

  test('subject không tồn tại hoặc sai dạng → 400', async () => {
    expect((await share('bob', 'api-spec', { subject: 'user:mallory', relation: 'viewer' })).status).toBe(400)
    expect((await share('bob', 'api-spec', { subject: 'bob', relation: 'viewer' })).status).toBe(400)
    expect((await share('bob', 'api-spec', { subject: 'user:erin', relation: 'owner' })).status).toBe(400)
  })
})

describe('Ai được chia sẻ tiếp', () => {
  test('viewer và commenter không chia sẻ được', async () => {
    expectDenied(await share('erin', 'forecast', { subject: 'user:bob', relation: 'viewer' }), 403)
    expectDenied(await share('carol', 'draft', { subject: 'user:bob', relation: 'viewer' }), 403)
  })

  test('editor là member của org chia sẻ được (intersection editor ∧ member org)', async () => {
    expect((await share('frank', 'api-spec', { subject: 'user:erin', relation: 'viewer' })).status).toBe(201)
  })

  test('khách ngoài org là editor nhưng không chia sẻ tiếp được', async () => {
    expect((await view('gina', 'pricing')).body.capabilities).toMatchObject({ can_edit: true, can_share: false })
    expectDenied(await share('gina', 'pricing', { subject: 'user:hank', relation: 'viewer' }), 403)
  })

  test('người không thấy tài liệu nhận 404 chứ không phải 403', async () => {
    expectDenied(await share('erin', 'api-spec', { subject: 'user:erin', relation: 'editor' }), 404)
  })
})

describe('Chính sách chia sẻ ra ngoài org', () => {
  test('acme cho phép: chia sẻ cho user globex được', async () => {
    expect((await share('dave', 'forecast', { subject: 'user:hank', relation: 'viewer' })).status).toBe(201)
    expect((await view('hank', 'forecast')).status).toBe(200)
  })

  test('globex không cho phép: chia sẻ cho user acme hoặc tạo public link bị từ chối', async () => {
    const toAlice = await share('gina', 'globex-plan', { subject: 'user:alice', relation: 'viewer' })
    expect(toAlice.status).toBe(403)
    expect(toAlice.body.error).toBe('external_sharing_disabled')
    const pub = await share('gina', 'globex-plan', { subject: 'public', relation: 'viewer' })
    expect(pub.body.error).toBe('external_sharing_disabled')
    expectDenied(await view('alice', 'globex-plan'), 404)
  })

  test('không chia sẻ cho nhóm của org khác', async () => {
    const res = await share('gina', 'globex-plan', { subject: 'group:eng', relation: 'viewer' })
    expect(res.status).toBe(400)
  })
})

describe('Chia sẻ có thời hạn (condition not_expired)', () => {
  test('quyền của gina trên pricing hết khi qua expires_at', async () => {
    clock.set('2026-12-30T23:59:00Z')
    expect((await view('gina', 'pricing')).body.capabilities.can_edit).toBe(true)
    clock.set('2026-12-31T00:00:01Z')
    expectDenied(await view('gina', 'pricing'), 404)
    const list = await api().get('/documents').set(as('gina'))
    expect(list.body.map(d => d.id)).not.toContain('pricing')
  })

  test('tạo chia sẻ có hạn qua API', async () => {
    clock.set('2026-11-04T08:00:00Z')
    const res = await share('bob', 'api-spec', { subject: 'user:erin', relation: 'viewer', expiresAt: '2026-11-05T08:00:00Z' })
    expect(res.status).toBe(201)
    expect(res.body.expiresAt).toBe('2026-11-05T08:00:00.000Z')
    expect((await view('erin', 'api-spec')).status).toBe(200)
    clock.set('2026-11-05T08:00:01Z')
    expectDenied(await view('erin', 'api-spec'), 404)
  })

  test('hạn trong quá khứ hoặc sai định dạng → 400', async () => {
    clock.set('2026-11-04T08:00:00Z')
    for (const expiresAt of ['2026-11-01T00:00:00Z', 'ngày mai']) {
      const res = await share('bob', 'api-spec', { subject: 'user:erin', relation: 'viewer', expiresAt })
      expect(res.body.error).toBe('invalid_expiry')
    }
  })
})

describe('Chặn (exclusion: viewer but not blocked)', () => {
  test('chặn thắng cả public link', async () => {
    expectDenied(await view('frank', 'handbook'), 404)
  })

  test('chặn một nhóm ở thư mục cha áp xuống mọi tài liệu con', async () => {
    expectDenied(await view('carol', 'postmortem'), 404)
    expect((await view('frank', 'postmortem')).status).toBe(200)
  })

  test('chỉ owner chặn được; editor thì không', async () => {
    expectDenied(await api().post('/documents/api-spec/blocks').set(as('carol')).send({ subject: 'user:frank' }), 403)
    const res = await api().post('/documents/api-spec/blocks').set(as('bob')).send({ subject: 'user:frank' })
    expect(res.status).toBe(201)
    expectDenied(await view('frank', 'api-spec'), 404)
  })

  test('bỏ chặn trả lại quyền', async () => {
    const res = await api().delete('/documents/handbook/blocks?subject=user:frank').set(as('alice'))
    expect(res.status).toBe(204)
    expect((await view('frank', 'handbook')).status).toBe(200)
  })

  test('chặn trùng → 409; không chặn được public', async () => {
    const dup = await api().post('/documents/handbook/blocks').set(as('alice')).send({ subject: 'user:frank' })
    expect(dup.status).toBe(409)
    const pub = await api().post('/documents/handbook/blocks').set(as('alice')).send({ subject: 'public' })
    expect(pub.status).toBe(400)
  })
})

describe('Ai có quyền (ListUsers) và vì sao (Expand)', () => {
  test('access của api-spec: gồm người có quyền qua nhóm lồng nhau và thư mục cha', async () => {
    const res = await api().get('/documents/api-spec/access').set(as('bob'))
    expect(res.status).toBe(200)
    expect(res.body.public).toBe(false)
    const byUser = Object.fromEntries(res.body.users.map(u => [u.id, u.access]))
    expect(byUser).toEqual({ alice: 'owner', bob: 'owner', carol: 'editor', frank: 'editor' })
  })

  test('access của handbook: public, người bị chặn không được liệt kê', async () => {
    const res = await api().get('/documents/handbook/access').set(as('alice'))
    expect(res.body.public).toBe(true)
    expect(res.body.users.map(u => u.id)).not.toContain('frank')
  })

  test('chỉ người chia sẻ được mới xem danh sách quyền', async () => {
    expectDenied(await api().get('/documents/handbook/access').set(as('erin')), 403)
    expectDenied(await api().get('/documents/handbook/shares').set(as('erin')), 403)
  })

  test('expand viewer của handbook: một tầng userset, chỉ tới thư mục cha', async () => {
    const res = await api().get('/documents/handbook/access/expand?relation=viewer').set(as('alice'))
    expect(res.status).toBe(200)
    const nodes = res.body.root.union.nodes
    expect(nodes.map(n => Object.keys(n.leaf)[0])).toEqual(['users', 'computed', 'tupleToUserset'])
    expect(nodes[2].leaf.tupleToUserset.computed).toEqual([{ userset: 'folder:public#viewer' }])
  })

  test('expand relation không tồn tại → 400', async () => {
    const res = await api().get('/documents/handbook/access/expand?relation=superuser').set(as('alice'))
    expect(res.status).toBe(400)
  })
})

describe('Xem trước khi chia sẻ (contextual tuple)', () => {
  test('trả quyền trước/sau mà không ghi tuple nào', async () => {
    const res = await api()
      .post('/documents/pricing/shares/preview')
      .set(as('dave'))
      .send({ subject: 'user:erin', relation: 'commenter' })
    expect(res.status).toBe(200)
    expect(res.body.before).toEqual({ can_view: false, can_comment: false, can_edit: false, can_share: false })
    expect(res.body.after).toEqual({ can_view: true, can_comment: true, can_edit: false, can_share: false })
    expectDenied(await view('erin', 'pricing'), 404)
  })

  test('xem trước cho thấy chặn vẫn thắng', async () => {
    const res = await api()
      .post('/documents/handbook/shares/preview')
      .set(as('alice'))
      .send({ subject: 'user:frank', relation: 'editor' })
    expect(res.body.after.can_edit).toBe(false)
  })
})

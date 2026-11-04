// Đối chiếu toàn bộ ma trận user × document với oracle viết tay (test/oracle.js), qua HTTP thật.
const { api, as, useSeed } = require('./helpers')
const { DOCUMENTS, expectedRelations } = require('./oracle')

useSeed()

const cases = Object.entries(DOCUMENTS).flatMap(([doc, users]) =>
  Object.entries(users).map(([user, [level, share, why]]) => [doc, user, level, share, why]),
)

describe('Oracle: mức truy cập của từng user trên từng tài liệu', () => {
  test.each(cases)('%s × %s → %s', async (doc, user, level, share) => {
    const res = await api().get(`/documents/${doc}`).set(as(user))
    if (level === 'none') {
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'not_found' })
      return
    }
    expect(res.status).toBe(200)
    const { can_view, ...expected } = expectedRelations(level, share)
    expect(res.body.capabilities).toMatchObject(expected)
  })
})

describe('Oracle: GET /documents trả đúng tập tài liệu xem được', () => {
  const users = Object.keys(Object.values(DOCUMENTS)[0])
  test.each(users)('%s', async user => {
    const expected = Object.entries(DOCUMENTS)
      .filter(([, byUser]) => byUser[user][0] !== 'none')
      .map(([doc, byUser]) => ({ id: doc, access: byUser[user][0] }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const res = await api().get('/documents').set(as(user))
    expect(res.status).toBe(200)
    const actual = res.body.map(d => ({ id: d.id, access: d.access })).sort((a, b) => a.id.localeCompare(b.id))
    expect(actual).toEqual(expected)
  })
})

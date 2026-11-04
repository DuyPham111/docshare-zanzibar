// Đối chiếu engine tự viết với OpenFGA thật trên toàn bộ seed: mọi user × mọi object × mọi relation can_*.
// Chỉ chạy khi có FGA_API_URL (npm run test:openfga).
const authz = require('../src/authz')
const db = require('../src/db')
const { seedTuples } = require('../src/authz/seedTuples')

const run = process.env.FGA_API_URL ? describe : describe.skip

const CONTEXTS = {
  'hôm nay (2026-11-04)': '2026-11-04T00:00:00.000Z',
  'sau hạn chia sẻ của gina (2027-01-01)': '2027-01-01T00:00:00.000Z',
}

run('Parity: LocalEngine và OpenFGA cho cùng kết quả', () => {
  const local = authz.createEngine('local')
  const openfga = authz.createEngine('openfga')

  beforeAll(async () => {
    db.resetDb()
    await Promise.all([local.reset(seedTuples()), openfga.reset(seedTuples())])
  })

  const users = () => db.listUsers().map(u => `user:${u.id}`)
  const objects = () => [
    ...db.listDocuments().map(d => `document:${d.id}`),
    ...db.listFolders().map(f => `folder:${f.id}`),
    ...db.listGroups().map(g => `group:${g.id}`),
  ]
  const relations = object => authz.relationsOf(object.split(':')[0]).filter(r => r.startsWith('can_') || r === 'member')

  test.each(Object.entries(CONTEXTS))('Check, thời điểm %s', async (label, now) => {
    const checks = users().flatMap(user =>
      objects().flatMap(object => relations(object).map(relation => ({ user, relation, object, context: { current_time: now } }))),
    )
    const [a, b] = await Promise.all([local.batchCheck(checks), openfga.batchCheck(checks)])
    const diff = checks.filter((_, i) => a[i] !== b[i]).map(c => `${c.object}#${c.relation}@${c.user}`)
    expect(diff).toEqual([])
    expect(checks.length).toBeGreaterThan(500)
  })

  test.each(['document', 'folder', 'group'])('ListObjects can_view %s cho từng user', async type => {
    const context = { current_time: CONTEXTS['hôm nay (2026-11-04)'] }
    for (const user of users()) {
      const [a, b] = await Promise.all([
        local.listObjects({ user, relation: 'can_view', type, context }),
        openfga.listObjects({ user, relation: 'can_view', type, context }),
      ])
      expect({ user, objects: a }).toEqual({ user, objects: b })
    }
  })

  test('ListUsers can_view cho từng tài liệu', async () => {
    const context = { current_time: CONTEXTS['hôm nay (2026-11-04)'] }
    for (const object of objects().filter(o => o.startsWith('document:'))) {
      const [a, b] = await Promise.all([
        local.listUsers({ object, relation: 'can_view', context }),
        openfga.listUsers({ object, relation: 'can_view', context }),
      ])
      expect({ object, ...a }).toEqual({ object, ...b })
    }
  })

  test('Expand mọi relation trực tiếp của tài liệu', async () => {
    for (const object of objects().filter(o => o.startsWith('document:'))) {
      for (const relation of ['owner', 'editor', 'viewer', 'blocked']) {
        const [a, b] = await Promise.all([local.expand({ object, relation }), openfga.expand({ object, relation })])
        expect(normalize(a)).toEqual(normalize(b))
      }
    }
  })
})

// OpenFGA không cam kết thứ tự user trong lá; sắp xếp để so sánh.
function normalize(node) {
  return JSON.parse(JSON.stringify(node), (key, value) => (key === 'users' && Array.isArray(value) ? [...value].sort() : value))
}

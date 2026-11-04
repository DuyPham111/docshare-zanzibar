// Test mức engine trên một model nhỏ, chạy với engine tự viết và (nếu có FGA_API_URL) với OpenFGA thật.
// Cùng một bộ kỳ vọng cho hai engine: engine tự viết phải cư xử như OpenFGA ở các ca biên.
const { transformer } = require('@openfga/syntax-transformer')
const { LocalEngine } = require('../src/authz/engine/local')
const { OpenFgaEngine } = require('../src/authz/engine/openfga')

const model = transformer.transformDSLToJSONObject(`
model
  schema 1.1
type user
type team
  relations
    define member: [user, team#member]
type doc
  relations
    define parent: [doc]
    define owner: [user]
    define viewer: [user, user:*, team#member, user with in_window] or owner or viewer from parent
    define banned: [user]
    define reviewer: [user]
    define can_view: viewer but not banned
    define can_review: reviewer and viewer
condition in_window(now: timestamp, until: timestamp) {
  now < until
}
`)

const engines = [['local', () => new LocalEngine(model)]]
if (process.env.FGA_API_URL) engines.push(['openfga', () => new OpenFgaEngine(model, { apiUrl: process.env.FGA_API_URL })])

const t = (object, relation, user, condition) => ({ object, relation, user, ...(condition && { condition }) })
const NOW = { now: '2026-11-04T00:00:00Z' }

describe.each(engines)('Engine %s', (name, create) => {
  let e
  const check = (user, relation, object, extra = {}) => e.check({ user, relation, object, context: NOW, ...extra })

  beforeEach(async () => {
    e = create()
    await e.reset([
      t('team:a', 'member', 'user:ann'),
      t('team:b', 'member', 'team:a#member'),
      t('doc:root', 'owner', 'user:ola'),
      t('doc:child', 'parent', 'doc:root'),
      t('doc:pub', 'viewer', 'user:*'),
      t('doc:pub', 'banned', 'user:ben'),
      t('doc:team', 'viewer', 'team:b#member'),
      t('doc:rev', 'viewer', 'user:rex'),
      t('doc:rev', 'reviewer', 'user:rex'),
      t('doc:rev', 'reviewer', 'user:ray'),
      t('doc:tmp', 'viewer', 'user:tim', { name: 'in_window', context: { until: '2026-11-05T00:00:00Z' } }),
    ])
  })

  test('computed userset + tuple-to-userset: owner của doc cha xem được doc con', async () => {
    expect(await check('user:ola', 'can_view', 'doc:child')).toBe(true)
    expect(await check('user:ann', 'can_view', 'doc:child')).toBe(false)
  })

  test('userset lồng: ann ∈ team:a ⊂ team:b', async () => {
    expect(await check('user:ann', 'can_view', 'doc:team')).toBe(true)
  })

  test('userset làm subject: team:a#member có phải member của team:b', async () => {
    expect(await check('team:a#member', 'member', 'team:b')).toBe(true)
    expect(await check('team:b#member', 'member', 'team:a')).toBe(false)
  })

  test('wildcard khớp mọi user; exclusion thắng wildcard', async () => {
    expect(await check('user:zoe', 'can_view', 'doc:pub')).toBe(true)
    expect(await check('user:ben', 'can_view', 'doc:pub')).toBe(false)
  })

  test('intersection: cần cả reviewer và viewer', async () => {
    expect(await check('user:rex', 'can_review', 'doc:rev')).toBe(true)
    expect(await check('user:ray', 'can_review', 'doc:rev')).toBe(false)
  })

  test('condition: đúng hạn thì có quyền, quá hạn thì mất', async () => {
    expect(await check('user:tim', 'can_view', 'doc:tmp')).toBe(true)
    expect(await check('user:tim', 'can_view', 'doc:tmp', { context: { now: '2026-11-06T00:00:00Z' } })).toBe(false)
  })

  test('condition: giá trị trong tuple thắng giá trị client gửi trong context', async () => {
    const context = { now: '2026-11-06T00:00:00Z', until: '2099-01-01T00:00:00Z' }
    expect(await check('user:tim', 'can_view', 'doc:tmp', { context })).toBe(false)
  })

  test('contextual tuple chỉ có hiệu lực trong request đó', async () => {
    const contextualTuples = [t('doc:root', 'viewer', 'user:zed')]
    expect(await check('user:zed', 'can_view', 'doc:child', { contextualTuples })).toBe(true)
    expect(await check('user:zed', 'can_view', 'doc:child')).toBe(false)
  })

  test('chu trình nhóm không làm treo Check', async () => {
    await e.write({ writes: [t('team:a', 'member', 'team:b#member')] })
    expect(await check('user:ann', 'member', 'team:b')).toBe(true)
    expect(await check('user:nobody', 'member', 'team:a')).toBe(false)
  })

  test('ghi tuple sai type restriction bị từ chối', async () => {
    await expect(e.write({ writes: [t('doc:x', 'banned', 'user:*')] })).rejects.toMatchObject({ code: 'invalid_tuple' })
    await expect(e.write({ writes: [t('doc:x', 'owner', 'team:a#member')] })).rejects.toMatchObject({ code: 'invalid_tuple' })
    await expect(e.write({ writes: [t('doc:x', 'can_view', 'user:ann')] })).rejects.toMatchObject({ code: 'invalid_tuple' })
  })

  test('ghi trùng và xóa tuple không tồn tại bị từ chối', async () => {
    await expect(e.write({ writes: [t('doc:pub', 'viewer', 'user:*')] })).rejects.toMatchObject({ code: 'tuple_exists' })
    await expect(e.write({ deletes: [t('doc:pub', 'viewer', 'user:ann')] })).rejects.toMatchObject({ code: 'tuple_not_found' })
  })

  test('ListObjects và ListUsers', async () => {
    expect(await e.listObjects({ user: 'user:ola', relation: 'can_view', type: 'doc', context: NOW })).toEqual([
      'doc:child',
      'doc:pub',
      'doc:root',
    ])
    expect(await e.listUsers({ object: 'doc:team', relation: 'can_view', context: NOW })).toEqual({
      users: ['user:ann'],
      public: false,
    })
    expect(await e.listUsers({ object: 'doc:pub', relation: 'can_view', context: NOW })).toEqual({ users: [], public: true })
  })

  test('Read và ReadChanges', async () => {
    await e.write({ deletes: [t('doc:rev', 'reviewer', 'user:ray')] })
    expect((await e.read({ object: 'doc:rev', relation: 'reviewer' })).map(x => x.user)).toEqual(['user:rex'])
    const last = (await e.readChanges({ type: 'doc' })).at(-1)
    expect(last).toMatchObject({ operation: 'TUPLE_OPERATION_DELETE', tuple_key: { object: 'doc:rev', user: 'user:ray' } })
  })

  test('Expand trả cây userset một tầng', async () => {
    const tree = await e.expand({ object: 'doc:child', relation: 'viewer' })
    expect(tree.root.union.nodes[2].leaf.tupleToUserset).toEqual({
      tupleset: 'doc:child#parent',
      computed: [{ userset: 'doc:root#viewer' }],
    })
  })
})

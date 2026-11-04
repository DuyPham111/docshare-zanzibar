// Chia sẻ, chặn, xem ai có quyền: dùng chung cho folder và document.
// Tuple chia sẻ chỉ nằm trong Zanzibar (nguồn sự thật duy nhất), db không giữ bản sao.
const db = require('../db')
const authz = require('../authz')
const clock = require('../clock')
const { enforce } = require('./access')
const { tuplesOf, parseSubject, formatSubject } = require('./tuples')
const { HttpError, badRequest, notFound, conflict } = require('../errors')

const SHARE_RELATIONS = ['viewer', 'commenter', 'editor']
const LISTED_RELATIONS = ['owner', ...SHARE_RELATIONS, 'blocked']
// Mức truy cập hiển thị ở "Who has access", cao nhất trước.
const ACCESS_LEVELS = {
  document: [['can_delete', 'owner'], ['can_edit', 'editor'], ['can_comment', 'commenter'], ['can_view', 'viewer']],
  folder: [['can_delete', 'owner'], ['can_edit', 'editor'], ['can_view', 'viewer']],
}
const PREVIEW_RELATIONS = {
  document: ['can_view', 'can_comment', 'can_edit', 'can_share'],
  folder: ['can_view', 'can_create', 'can_edit', 'can_share'],
}

/** @param {'folder' | 'document'} kind @param {string} id */
function loadResource(kind, id) {
  const row = kind === 'folder' ? db.findFolder(id) : db.findDocument(id)
  if (!row) throw notFound()
  return { row, object: `${kind}:${id}`, org: db.findOrg(row.orgId) }
}

const externalSharingDisabled = () => new HttpError(403, 'external_sharing_disabled')

/**
 * Kiểm subject do client gửi: phải tồn tại; group phải cùng org; user ngoài org hoặc public link
 * chỉ được phép khi org bật chia sẻ ra ngoài (chính sách của org, nằm trong db).
 */
function resolveSubject(subject, org, { allowPublic }) {
  const parsed = parseSubject(subject)
  if (!parsed) throw badRequest('invalid_subject')
  if (parsed.kind === 'public') {
    if (!allowPublic) throw badRequest('invalid_subject')
    if (!org.allowExternalSharing) throw externalSharingDisabled()
    return parsed
  }
  if (parsed.kind === 'group') {
    const group = db.findGroup(parsed.id)
    if (!group || group.orgId !== org.id) throw badRequest('invalid_subject')
    return parsed
  }
  const target = db.findUser(parsed.id)
  if (!target) throw badRequest('invalid_subject')
  if (target.orgId !== org.id && !org.allowExternalSharing) throw externalSharingDisabled()
  return parsed
}

/** Dựng tuple chia sẻ; có expiresAt thì gắn condition not_expired (ABAC trên tuple). */
function shareTuple(object, { subject, relation, expiresAt }, org) {
  if (!SHARE_RELATIONS.includes(relation)) throw badRequest('invalid_relation')
  const parsed = resolveSubject(subject, org, { allowPublic: true })
  if (parsed.kind === 'public' && relation !== 'viewer') throw badRequest('public_is_view_only')
  const tuple = { object, relation, user: parsed.tupleUser }
  if (expiresAt === undefined || expiresAt === null) return { tuple, parsed }

  const at = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN
  if (Number.isNaN(at) || at <= clock.now().getTime()) throw badRequest('invalid_expiry')
  if (parsed.kind === 'public') throw badRequest('invalid_expiry')
  tuple.condition = { name: 'not_expired', context: { expires_at: new Date(at).toISOString() } }
  return { tuple, parsed }
}

const directShares = async (object, tupleUser) =>
  (await tuplesOf(object)).filter(t => SHARE_RELATIONS.includes(t.relation) && t.user === tupleUser)

const present = t => ({
  relation: t.relation,
  subject: formatSubject(t.user),
  expiresAt: t.condition?.context?.expires_at ?? null,
})

async function listShares(user, kind, id) {
  const { object } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  return (await tuplesOf(object)).filter(t => LISTED_RELATIONS.includes(t.relation)).map(present)
}

/** Chia sẻ (hoặc đổi mức chia sẻ) cho một subject. Mỗi subject giữ một mức chia sẻ trực tiếp. */
async function share(user, kind, id, body = {}) {
  const { object, org } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  const { tuple } = shareTuple(object, body, org)

  const existing = await directShares(object, tuple.user)
  const same = existing.find(t => t.relation === tuple.relation)
  const others = existing.filter(t => t !== same)
  // Một write không được vừa xóa vừa ghi cùng khóa tuple: gia hạn cùng relation thì xóa riêng trước.
  if (same) await authz.write({ deletes: [same] })
  await authz.write({ writes: [tuple], deletes: others })
  return present(tuple)
}

async function unshare(user, kind, id, subject) {
  const { object } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  const parsed = parseSubject(subject)
  if (!parsed) throw badRequest('invalid_subject')
  const existing = await directShares(object, parsed.tupleUser)
  if (!existing.length) throw notFound()
  await authz.write({ deletes: existing })
}

async function block(user, kind, id, { subject } = {}) {
  const { object, org } = loadResource(kind, id)
  await enforce(user, 'can_block', object)
  // Chặn được cả khách ngoài org đang có quyền, nên không áp chính sách chia sẻ ra ngoài ở đây.
  const parsed = parseSubject(subject)
  if (!parsed || parsed.kind === 'public') throw badRequest('invalid_subject')
  if (parsed.kind === 'group' && db.findGroup(parsed.id)?.orgId !== org.id) throw badRequest('invalid_subject')
  if (parsed.kind === 'user' && !db.findUser(parsed.id)) throw badRequest('invalid_subject')
  const tuple = { object, relation: 'blocked', user: parsed.tupleUser }
  if ((await authz.read(tuple)).length) throw conflict('already_blocked')
  await authz.write({ writes: [tuple] })
  return present(tuple)
}

async function unblock(user, kind, id, subject) {
  const { object } = loadResource(kind, id)
  await enforce(user, 'can_block', object)
  const parsed = parseSubject(subject)
  if (!parsed) throw badRequest('invalid_subject')
  const tuple = { object, relation: 'blocked', user: parsed.tupleUser }
  if (!(await authz.read(tuple)).length) throw notFound()
  await authz.write({ deletes: [tuple] })
}

/** "Who has access": ListUsers của Zanzibar, kể cả người có quyền qua nhóm lồng nhau hay thư mục cha. */
async function access(user, kind, id) {
  const { object } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  const levels = ACCESS_LEVELS[kind]
  const results = await Promise.all(levels.map(([relation]) => authz.listUsers(object, relation)))
  const best = new Map()
  levels.forEach(([, level], i) => results[i].users.forEach(u => best.has(u) || best.set(u, level)))
  return {
    public: results[levels.length - 1].public,
    users: [...best].map(([id, level]) => ({ id, name: db.findUser(id)?.name ?? id, access: level })),
  }
}

/** Expand: cây userset một tầng, giải thích quyền đến từ đâu (trực tiếp, kế thừa, nhóm). */
async function expand(user, kind, id, relation) {
  const { object } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  if (typeof relation !== 'string' || !authz.relationsOf(kind).includes(relation)) throw badRequest('invalid_relation')
  return authz.expand(object, relation)
}

/**
 * Xem trước một lần chia sẻ bằng contextual tuple: Zanzibar trả lời "nếu có tuple này thì sao"
 * mà không ghi gì. Chỉ cho subject là user cụ thể.
 */
async function preview(user, kind, id, body = {}) {
  const { object, org } = loadResource(kind, id)
  await enforce(user, 'can_share', object)
  const { tuple, parsed } = shareTuple(object, body, org)
  if (parsed.kind !== 'user') throw badRequest('preview_requires_user')

  const relations = PREVIEW_RELATIONS[kind]
  const ask = contextualTuples =>
    Promise.all(relations.map(r => authz.check(parsed.id, r, object, { contextualTuples })))
  const [before, after] = await Promise.all([ask([]), ask([tuple])])
  const asMap = values => Object.fromEntries(relations.map((r, i) => [r, values[i]]))
  return { subject: body.subject, relation: body.relation, before: asMap(before), after: asMap(after) }
}

module.exports = { listShares, share, unshare, block, unblock, access, expand, preview }

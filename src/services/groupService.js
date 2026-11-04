// Nhóm lồng nhau. Thành viên nhóm chỉ nằm trong Zanzibar: group:eng#member@group:backend#member.
const db = require('../db')
const authz = require('../authz')
const { enforce, capabilities } = require('./access')
const { tuplesOf, parseSubject, formatSubject } = require('./tuples')
const { badRequest, notFound, conflict } = require('../errors')

function loadGroup(id) {
  const group = db.findGroup(id)
  if (!group) throw notFound()
  return group
}

async function list(user) {
  const ids = await authz.listObjects(user.id, 'can_view', 'group')
  const groups = db.listGroups().filter(g => ids.includes(g.id))
  const member = await authz.batchCheck(user.id, groups.map(g => ({ relation: 'member', object: `group:${g.id}` })))
  return groups.map((g, i) => ({ ...g, isMember: member[i] }))
}

async function get(user, id) {
  const group = loadGroup(id)
  const object = `group:${id}`
  await enforce(user, 'can_view', object)
  const tuples = await tuplesOf(object)
  const subjects = rel => tuples.filter(t => t.relation === rel).map(t => formatSubject(t.user))
  // effectiveMembers: mọi user là member, kể cả qua nhóm con nhiều tầng (ListUsers).
  const { users } = await authz.listUsers(object, 'member')
  return {
    ...group,
    managers: subjects('manager'),
    members: subjects('member'),
    effectiveMembers: users,
    capabilities: await capabilities(user, object, ['can_manage']),
  }
}

async function create(user, { name } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw badRequest('invalid_name')
  await enforce(user, 'member', `org:${user.orgId}`)
  const group = { id: db.newId('g'), name: name.trim(), orgId: user.orgId }
  const object = `group:${group.id}`
  await authz.write({
    writes: [
      { object, relation: 'org', user: `org:${group.orgId}` },
      { object, relation: 'manager', user: `user:${user.id}` },
    ],
  })
  return db.insert('groups', group)
}

/** Thêm user hoặc cả một nhóm. Nhóm con phải cùng org và không tạo chu trình. */
async function addMember(user, id, { subject } = {}) {
  const group = loadGroup(id)
  const object = `group:${id}`
  await enforce(user, 'can_manage', object)

  const parsed = parseSubject(subject)
  if (!parsed || parsed.kind === 'public') throw badRequest('invalid_subject')
  const target = parsed.kind === 'user' ? db.findUser(parsed.id) : db.findGroup(parsed.id)
  if (!target || target.orgId !== group.orgId) throw badRequest('invalid_subject')
  if (parsed.kind === 'group') {
    // Thêm Y vào X tạo chu trình nếu X đã (trực tiếp hoặc gián tiếp) nằm trong Y. Hỏi chính Zanzibar:
    // userset group:X#member có phải member của group:Y không.
    if (parsed.id === id || (await authz.checkSubject(`${object}#member`, 'member', `group:${parsed.id}`)))
      throw conflict('cycle')
  }

  const tuple = { object, relation: 'member', user: parsed.tupleUser }
  if ((await authz.read(tuple)).length) throw conflict('already_member')
  await authz.write({ writes: [tuple] })
  return { subject: formatSubject(tuple.user) }
}

async function removeMember(user, id, subject) {
  loadGroup(id)
  const object = `group:${id}`
  await enforce(user, 'can_manage', object)
  const parsed = parseSubject(subject)
  if (!parsed || parsed.kind === 'public') throw badRequest('invalid_subject')
  const tuple = { object, relation: 'member', user: parsed.tupleUser }
  if (!(await authz.read(tuple)).length) throw notFound()
  // Xóa một tuple là thu hồi mọi quyền có được qua nhóm này, ở mọi thư mục/tài liệu, ngay lập tức.
  await authz.write({ deletes: [tuple] })
}

module.exports = { list, get, create, addMember, removeMember }

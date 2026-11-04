// Org (tenant) và nhật ký thay đổi quyền (Watch / ReadChanges của Zanzibar) cho admin của org.
const db = require('../db')
const authz = require('../authz')
const { enforce } = require('./access')
const { notFound } = require('../errors')

const CHANGES_LIMIT = 100

function loadOrg(id) {
  const org = db.findOrg(id)
  if (!org) throw notFound()
  return org
}

async function me(user) {
  const groups = await authz.listObjects(user.id, 'member', 'group')
  const isAdmin = await authz.check(user.id, 'admin', `org:${user.orgId}`)
  return { ...user, org: db.findOrg(user.orgId), isAdmin, groups }
}

async function get(user, id) {
  const org = loadOrg(id)
  await enforce(user, 'member', `org:${id}`)
  const isAdmin = await authz.check(user.id, 'admin', `org:${id}`)
  return { ...org, isAdmin, members: db.listUsers().filter(u => u.orgId === id).map(u => ({ id: u.id, name: u.name })) }
}

// org của object trong một thay đổi; object đã bị xóa khỏi db thì không xác định được nên bị bỏ qua.
function orgOf(object) {
  const [type, id] = object.split(':')
  if (type === 'org') return id
  if (type === 'document') return db.findDocument(id)?.orgId
  if (type === 'folder') return db.findFolder(id)?.orgId
  if (type === 'group') return db.findGroup(id)?.orgId
  if (type === 'comment') {
    const comment = db.findComment(id)
    return comment && db.findDocument(comment.documentId)?.orgId
  }
  return undefined
}

/** Thay đổi tuple gần nhất thuộc org, mới nhất trước. Chỉ admin của org. */
async function changes(user, id) {
  loadOrg(id)
  await enforce(user, 'admin', `org:${id}`)
  const all = await authz.readChanges()
  return all
    .filter(c => orgOf(c.tuple_key.object) === id)
    .slice(-CHANGES_LIMIT)
    .reverse()
    .map(c => ({
      operation: c.operation === 'TUPLE_OPERATION_DELETE' ? 'delete' : 'write',
      tuple: `${c.tuple_key.object}#${c.tuple_key.relation}@${c.tuple_key.user}`,
      condition: c.tuple_key.condition?.name ?? null,
      timestamp: c.timestamp,
    }))
}

module.exports = { me, get, changes }

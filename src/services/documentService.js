// PEP cho tài liệu. Mọi entry point (route, search, job) đọc/ghi document qua service này.
const db = require('../db')
const authz = require('../authz')
const { enforce, capabilities } = require('./access')
const { tuplesOf } = require('./tuples')
const { badRequest, notFound } = require('../errors')

const CAPABILITIES = ['can_comment', 'can_edit', 'can_share', 'can_delete', 'can_block']
// Mức truy cập cao nhất, đọc từ các relation can_* (không phải từ relation lưu trực tiếp).
const LEVELS = [
  ['can_delete', 'owner'],
  ['can_edit', 'editor'],
  ['can_comment', 'commenter'],
]

const summary = d => ({ id: d.id, title: d.title, folderId: d.folderId, orgId: d.orgId, createdBy: d.createdBy })

function loadDocument(id) {
  const doc = db.findDocument(id)
  if (!doc) throw notFound()
  return doc
}

/** @param {unknown} title */
function validTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.length > 200) throw badRequest('invalid_title')
  return title.trim()
}

/**
 * Danh sách tài liệu người gọi xem được: ListObjects của Zanzibar trả đúng tập này, không lọc sau khi tải.
 * @param {{ id: string }} user
 * @param {{ q?: string, filter?: string }} [query] filter=shared: được chia sẻ (không phải mình tạo); owned: mình tạo
 */
async function list(user, { q, filter } = {}) {
  const ids = await authz.listObjects(user.id, 'can_view', 'document')
  let docs = db.documentsByIds(ids)
  if (q) {
    const needle = String(q).toLowerCase()
    docs = docs.filter(d => d.title.toLowerCase().includes(needle) || d.content.toLowerCase().includes(needle))
  }
  if (filter === 'shared') docs = docs.filter(d => d.createdBy !== user.id)
  if (filter === 'owned') docs = docs.filter(d => d.createdBy === user.id)

  const checks = docs.flatMap(d => LEVELS.map(([relation]) => ({ relation, object: `document:${d.id}` })))
  const results = await authz.batchCheck(user.id, checks)
  return docs.map((d, i) => {
    const level = LEVELS.find((_, j) => results[i * LEVELS.length + j])
    return { ...summary(d), access: level ? level[1] : 'viewer' }
  })
}

async function get(user, id) {
  const doc = loadDocument(id)
  await enforce(user, 'can_view', `document:${id}`)
  return { ...doc, capabilities: await capabilities(user, `document:${id}`, CAPABILITIES) }
}

/** @param {{ id: string }} user @param {{ title?: unknown, content?: unknown, folderId?: unknown }} body */
async function create(user, { title, content = '', folderId } = {}) {
  const cleanTitle = validTitle(title)
  if (typeof content !== 'string') throw badRequest('invalid_content')
  const folder = typeof folderId === 'string' ? db.findFolder(folderId) : undefined
  if (!folder) throw badRequest('invalid_folder')
  await enforce(user, 'can_create', `folder:${folder.id}`)

  // org của tài liệu suy ra từ thư mục chứa nó, không lấy từ body.
  const doc = { id: db.newId('d'), title: cleanTitle, content, orgId: folder.orgId, folderId: folder.id, createdBy: user.id }
  const object = `document:${doc.id}`
  // Dual write: ghi tuple trước; nếu Zanzibar từ chối thì DB chưa có gì để dọn.
  await authz.write({
    writes: [
      { object, relation: 'org', user: `org:${doc.orgId}` },
      { object, relation: 'parent', user: `folder:${folder.id}` },
      { object, relation: 'owner', user: `user:${user.id}` },
    ],
  })
  db.insert('documents', doc)
  return doc
}

/** Sửa nội dung (can_edit) và/hoặc chuyển thư mục (can_edit + can_create ở thư mục đích). */
async function update(user, id, body = {}) {
  const doc = loadDocument(id)
  const object = `document:${id}`
  await enforce(user, 'can_edit', object)

  const patch = {}
  if ('title' in body) patch.title = validTitle(body.title)
  if ('content' in body) {
    if (typeof body.content !== 'string') throw badRequest('invalid_content')
    patch.content = body.content
  }

  if ('folderId' in body && body.folderId !== doc.folderId) {
    const target = typeof body.folderId === 'string' ? db.findFolder(body.folderId) : undefined
    if (!target) throw badRequest('invalid_folder')
    await enforce(user, 'can_create', `folder:${target.id}`)
    if (target.orgId !== doc.orgId) throw badRequest('cross_org_move')
    // Chuyển thư mục = đổi một tuple parent. Quyền kế thừa đổi theo ngay, không phải sửa ACL từng tài liệu.
    await authz.write({
      deletes: [{ object, relation: 'parent', user: `folder:${doc.folderId}` }],
      writes: [{ object, relation: 'parent', user: `folder:${target.id}` }],
    })
    patch.folderId = target.id
  }
  return db.update('documents', id, patch)
}

async function remove(user, id) {
  loadDocument(id)
  await enforce(user, 'can_delete', `document:${id}`)
  await removeTree({ documents: [id] })
}

/**
 * Xóa tài liệu (và comment của nó): xóa tuple trước để quyền mất ngay, sau đó xóa dữ liệu.
 * @param {{ documents: string[], folders?: string[] }} ids
 */
async function removeTree({ documents, folders = [] }) {
  const comments = documents.flatMap(d => db.commentsOf(d).map(c => c.id))
  const objects = [
    ...folders.map(f => `folder:${f}`),
    ...documents.map(d => `document:${d}`),
    ...comments.map(c => `comment:${c}`),
  ]
  const tuples = (await Promise.all(objects.map(tuplesOf))).flat()
  for (let i = 0; i < tuples.length; i += 100) await authz.write({ deletes: tuples.slice(i, i + 100) })
  db.removeWhere('comments', c => comments.includes(c.id))
  db.removeWhere('documents', d => documents.includes(d.id))
  db.removeWhere('folders', f => folders.includes(f.id))
}

module.exports = { list, get, create, update, remove, removeTree, loadDocument, CAPABILITIES }

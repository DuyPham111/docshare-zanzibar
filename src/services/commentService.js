// Comment là object riêng trong Zanzibar: comment#parent@document, comment#author@user.
// Xóa được khi là tác giả hoặc owner của tài liệu (relation can_delete của type comment).
const db = require('../db')
const authz = require('../authz')
const { enforce } = require('./access')
const { loadDocument } = require('./documentService')
const { badRequest, notFound } = require('../errors')

async function list(user, documentId) {
  loadDocument(documentId)
  await enforce(user, 'can_view', `document:${documentId}`)
  const comments = db.commentsOf(documentId)
  const canDelete = await authz.batchCheck(user.id, comments.map(c => ({ relation: 'can_delete', object: `comment:${c.id}` })))
  return comments.map((c, i) => ({ ...c, canDelete: canDelete[i] }))
}

async function create(user, documentId, { body } = {}) {
  loadDocument(documentId)
  await enforce(user, 'can_comment', `document:${documentId}`)
  if (typeof body !== 'string' || !body.trim() || body.length > 2000) throw badRequest('invalid_body')

  const comment = { id: db.newId('c'), documentId, authorId: user.id, body: body.trim(), createdAt: new Date().toISOString() }
  const object = `comment:${comment.id}`
  await authz.write({
    writes: [
      { object, relation: 'parent', user: `document:${documentId}` },
      { object, relation: 'author', user: `user:${user.id}` },
    ],
  })
  return db.insert('comments', comment)
}

async function remove(user, id) {
  const comment = db.findComment(id)
  if (!comment) throw notFound()
  const object = `comment:${id}`
  await enforce(user, 'can_delete', object)
  await authz.write({ deletes: await authz.read({ object }) })
  db.removeWhere('comments', c => c.id === id)
}

module.exports = { list, create, remove }

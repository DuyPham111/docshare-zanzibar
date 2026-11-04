// PEP cho thư mục: cây thư mục nằm trong db, quyền kế thừa theo tuple parent trong Zanzibar.
const db = require('../db')
const authz = require('../authz')
const { enforce, capabilities } = require('./access')
const { removeTree } = require('./documentService')
const { badRequest, notFound } = require('../errors')

const CAPABILITIES = ['can_create', 'can_edit', 'can_share', 'can_delete', 'can_block']

function loadFolder(id) {
  const folder = db.findFolder(id)
  if (!folder) throw notFound()
  return folder
}

/** @param {unknown} name */
function validName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw badRequest('invalid_name')
  return name.trim()
}

/** Mọi thư mục xem được. root = không xem được thư mục cha (điểm bắt đầu cây của người gọi). */
async function list(user) {
  const ids = new Set(await authz.listObjects(user.id, 'can_view', 'folder'))
  return db.foldersByIds([...ids]).map(f => ({ ...f, root: !f.parentId || !ids.has(f.parentId) }))
}

async function get(user, id) {
  const folder = loadFolder(id)
  await enforce(user, 'can_view', `folder:${id}`)

  // Con của thư mục xem được vẫn có thể bị chặn (blocked) riêng: lọc bằng một BatchCheck.
  const folders = db.childFolders(id)
  const documents = db.documentsInFolder(id)
  const visible = await authz.batchCheck(user.id, [
    ...folders.map(f => ({ relation: 'can_view', object: `folder:${f.id}` })),
    ...documents.map(d => ({ relation: 'can_view', object: `document:${d.id}` })),
  ])

  // Breadcrumb chỉ gồm các thư mục cha mà người gọi xem được.
  const ancestors = []
  for (let p = folder.parentId && db.findFolder(folder.parentId); p; p = p.parentId && db.findFolder(p.parentId)) ancestors.unshift(p)
  const ancestorVisible = await authz.batchCheck(user.id, ancestors.map(a => ({ relation: 'can_view', object: `folder:${a.id}` })))

  return {
    ...folder,
    capabilities: await capabilities(user, `folder:${id}`, CAPABILITIES),
    path: ancestors.filter((_, i) => ancestorVisible[i]).map(a => ({ id: a.id, name: a.name })),
    folders: folders.filter((_, i) => visible[i]).map(f => ({ id: f.id, name: f.name })),
    documents: documents.filter((_, i) => visible[folders.length + i]).map(d => ({ id: d.id, title: d.title })),
  }
}

/** @param {{ id: string, orgId: string }} user @param {{ name?: unknown, parentId?: unknown }} body */
async function create(user, { name, parentId = null } = {}) {
  const cleanName = validName(name)
  let orgId = user.orgId
  if (parentId !== null) {
    const parent = typeof parentId === 'string' ? db.findFolder(parentId) : undefined
    if (!parent) throw badRequest('invalid_folder')
    await enforce(user, 'can_create', `folder:${parent.id}`)
    orgId = parent.orgId
  } else {
    // Thư mục gốc ("My Drive") tạo trong org của chính người gọi.
    await enforce(user, 'member', `org:${orgId}`)
  }

  const folder = { id: db.newId('f'), name: cleanName, orgId, parentId, createdBy: user.id }
  const object = `folder:${folder.id}`
  await authz.write({
    writes: [
      { object, relation: 'org', user: `org:${orgId}` },
      { object, relation: 'owner', user: `user:${user.id}` },
      ...(parentId ? [{ object, relation: 'parent', user: `folder:${parentId}` }] : []),
    ],
  })
  return db.insert('folders', folder)
}

const isDescendant = (folderId, ancestorId) => {
  for (let f = db.findFolder(folderId); f; f = f.parentId && db.findFolder(f.parentId)) if (f.id === ancestorId) return true
  return false
}

/** Đổi tên (can_edit) hoặc chuyển chỗ (can_delete ở thư mục + can_create ở đích). */
async function update(user, id, body = {}) {
  const folder = loadFolder(id)
  const object = `folder:${id}`
  await enforce(user, 'can_view', object)
  const patch = {}

  if ('name' in body) {
    await enforce(user, 'can_edit', object)
    patch.name = validName(body.name)
  }

  if ('parentId' in body && body.parentId !== folder.parentId) {
    await enforce(user, 'can_delete', object)
    const writes = []
    if (body.parentId === null) {
      await enforce(user, 'member', `org:${folder.orgId}`)
    } else {
      const target = typeof body.parentId === 'string' ? db.findFolder(body.parentId) : undefined
      if (!target) throw badRequest('invalid_folder')
      await enforce(user, 'can_create', `folder:${target.id}`)
      if (target.orgId !== folder.orgId) throw badRequest('cross_org_move')
      if (isDescendant(target.id, id)) throw badRequest('cycle')
      writes.push({ object, relation: 'parent', user: `folder:${target.id}` })
    }
    const deletes = folder.parentId ? [{ object, relation: 'parent', user: `folder:${folder.parentId}` }] : []
    // Một tuple parent đổi là cả cây con đổi quyền theo.
    await authz.write({ writes, deletes })
    patch.parentId = body.parentId
  }
  return db.update('folders', id, patch)
}

async function remove(user, id) {
  loadFolder(id)
  await enforce(user, 'can_delete', `folder:${id}`)
  const folders = []
  const walk = fid => {
    folders.push(fid)
    db.childFolders(fid).forEach(f => walk(f.id))
  }
  walk(id)
  const documents = folders.flatMap(f => db.documentsInFolder(f).map(d => d.id))
  await removeTree({ documents, folders })
}

module.exports = { list, get, create, update, remove, loadFolder, CAPABILITIES }

// Dữ liệu nghiệp vụ in-memory (tên, nội dung, cây thư mục). Quan hệ phân quyền KHÔNG nằm ở đây
// mà nằm trong Zanzibar (tuple); db chỉ giữ các cạnh cấu trúc (folderId, parentId) cần để hiển thị.
const crypto = require('node:crypto')
const SEED = require('../data/seed.json')

let state

function resetDb() {
  state = structuredClone(SEED)
  delete state.tuples
}

const snapshot = () => structuredClone(state)
/** @param {string} prefix */
const newId = prefix => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

const byId = (list, id) => state[list].find(x => x.id === id)

module.exports = {
  resetDb,
  snapshot,
  newId,
  findOrg: id => byId('orgs', id),
  findUser: id => byId('users', id),
  findGroup: id => byId('groups', id),
  findFolder: id => byId('folders', id),
  findDocument: id => byId('documents', id),
  findComment: id => byId('comments', id),
  listUsers: () => state.users,
  listGroups: () => state.groups,
  listFolders: () => state.folders,
  listDocuments: () => state.documents,
  /** @param {string[]} ids */
  documentsByIds: ids => state.documents.filter(d => ids.includes(d.id)),
  /** @param {string[]} ids */
  foldersByIds: ids => state.folders.filter(f => ids.includes(f.id)),
  childFolders: parentId => state.folders.filter(f => f.parentId === parentId),
  documentsInFolder: folderId => state.documents.filter(d => d.folderId === folderId),
  commentsOf: documentId => state.comments.filter(c => c.documentId === documentId),

  insert(list, row) {
    state[list].push(row)
    return row
  },
  update(list, id, patch) {
    return Object.assign(byId(list, id), patch)
  },
  /** @param {string} list @param {(row: any) => boolean} predicate */
  removeWhere(list, predicate) {
    state[list] = state[list].filter(x => !predicate(x))
  },
}

resetDb()

// Tuple ban đầu = tuple cấu trúc suy ra từ dữ liệu (org, parent, author) + tuple chia sẻ khai báo trong seed.
// Tuple cấu trúc sinh từ cùng bản ghi trong db nên hai nơi không lệch nhau lúc khởi động.
const SEED = require('../../data/seed.json')
const { parseTuple } = require('./tuple')

function seedTuples() {
  const t = (object, relation, user) => ({ object, relation, user })
  return [
    ...SEED.users.map(u => t(`org:${u.orgId}`, 'member', `user:${u.id}`)),
    ...SEED.groups.map(g => t(`group:${g.id}`, 'org', `org:${g.orgId}`)),
    ...SEED.folders.flatMap(f => [
      t(`folder:${f.id}`, 'org', `org:${f.orgId}`),
      t(`folder:${f.id}`, 'owner', `user:${f.createdBy}`),
      ...(f.parentId ? [t(`folder:${f.id}`, 'parent', `folder:${f.parentId}`)] : []),
    ]),
    ...SEED.documents.flatMap(d => [
      t(`document:${d.id}`, 'org', `org:${d.orgId}`),
      t(`document:${d.id}`, 'parent', `folder:${d.folderId}`),
      t(`document:${d.id}`, 'owner', `user:${d.createdBy}`),
    ]),
    ...SEED.comments.flatMap(c => [
      t(`comment:${c.id}`, 'parent', `document:${c.documentId}`),
      t(`comment:${c.id}`, 'author', `user:${c.authorId}`),
    ]),
    ...SEED.tuples.map(x => (typeof x === 'string' ? parseTuple(x) : x)),
  ]
}

module.exports = { seedTuples }

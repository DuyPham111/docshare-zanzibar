// PEP dùng chung: mọi service hỏi Zanzibar qua enforce() trước khi đọc/ghi dữ liệu.
// Quy ước mã: không thấy object (không có can_view) → 404; thấy nhưng thiếu quyền → 403.
const authz = require('../authz')
const audit = require('../audit')
const { notFound, forbidden } = require('../errors')

// Relation quyết định "có được biết object tồn tại không" của từng type.
const VISIBILITY = { document: 'can_view', folder: 'can_view', group: 'can_view', comment: 'can_view', org: 'member' }

/** @param {{ id: string }} user @param {string} relation @param {string} object "type:id" */
async function enforce(user, relation, object) {
  const allow = await authz.check(user.id, relation, object)
  audit.record({ userId: user.id, relation, object, allow })
  if (allow) return
  const visibility = VISIBILITY[object.slice(0, object.indexOf(':'))]
  if (relation !== visibility && (await authz.check(user.id, visibility, object))) throw forbidden()
  throw notFound()
}

/**
 * Bộ cờ quyền cho UI (một BatchCheck thay vì N lần Check). UI chỉ dùng để ẩn/hiện nút;
 * server vẫn enforce lại ở từng thao tác.
 * @param {{ id: string }} user @param {string} object @param {string[]} relations
 */
async function capabilities(user, object, relations) {
  const results = await authz.batchCheck(user.id, relations.map(relation => ({ relation, object })))
  return Object.fromEntries(relations.map((r, i) => [r, results[i]]))
}

module.exports = { enforce, capabilities }

// Ký pháp tuple của Zanzibar: object#relation@user
//   document:spec#viewer@user:bob          user cụ thể
//   document:handbook#viewer@user:*        wildcard: mọi user (public link)
//   folder:eng#editor@group:eng#member     userset: mọi member của group eng

/** @param {string} s "type:id" */
function splitObject(s) {
  const i = s.indexOf(':')
  return { type: s.slice(0, i), id: s.slice(i + 1) }
}

/** @param {string} s "user:bob" | "user:*" | "group:eng#member" */
function parseUser(s) {
  const hash = s.indexOf('#')
  const { type, id } = splitObject(hash === -1 ? s : s.slice(0, hash))
  return { type, id, relation: hash === -1 ? null : s.slice(hash + 1), wildcard: id === '*' }
}

/** @param {string} s "object#relation@user" */
function parseTuple(s) {
  const at = s.indexOf('@')
  const [object, relation] = s.slice(0, at).split('#')
  return { object, relation, user: s.slice(at + 1) }
}

/** @param {{ object: string, relation: string, user: string }} t */
const formatTuple = t => `${t.object}#${t.relation}@${t.user}`

module.exports = { splitObject, parseUser, parseTuple, formatTuple }

// Tiện ích đọc tuple dùng chung giữa các service.
const authz = require('../authz')

/** Mọi tuple có object = `object` (Read API của Zanzibar). @param {string} object */
const tuplesOf = object => authz.read({ object })

/**
 * Đổi subject do client gửi thành user của tuple.
 *   "user:bob" → user:bob,  "group:eng" → group:eng#member,  "public" → user:*
 * @param {unknown} subject
 * @returns {{ kind: 'user' | 'group' | 'public', id: string | null, tupleUser: string } | null}
 */
function parseSubject(subject) {
  if (subject === 'public') return { kind: 'public', id: null, tupleUser: 'user:*' }
  const m = typeof subject === 'string' && /^(user|group):([\w-]+)$/.exec(subject)
  if (!m) return null
  const [, kind, id] = m
  return { kind: /** @type {'user' | 'group'} */ (kind), id, tupleUser: kind === 'group' ? `group:${id}#member` : `user:${id}` }
}

/** Ngược lại của parseSubject, để trả về client. @param {string} tupleUser */
function formatSubject(tupleUser) {
  if (tupleUser === 'user:*') return 'public'
  return tupleUser.endsWith('#member') ? tupleUser.slice(0, -'#member'.length) : tupleUser
}

module.exports = { tuplesOf, parseSubject, formatSubject }

// Audit log cho quyết định phân quyền (JSON Lines ra stdout). Không bao giờ trả lý do deny về client.
// AUDIT_LOG=off|deny|all. Mặc định deny; off khi chạy test.
const MODES = ['off', 'deny', 'all']
const RECENT_LIMIT = 100
const recent = []
let seq = 0

function mode() {
  const value = process.env.AUDIT_LOG ?? (process.env.NODE_ENV === 'test' ? 'off' : 'deny')
  return MODES.includes(value) ? value : 'deny'
}

/** @param {{ userId: string, relation: string, object: string, allow: boolean }} decision */
function record({ userId, relation, object, allow }) {
  const entry = { seq: ++seq, ts: new Date().toISOString(), event: 'authz.check', userId, relation, object, allow }
  recent.push(entry)
  if (recent.length > RECENT_LIMIT) recent.shift()
  const current = mode()
  if (current === 'all' || (current === 'deny' && !allow)) process.stdout.write(`${JSON.stringify(entry)}\n`)
  return entry
}

const recentEntries = (after = 0) => recent.filter(e => e.seq > after)

module.exports = { record, recentEntries }

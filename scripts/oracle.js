// Ghi docs/oracle-matrix.md: bảng kỳ vọng user × document (từ test/oracle.js) đặt cạnh kết quả thật của engine.
//   node scripts/oracle.js                    engine local
//   AUTHZ_ENGINE=openfga node scripts/oracle.js
const fs = require('node:fs')
const path = require('node:path')
const authz = require('../src/authz')
const { resetAll } = require('../src/reset')
const { USERS, DOCUMENTS, ORDER, LEVEL_RELATIONS } = require('../test/oracle')

async function actualLevel(user, doc) {
  const object = `document:${doc}`
  for (const level of [...ORDER].reverse().filter(l => l !== 'none')) {
    if (await authz.check(user, LEVEL_RELATIONS[level], object)) return level
  }
  return 'none'
}

async function main() {
  await resetAll()
  const SHORT = { owner: 'O', editor: 'E', commenter: 'C', viewer: 'V', none: '·' }
  const lines = [
    '# Ma trận quyền: user × tài liệu',
    '',
    `Engine: \`${authz.engine.name}\`. Ký hiệu: O owner, E editor, C commenter, V viewer, · không thấy (404); \`+s\` = chia sẻ tiếp được.`,
    'Mỗi ô là **kỳ vọng viết tay**; nếu engine trả khác, ô ghi `kỳ vọng ≠ thực tế` và in đậm.',
    '',
    `| Tài liệu | ${USERS.join(' | ')} |`,
    `| --- | ${USERS.map(() => ':---:').join(' | ')} |`,
  ]
  let mismatches = 0
  for (const [doc, byUser] of Object.entries(DOCUMENTS)) {
    const cells = []
    for (const user of USERS) {
      const [level, share] = byUser[user]
      const actual = await actualLevel(user, doc)
      const actualShare = await authz.check(user, 'can_share', `document:${doc}`)
      const expected = `${SHORT[level]}${share ? '+s' : ''}`
      const got = `${SHORT[actual]}${actualShare ? '+s' : ''}`
      if (expected !== got) mismatches++
      cells.push(expected === got ? expected : `**${expected} ≠ ${got}**`)
    }
    lines.push(`| ${doc} | ${cells.join(' | ')} |`)
  }
  lines.push('', `Số ô lệch: **${mismatches}** / ${USERS.length * Object.keys(DOCUMENTS).length}.`, '', '## Lý do từng ô có quyền', '')
  for (const [doc, byUser] of Object.entries(DOCUMENTS)) {
    for (const [user, [level, , why]] of Object.entries(byUser)) if (why) lines.push(`- **${doc} × ${user}** (${level}): ${why}`)
  }
  const file = path.join(__dirname, '../docs/oracle-matrix.md')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  console.log(`Đã ghi ${path.relative(process.cwd(), file)}; lệch ${mismatches} ô`)
  process.exit(mismatches ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

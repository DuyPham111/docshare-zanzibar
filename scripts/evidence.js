// Sinh evidence cho bài nộp:
//   docs/evidence/tests-local.md, tests-openfga.md   danh sách từng test và kết quả trên mỗi engine
//   docs/evidence/mutations.md                        cố ý làm sai model, bộ test phải bắt được
// Chạy: node scripts/evidence.js  (cần OpenFGA ở FGA_API_URL hoặc http://localhost:8080 cho phần openfga)
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs/evidence')
const MODEL = path.join(ROOT, 'authz/model.fga')
const FGA_API_URL = process.env.FGA_API_URL || 'http://localhost:8080'

function runJest(env = {}) {
  const file = path.join(os.tmpdir(), `docshare-jest-${Date.now()}.json`)
  spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--json', `--outputFile=${file}`], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'ignore',
  })
  const result = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.unlinkSync(file)
  return result
}

function report(title, result) {
  const lines = [`# ${title}`, '', `Ngày chạy: ${new Date().toISOString()}`, '']
  lines.push(`**${result.numPassedTests} passed, ${result.numFailedTests} failed, ${result.numPendingTests} skipped** / ${result.numTotalTests} tests`, '')
  for (const suite of [...result.testResults].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${path.relative(ROOT, suite.name).replaceAll('\\', '/')}`, '')
    for (const t of suite.assertionResults) {
      const mark = { passed: '✅', failed: '❌' }[t.status] ?? '⏭️'
      lines.push(`- ${mark} ${[...t.ancestorTitles, t.title].join(' › ')}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

const MUTATIONS = [
  ['document can_view bỏ "but not blocked"', '    define can_view: viewer but not blocked\n    define can_comment', '    define can_view: viewer\n    define can_comment'],
  ['document sharer bỏ intersection với org member', 'define sharer: owner or org_editor\n    define can_view: viewer but not blocked\n    define can_comment', 'define sharer: owner or editor\n    define can_view: viewer but not blocked\n    define can_comment'],
  ['condition not_expired luôn đúng', '  current_time < expires_at', '  true'],
  ['folder owner: mọi member org thay vì admin', 'or owner from parent or admin from org', 'or owner from parent or member from org'],
  ['comment can_delete bỏ điều kiện can_view', 'define can_delete: deleter and can_view', 'define can_delete: deleter'],
  ['group can_view bỏ "member from org"', 'define can_view: member or manager or member from org', 'define can_view: member or manager'],
]

function mutations() {
  const original = fs.readFileSync(MODEL, 'utf8')
  const lines = ['# Kiểm tra bộ test bằng cách làm sai model', '', 'Mỗi dòng sửa một luật trong `authz/model.fga`, chạy lại toàn bộ test (engine local), rồi khôi phục.', '', '| Lỗi cố ý | Test đỏ | Ví dụ test bắt được |', '| --- | --- | --- |']
  try {
    for (const [label, from, to] of MUTATIONS) {
      if (!original.includes(from)) throw new Error(`mutation không khớp model: ${label}`)
      fs.writeFileSync(MODEL, original.replace(from, to))
      const result = runJest({ AUTHZ_ENGINE: 'local' })
      const failed = result.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName))
      lines.push(`| ${label} | ${failed.length} | ${failed.slice(0, 2).join('<br>') || '**không test nào bắt được**'} |`)
    }
  } finally {
    fs.writeFileSync(MODEL, original)
  }
  return lines.join('\n') + '\n'
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'tests-local.md'), report('Kết quả test: engine tự viết (local)', runJest({ AUTHZ_ENGINE: 'local', FGA_API_URL: '' })))
fs.writeFileSync(
  path.join(OUT, 'tests-openfga.md'),
  report(`Kết quả test: OpenFGA (${FGA_API_URL}), gồm engine test và parity`, runJest({ AUTHZ_ENGINE: 'openfga', FGA_API_URL })),
)
fs.writeFileSync(path.join(OUT, 'mutations.md'), mutations())
console.log('Đã ghi docs/evidence/tests-local.md, tests-openfga.md, mutations.md')

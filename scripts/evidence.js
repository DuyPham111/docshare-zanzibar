// Sinh evidence cho bài nộp:
//   docs/evidence/tests-local.md, tests-openfga.md   danh sách từng test và kết quả trên mỗi engine
//   docs/evidence/idor.md                             bỏ enforce() ở PEP: request thật và test đỏ trước, xanh sau
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

// Lỗi kiểm quyền ở PEP (code, không phải model): bỏ một lời gọi enforce() để tái hiện bản lỗi.
const DOC_SERVICE = 'src/services/documentService.js'
const PEP_BUGS = [
  {
    label: 'IDOR/BOLA: erin đọc tài liệu không được chia sẻ cho mình',
    from: "  await enforce(user, 'can_view', `document:${id}`)\n  return { ...doc, capabilities",
    to: '  return { ...doc, capabilities',
    request: { method: 'get', url: '/documents/api-spec', user: 'erin' },
    highlight: /404/,
  },
  {
    label: 'Leo thang dọc (BFLA): erin chỉ là viewer của handbook nhưng sửa được',
    from: "  const object = `document:${id}`\n  await enforce(user, 'can_edit', object)\n",
    to: '  const object = `document:${id}`\n',
    request: { method: 'patch', url: '/documents/handbook', user: 'erin', body: { title: 'Bị sửa trái phép' } },
    highlight: /403/,
  },
]

// Gửi một request thật vào app (engine local, seed mới) và trả { status, body }.
const PROBE = `
const request = require('supertest')
const app = require('./src/app')
const { signToken } = require('./src/auth')
const { resetAll } = require('./src/reset')
const { method, url, user, body } = JSON.parse(process.env.PROBE)
resetAll()
  .then(() => request(app)[method](url).set('Authorization', 'Bearer ' + signToken(user)).send(body))
  .then(res => console.log(JSON.stringify({ status: res.status, body: res.body })))
`

function probe(req) {
  const out = spawnSync(process.execPath, ['-e', PROBE], {
    cwd: ROOT,
    env: { ...process.env, AUTHZ_ENGINE: 'local', AUDIT_LOG: 'off', PROBE: JSON.stringify(req) },
    encoding: 'utf8',
  })
  return JSON.parse(out.stdout.trim().split('\n').pop())
}

const shorten = body => JSON.stringify(body, (k, v) => (typeof v === 'string' && v.length > 60 ? `${v.slice(0, 60)}…` : v))

function pepBugs(baseline) {
  const file = path.join(ROOT, DOC_SERVICE)
  const original = fs.readFileSync(file, 'utf8')
  const lines = [
    '# Evidence IDOR/BOLA và leo thang quyền: đỏ trước khi sửa, xanh sau khi sửa',
    '',
    `Mỗi mục tái hiện bản lỗi bằng cách bỏ đúng một lời gọi \`enforce()\` trong \`${DOC_SERVICE}\` (PEP), gửi request thật, chạy toàn bộ test (engine local), rồi khôi phục code và làm lại. Sinh bằng \`npm run evidence\`.`,
    '',
  ]
  try {
    for (const bug of PEP_BUGS) {
      if (!original.includes(bug.from)) throw new Error(`lỗi cố ý không khớp code: ${bug.label}`)
      const { method, url, user, body } = bug.request
      const call = `${method.toUpperCase()} ${url}` + (body ? ` ${JSON.stringify(body)}` : '') + `, token của ${user}`
      const diff = bug.from.split('\n').filter(l => !bug.to.split('\n').includes(l)).map(l => `- ${l}`)

      fs.writeFileSync(file, original.replace(bug.from, bug.to))
      const before = probe(bug.request)
      const failed = runJest({ AUTHZ_ENGINE: 'local' }).testResults.flatMap(s =>
        s.assertionResults.filter(t => t.status === 'failed').map(t => t.fullName),
      )
      // Ví dụ: ưu tiên test kiểm đúng mã từ chối của lỗi này.
      failed.sort((a, b) => bug.highlight.test(b) - bug.highlight.test(a))
      fs.writeFileSync(file, original)
      const after = probe(bug.request)

      lines.push(`## ${bug.label}`, '', `Request: \`${call}\``, '', 'Bản lỗi (bỏ kiểm quyền):', '', '```diff', ...diff, '```', '')
      lines.push('| | Response | Bộ test |', '| --- | --- | --- |')
      lines.push(`| Trước khi sửa | **${before.status}** \`${shorten(before.body)}\` | **${failed.length} test đỏ**, ví dụ: ${failed.slice(0, 3).join('; ')} |`)
      lines.push(`| Sau khi sửa (bản nộp) | **${after.status}** \`${shorten(after.body)}\` | **${baseline.numPassedTests} passed, ${baseline.numFailedTests} failed** |`, '')
    }
  } finally {
    fs.writeFileSync(file, original)
  }
  return lines.join('\n')
}

fs.mkdirSync(OUT, { recursive: true })
const local = runJest({ AUTHZ_ENGINE: 'local', FGA_API_URL: '' })
fs.writeFileSync(path.join(OUT, 'tests-local.md'), report('Kết quả test: engine tự viết (local)', local))
fs.writeFileSync(path.join(OUT, 'idor.md'), pepBugs(local))
fs.writeFileSync(
  path.join(OUT, 'tests-openfga.md'),
  report(`Kết quả test: OpenFGA (${FGA_API_URL}), gồm engine test và parity`, runJest({ AUTHZ_ENGINE: 'openfga', FGA_API_URL })),
)
fs.writeFileSync(path.join(OUT, 'mutations.md'), mutations())
console.log('Đã ghi docs/evidence/tests-local.md, idor.md, tests-openfga.md, mutations.md')

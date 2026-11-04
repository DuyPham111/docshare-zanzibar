// Chạy một lệnh với AUTHZ_ENGINE=openfga sau khi xác nhận OpenFGA đang chạy.
//   node scripts/with-openfga.js jest --runInBand
const { spawnSync } = require('node:child_process')

const url = process.env.FGA_API_URL || 'http://localhost:8080'

async function main() {
  try {
    const res = await fetch(`${url}/healthz`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error(`OpenFGA không phản hồi ở ${url} (${err.message}). Chạy: npm run fga:up`)
    process.exit(1)
  }
  const [cmd, ...args] = process.argv.slice(2)
  const bin = cmd === 'jest' ? require.resolve('jest/bin/jest') : cmd
  const result = spawnSync(process.execPath, [bin, ...args], {
    stdio: 'inherit',
    env: { ...process.env, AUTHZ_ENGINE: 'openfga', FGA_API_URL: url },
  })
  process.exit(result.status ?? 1)
}

main()

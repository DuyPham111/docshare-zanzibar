// Server demo cho buổi thuyết trình: API thật ở /api, giao diện ở /, Swagger UI ở /docs, vài endpoint /dev.
// /dev cấp token cho bất kỳ user nào, nên server này chỉ nghe trên 127.0.0.1 và KHÔNG BAO GIỜ được mount
// vào app production. src/app.js không import file này; image Docker không chứa thư mục demo/.
if (require.main === module) require('../src/load-env')
const path = require('node:path')
const fs = require('node:fs')
const express = require('express')
const swaggerUi = require('swagger-ui-express')
const app = require('../src/app')
const authz = require('../src/authz')
const db = require('../src/db')
const { signToken } = require('../src/auth')
const { resetAll } = require('../src/reset')

if (process.env.NODE_ENV === 'production') throw new Error('demo server không chạy ở production')

const demo = express()
demo.disable('x-powered-by')
demo.use(express.json())

// Tài liệu API: đặc tả OpenAPI là file tĩnh trong docs/, Swagger UI đọc trực tiếp file đó.
// "Try it out" gọi /api/... của chính server demo; lấy token ở /dev/users hoặc npm run token.
demo.get('/openapi.yaml', (req, res) => res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.yaml')))
demo.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    customSiteTitle: 'DocShare · OpenAPI',
    swaggerOptions: { url: '/openapi.yaml', persistAuthorization: true },
  }),
)

const RELATIONS = {
  document: ['can_view', 'can_comment', 'can_edit', 'can_share', 'can_delete', 'can_block'],
  folder: ['can_view', 'can_create', 'can_edit', 'can_share', 'can_delete', 'can_block'],
  group: ['can_view', 'member', 'can_manage'],
}

demo.get('/dev/users', (req, res) => {
  res.json(db.listUsers().map(u => ({ ...u, token: signToken(u.id, { expiresIn: '8h' }) })))
})

demo.get('/dev/subjects', (req, res) => {
  res.json({ users: db.listUsers(), groups: db.listGroups() })
})

// Ma trận quyền của mọi user trên một object: để thấy ngay một thay đổi tuple ảnh hưởng tới ai.
demo.get('/dev/matrix', async (req, res) => {
  const object = String(req.query.object || '')
  const relations = RELATIONS[object.split(':')[0]]
  if (!relations) return res.status(400).json({ error: 'invalid_object' })
  const users = db.listUsers()
  const rows = await Promise.all(
    users.map(async u => ({
      user: u.id,
      org: u.orgId,
      ...Object.fromEntries(
        await Promise.all(relations.map(async r => [r, await authz.check(u.id, r, object)])),
      ),
    })),
  )
  res.json({ object, relations, rows })
})

demo.get('/dev/tuples', async (req, res) => {
  const object = req.query.object ? String(req.query.object) : undefined
  res.json(await authz.read(object ? { object } : {}))
})

demo.get('/dev/model', (req, res) => {
  res.type('text/plain').send(fs.readFileSync(path.join(__dirname, '../authz/model.fga'), 'utf8'))
})

demo.post('/dev/reset', async (req, res) => {
  await resetAll()
  res.json({ ok: true })
})

demo.get('/dev/engine', (req, res) => res.json({ engine: authz.engine.name }))

demo.use(express.static(path.join(__dirname, 'public')))
demo.use('/api', app)

if (require.main === module) {
  const port = Number(process.env.DEMO_PORT) || 3200
  resetAll()
    .then(() =>
      demo.listen(port, '127.0.0.1', () => {
        console.log(`DocShare demo: http://localhost:${port} (engine: ${authz.engine.name})`)
        console.log(`Swagger UI:    http://localhost:${port}/docs`)
      }),
    )
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}

module.exports = demo

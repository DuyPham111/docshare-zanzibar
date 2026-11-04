// Vận hành: health, lỗi body, secret production, audit log, tài liệu API khớp route, server demo tách khỏi app.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const YAML = require('yaml')
const request = require('supertest')
const { MOUNTS } = require('../src/routes')
const { api, as, useSeed } = require('./helpers')

useSeed()

describe('Vận hành', () => {
  test('[P1] /health không cần token, báo engine đang dùng', async () => {
    const res = await api().get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', authzEngine: process.env.AUTHZ_ENGINE || 'local' })
  })

  test('[P2] không lộ framework qua X-Powered-By', async () => {
    const res = await api().get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  test('[P3] JSON lỗi → 400 invalid_json; body quá 20 KB → 413', async () => {
    const bad = await api().post('/documents').set(as('bob')).set('Content-Type', 'application/json').send('{"title":')
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ error: 'invalid_json' })
    const big = await api().post('/documents').set(as('bob')).send({ title: 'x', content: 'a'.repeat(25_000), folderId: 'specs' })
    expect(big.status).toBe(413)
  })

  test('[P4] route không tồn tại → 404 JSON', async () => {
    const res = await api().get('/khong-co').set(as('bob'))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not_found' })
  })

  test('[P5] NODE_ENV=production mà thiếu JWT_SECRET thì app từ chối khởi động', () => {
    const result = spawnSync(process.execPath, ['-e', "require('./src/auth')"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' },
      encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('JWT_SECRET is required')
  })
})

describe('Audit log', () => {
  const capture = async (mode, fn) => {
    const previous = process.env.AUDIT_LOG
    process.env.AUDIT_LOG = mode
    const lines = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      lines.push(String(chunk))
      return true
    })
    try {
      await fn()
    } finally {
      spy.mockRestore()
      process.env.AUDIT_LOG = previous
    }
    return lines.filter(l => l.includes('"authz.check"')).map(l => JSON.parse(l))
  }

  test('[L1] AUDIT_LOG=deny: chỉ ghi lần từ chối, dạng JSON Lines; body trả về không có lý do', async () => {
    let res
    const entries = await capture('deny', async () => {
      await api().get('/documents/handbook').set(as('erin'))
      res = await api().get('/documents/api-spec').set(as('erin'))
    })
    expect(res.body).toEqual({ error: 'not_found' })
    expect(entries).toEqual([expect.objectContaining({ userId: 'erin', relation: 'can_view', object: 'document:api-spec', allow: false })])
  })

  test('[L2] AUDIT_LOG=all ghi cả lần cho phép; off không ghi gì', async () => {
    const all = await capture('all', () => api().get('/documents/handbook').set(as('erin')))
    expect(all.some(e => e.allow)).toBe(true)
    const off = await capture('off', () => api().get('/documents/api-spec').set(as('erin')))
    expect(off).toEqual([])
  })
})

describe('Tài liệu API và server demo', () => {
  // Mọi route khai báo trong Express (đọc từ chính router), dạng "GET /documents/{id}".
  function routes() {
    const ops = ['GET /health']
    for (const [prefix, router] of Object.entries(MOUNTS)) {
      for (const layer of router.stack) {
        if (!layer.route) continue
        const p = (prefix + layer.route.path).replace(/:(\w+)/g, '{$1}').replace(/\/$/, '') || '/'
        for (const method of Object.keys(layer.route.methods)) ops.push(`${method.toUpperCase()} ${p}`)
      }
    }
    return ops.sort()
  }

  function documented() {
    const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'))
    const ops = []
    for (const [p, item] of Object.entries(spec.paths)) {
      const resolved = item.$ref ? spec.components.pathItems[item.$ref.split('/').pop()] : item
      for (const method of ['get', 'post', 'patch', 'put', 'delete']) if (resolved[method]) ops.push(`${method.toUpperCase()} ${p}`)
    }
    return ops.sort()
  }

  test('[D1] mọi route của API đều có trong docs/openapi.yaml và ngược lại', () => {
    expect(documented()).toEqual(routes())
  })

  test('[D2] mọi operation thao tác trên object đều ghi relation Zanzibar cần có (x-relation)', () => {
    const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'))
    const exempt = ['/health', '/me'] // không gắn với một object cụ thể
    const missing = []
    for (const [p, item] of Object.entries(spec.paths)) {
      if (exempt.includes(p)) continue
      const resolved = item.$ref ? spec.components.pathItems[item.$ref.split('/').pop()] : item
      for (const method of ['get', 'post', 'patch', 'delete']) {
        if (resolved[method] && !resolved[method]['x-relation']) missing.push(`${method.toUpperCase()} ${p}`)
      }
    }
    expect(missing).toEqual([])
  })

  test('[S1] app chính không có /dev: cửa cấp token chỉ nằm ở server demo', async () => {
    expect((await api().get('/dev/users')).status).toBe(401)
    expect((await api().get('/dev/users').set(as('alice'))).status).toBe(404)
    const demo = require('../demo/server')
    const res = await request(demo).get('/dev/engine')
    expect(res.status).toBe(200)
  })

  test('[S2] server demo đi qua phân quyền thật ở /api và phục vụ Swagger UI', async () => {
    const demo = require('../demo/server')
    const denied = await request(demo).get('/api/documents/api-spec').set(as('erin'))
    expect(denied.status).toBe(404)
    const spec = await request(demo).get('/openapi.yaml')
    expect(spec.status).toBe(200)
    const docs = await request(demo).get('/docs/')
    expect(docs.status).toBe(200)
    expect(docs.text).toContain('swagger-ui')
  })
})

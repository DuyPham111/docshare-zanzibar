const express = require('express')
const authz = require('./authz')
const { authenticate } = require('./auth')
const { AuthzError } = require('./authz/errors')
const routes = require('./routes')

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '20kb' }))

app.get('/health', (req, res) => res.json({ status: 'ok', authzEngine: authz.engine.name }))

app.use(authenticate)
app.use(routes)

app.use((req, res) => res.status(404).json({ error: 'not_found' }))

const PARSER_ERRORS = { 'entity.parse.failed': 'invalid_json', 'entity.too.large': 'payload_too_large' }
// Lỗi từ Zanzibar mà service chưa chặn trước (vd. hai request ghi cùng tuple gần như cùng lúc).
const AUTHZ_ERRORS = { tuple_exists: [409, 'conflict'], tuple_not_found: [409, 'conflict'], invalid_tuple: [400, 'bad_request'] }

/** @type {import('express').ErrorRequestHandler} */
const errorHandler = (err, req, res, next) => {
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.code || PARSER_ERRORS[err.type] || 'bad_request' })
  }
  if (err instanceof AuthzError && AUTHZ_ERRORS[err.code]) {
    const [status, error] = AUTHZ_ERRORS[err.code]
    return res.status(status).json({ error })
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}
app.use(errorHandler)

module.exports = app

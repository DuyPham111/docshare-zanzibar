const request = require('supertest')
const app = require('../src/app')
const { signToken } = require('../src/auth')
const { resetAll } = require('../src/reset')

const api = () => request(app)
/** Header Authorization của một user. */
const as = userId => ({ Authorization: `Bearer ${signToken(userId)}` })

// Response từ chối phải đúng mã và không chứa dữ liệu của resource.
function expectDenied(res, status) {
  expect(res.status).toBe(status)
  expect(res.body).toEqual({ error: status === 404 ? 'not_found' : 'forbidden' })
}

/** Gọi trong mỗi file test: db và Zanzibar về seed trước từng test. */
const useSeed = () => beforeEach(() => resetAll())

module.exports = { api, as, expectDenied, useSeed }

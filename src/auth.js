// Authentication (không phải trọng tâm): JWT chỉ mang danh tính `sub`. Mọi quyền nằm trong Zanzibar,
// token không chứa role/org/group nên gỡ quyền có hiệu lực ngay, không chờ token hết hạn.
const jwt = require('jsonwebtoken')
const db = require('./db')

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production')
}
const SECRET = process.env.JWT_SECRET || 'docshare-dev-secret'

/** @param {string} sub @param {{ expiresIn?: string | number }} [options] */
function signToken(sub, { expiresIn = '1h' } = {}) {
  return jwt.sign({ sub }, SECRET, { algorithm: 'HS256', expiresIn })
}

function unauthenticated(res, error) {
  res.set('WWW-Authenticate', 'Bearer')
  return res.status(401).json({ error })
}

/** @type {import('express').RequestHandler} */
function authenticate(req, res, next) {
  const [scheme, token] = (req.get('Authorization') || '').split(' ')
  if (scheme !== 'Bearer' || !token) return unauthenticated(res, 'unauthenticated')

  let payload
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] })
  } catch {
    return unauthenticated(res, 'invalid_token')
  }
  const user = db.findUser(String(payload.sub))
  if (!user) return unauthenticated(res, 'invalid_token')
  req.user = user
  next()
}

module.exports = { signToken, authenticate }

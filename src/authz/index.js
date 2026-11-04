// Cổng duy nhất của app tới hệ thống Zanzibar (PDP). Service gọi các hàm ở đây, không gọi engine trực tiếp.
// AUTHZ_ENGINE=local (mặc định, engine tự viết) | openfga (OpenFGA server, cần FGA_API_URL).
const fs = require('node:fs')
const path = require('node:path')
const { transformer } = require('@openfga/syntax-transformer')
const clock = require('../clock')
const { LocalEngine } = require('./engine/local')
const { OpenFgaEngine } = require('./engine/openfga')

const MODEL_PATH = path.join(__dirname, '../../authz/model.fga')
const model = transformer.transformDSLToJSONObject(fs.readFileSync(MODEL_PATH, 'utf8'))

/** @param {string} [name] */
function createEngine(name = process.env.AUTHZ_ENGINE || 'local') {
  if (name === 'local') return new LocalEngine(model)
  if (name === 'openfga') return new OpenFgaEngine(model, { apiUrl: process.env.FGA_API_URL || 'http://localhost:8080' })
  throw new Error(`unknown AUTHZ_ENGINE: ${name}`)
}

const engine = createEngine()

// current_time luôn do server đặt (đè lên mọi giá trị khác), dùng cho condition not_expired.
const ctx = () => ({ current_time: clock.now().toISOString() })
const asUser = userId => `user:${userId}`

/**
 * Check cho một user. contextualTuples: tuple giả định chỉ có trong request này (dùng cho "xem trước khi chia sẻ").
 * @param {string} userId @param {string} relation @param {string} object
 * @param {{ contextualTuples?: any[] }} [options]
 */
const check = (userId, relation, object, { contextualTuples = [] } = {}) =>
  engine.check({ user: asUser(userId), relation, object, context: ctx(), contextualTuples })

/** Check với subject bất kỳ, kể cả userset ("group:eng#member") hoặc wildcard ("user:*"). */
const checkSubject = (subject, relation, object) => engine.check({ user: subject, relation, object, context: ctx() })

/** @param {string} userId @param {Array<{ relation: string, object: string }>} checks */
const batchCheck = (userId, checks) =>
  engine.batchCheck(checks.map(c => ({ user: asUser(userId), relation: c.relation, object: c.object, context: ctx() })))

/** Mọi object của `type` mà user có `relation`; trả id không kèm tiền tố type. */
async function listObjects(userId, relation, type) {
  const objects = await engine.listObjects({ user: asUser(userId), relation, type, context: ctx() })
  return objects.map(o => o.slice(type.length + 1))
}

/** Ai có `relation` trên object: { users: id[], public: boolean }. */
async function listUsers(object, relation) {
  const { users, public: isPublic } = await engine.listUsers({ object, relation, context: ctx() })
  return { users: users.map(u => u.slice('user:'.length)), public: isPublic }
}

const relationsOf = type => Object.keys(model.type_definitions.find(t => t.type === type)?.relations ?? {})

module.exports = {
  model,
  engine,
  createEngine,
  relationsOf,
  check,
  checkSubject,
  batchCheck,
  listObjects,
  listUsers,
  expand: (object, relation) => engine.expand({ object, relation }),
  read: filter => engine.read(filter),
  write: body => engine.write(body),
  readChanges: filter => engine.readChanges(filter),
  reset: tuples => engine.reset(tuples),
  /** Xóa store cũ của các lần chạy trước (chỉ có nghĩa với OpenFGA). */
  pruneStores: async () => (engine.pruneStores ? engine.pruneStores() : 0),
}

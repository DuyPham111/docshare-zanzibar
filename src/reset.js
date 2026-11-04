// Đưa cả db lẫn Zanzibar về seed. Test gọi trong beforeEach; server gọi lúc khởi động (db in-memory).
const db = require('./db')
const authz = require('./authz')
const clock = require('./clock')
const { seedTuples } = require('./authz/seedTuples')

async function resetAll() {
  db.resetDb()
  clock.reset()
  await authz.reset(seedTuples())
}

module.exports = { resetAll }

const app = require('./app')
const authz = require('./authz')
const { resetAll } = require('./reset')

const port = Number(process.env.PORT) || 3000

resetAll()
  .then(() => {
    app.listen(port, () => console.log(`DocShare API on http://localhost:${port} (authz engine: ${authz.engine.name})`))
  })
  .catch(err => {
    console.error('Không khởi tạo được authorization store:', err.message)
    process.exit(1)
  })

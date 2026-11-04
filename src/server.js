require('./load-env') // nạp .env trước khi auth.js đọc JWT_SECRET, authz đọc AUTHZ_ENGINE
const app = require('./app')
const authz = require('./authz')
const { resetAll } = require('./reset')

const port = Number(process.env.PORT) || 3000

// db in-memory: mỗi lần khởi động nạp lại seed vào cả db lẫn Zanzibar (OpenFGA tạo store mới).
resetAll()
  .then(() => authz.pruneStores())
  .then(() => {
    const server = app.listen(port, () =>
      console.log(`DocShare API on http://localhost:${port} (authz engine: ${authz.engine.name})`),
    )
    // Docker gửi SIGTERM khi dừng container: đóng server gọn thay vì chờ bị kill sau 10 giây.
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
  })
  .catch(err => {
    console.error('Không khởi tạo được authorization store:', err.message)
    process.exit(1)
  })

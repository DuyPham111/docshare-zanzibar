// Nạp .env cạnh package.json nếu có (process.loadEnvFile có sẵn từ Node 20.12), không cần thư viện dotenv.
// Chỉ các entry point (server, demo, token) gọi file này; test không nạp .env để kết quả luôn giống nhau.
const fs = require('node:fs')
const path = require('node:path')

const file = path.join(__dirname, '..', '.env')
if (fs.existsSync(file)) process.loadEnvFile(file)

// In JWT của một user để gọi API bằng curl:  npm run token -- bob
const { signToken } = require('../src/auth')

const userId = process.argv[2]
if (!userId) {
  console.error('Cách dùng: npm run token -- <userId>   (alice, bob, carol, dave, erin, frank, gina, hank)')
  process.exit(1)
}
console.log(signToken(userId))

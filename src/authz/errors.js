// Lỗi của tầng authorization (engine), độc lập với HTTP. app.js map sang mã HTTP.
class AuthzError extends Error {
  /** @param {string} code @param {string} [detail] */
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

module.exports = { AuthzError }

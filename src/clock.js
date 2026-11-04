// Đồng hồ của server. Test đặt giờ giả để kiểm quyền chia sẻ có thời hạn mà không phải chờ.
/** @type {number | null} */
let fixed = null

module.exports = {
  now: () => new Date(fixed ?? Date.now()),
  /** @param {string | Date} t */
  set: t => {
    fixed = new Date(t).getTime()
  },
  reset: () => {
    fixed = null
  },
}

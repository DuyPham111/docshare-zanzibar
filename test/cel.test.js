// Bộ đánh giá CEL tối giản của engine tự viết: ép kiểu theo khai báo, fail closed, từ chối cú pháp ngoài tập con.
const { compile, MissingParameter } = require('../src/authz/cel')

const cond = (expression, parameters) => compile({ expression, parameters })
const T = { type_name: 'TYPE_NAME_TIMESTAMP' }
const INT = { type_name: 'TYPE_NAME_INT' }
const STR = { type_name: 'TYPE_NAME_STRING' }
const BOOL = { type_name: 'TYPE_NAME_BOOL' }

describe('CEL subset', () => {
  test('timestamp so sánh theo thời điểm, không theo chuỗi', () => {
    const notExpired = cond('current_time < expires_at', { current_time: T, expires_at: T })
    // So chuỗi thì "2026-11-04T09:00:00+07:00" > "2026-11-04T01:00:00Z", nhưng thực tế là cùng lúc 02:00Z < 03:00Z.
    expect(notExpired({ current_time: '2026-11-04T09:00:00+07:00', expires_at: '2026-11-04T03:00:00Z' })).toBe(true)
    expect(notExpired({ current_time: '2026-11-04T04:00:00Z', expires_at: '2026-11-04T03:00:00Z' })).toBe(false)
  })

  test.each([
    ['a == b', { a: 2, b: 2 }, true],
    ['a != b', { a: 2, b: 3 }, true],
    ['a <= b', { a: 3, b: 3 }, true],
    ['a > b', { a: 3, b: 3 }, false],
    ['a >= b && a < 10', { a: 5, b: 5 }, true],
    ['a > 100 || b == 3', { a: 1, b: 3 }, true],
    ['!(a == b)', { a: 1, b: 2 }, true],
    ['(a < b) && !(b < a)', { a: 1, b: 2 }, true],
  ])('%s với %j → %s', (expression, params, expected) => {
    expect(cond(expression, { a: INT, b: INT })(params)).toBe(expected)
  })

  test('literal chuỗi, số, boolean', () => {
    expect(cond('region == "vn"', { region: STR })({ region: 'vn' })).toBe(true)
    expect(cond('level >= 2', { level: INT })({ level: '3' })).toBe(true)
    expect(cond('trusted == true', { trusted: BOOL })({ trusted: 'true' })).toBe(true)
    expect(cond('trusted == false', { trusted: BOOL })({ trusted: true })).toBe(false)
  })

  test('thiếu tham số → MissingParameter (engine chuyển thành từ chối)', () => {
    const f = cond('current_time < expires_at', { current_time: T, expires_at: T })
    expect(() => f({ current_time: '2026-11-04T00:00:00Z' })).toThrow(MissingParameter)
  })

  test('identifier không khai báo hoặc timestamp sai định dạng → lỗi', () => {
    expect(() => cond('x < y', { x: INT })({ x: 1, y: 2 })).toThrow(/unknown identifier/)
    expect(() => cond('t < u', { t: T, u: T })({ t: 'hôm qua', u: '2026-11-04T00:00:00Z' })).toThrow(/invalid timestamp/)
  })

  test('cú pháp ngoài tập con bị từ chối ngay khi nạp model', () => {
    expect(() => cond('a in [1, 2]', { a: INT })).toThrow(SyntaxError)
    expect(() => cond('a < ', { a: INT })).toThrow(SyntaxError)
    expect(() => cond('(a < 1', { a: INT })).toThrow(/expected \)/)
    expect(() => cond('a < 1 b', { a: INT, b: INT })).toThrow(/unexpected token/)
  })

  test('kiểu tham số chưa hỗ trợ (duration) → lỗi rõ ràng', () => {
    expect(() => cond('d < e', { d: { type_name: 'TYPE_NAME_DURATION' }, e: INT })({ d: '1h', e: 1 })).toThrow(
      /unsupported parameter type/,
    )
  })
})

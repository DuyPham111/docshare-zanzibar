// Bộ đánh giá một tập con của CEL, đủ cho condition trong model: so sánh, &&, ||, !, ngoặc, literal.
// OpenFGA dùng cel-go đầy đủ; engine tự viết chỉ cần phần này. Biểu thức ngoài tập con sẽ bị từ chối khi nạp model.

class MissingParameter extends Error {}

const PARSERS = {
  TYPE_NAME_TIMESTAMP: v => {
    const ms = Date.parse(String(v))
    if (Number.isNaN(ms)) throw new TypeError(`invalid timestamp: ${v}`)
    return ms
  },
  TYPE_NAME_INT: Number,
  TYPE_NAME_UINT: Number,
  TYPE_NAME_DOUBLE: Number,
  TYPE_NAME_STRING: String,
  TYPE_NAME_BOOL: v => v === true || v === 'true',
}

const TOKEN = /\s*(&&|\|\||==|!=|<=|>=|<|>|!|\(|\)|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_]\w*)/y

/** @param {string} src */
function tokenize(src) {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < src.trimEnd().length) {
    const m = TOKEN.exec(src)
    if (!m) throw new SyntaxError(`unsupported CEL near: ${src.slice(TOKEN.lastIndex)}`)
    tokens.push(m[1])
  }
  return tokens
}

// AST: { op, args } | { ident } | { value }
/** @param {string} src */
function parse(src) {
  const tokens = tokenize(src)
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]

  const binary = (next, ops) => () => {
    let left = next()
    while (ops.includes(peek())) left = { op: take(), args: [left, next()] }
    return left
  }
  const primary = () => {
    const t = take()
    if (t === undefined) throw new SyntaxError('unexpected end of expression')
    if (t === '(') {
      const e = or()
      if (take() !== ')') throw new SyntaxError('expected )')
      return e
    }
    if (t === '!') return { op: '!', args: [primary()] }
    if (t === 'true' || t === 'false') return { value: t === 'true' }
    if (t.startsWith('"')) return { value: JSON.parse(t) }
    if (/^\d/.test(t)) return { value: Number(t) }
    return { ident: t }
  }
  const cmp = binary(primary, ['==', '!=', '<', '<=', '>', '>='])
  const and = binary(cmp, ['&&'])
  const or = binary(and, ['||'])

  const ast = or()
  if (i !== tokens.length) throw new SyntaxError(`unexpected token: ${peek()}`)
  return ast
}

const OPS = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '&&': (a, b) => a && b,
  '||': (a, b) => a || b,
  '!': a => !a,
}

/**
 * Biên dịch một condition của model thành hàm (params) => boolean.
 * Tham số được ép kiểu theo khai báo trong model (timestamp so sánh theo thời điểm, không theo chuỗi).
 * @param {{ expression: string, parameters: Record<string, { type_name: string }> }} condition
 */
function compile(condition) {
  const ast = parse(condition.expression)
  /** @param {Record<string, unknown>} params */
  return params => {
    const evaluate = node => {
      if ('value' in node) return node.value
      if ('ident' in node) {
        const type = condition.parameters[node.ident]?.type_name
        if (!type) throw new SyntaxError(`unknown identifier: ${node.ident}`)
        if (params[node.ident] === undefined) throw new MissingParameter(node.ident)
        const parser = PARSERS[type]
        if (!parser) throw new TypeError(`unsupported parameter type: ${type}`)
        return parser(params[node.ident])
      }
      return OPS[node.op](...node.args.map(evaluate))
    }
    return evaluate(ast) === true
  }
}

module.exports = { compile, parse, MissingParameter }

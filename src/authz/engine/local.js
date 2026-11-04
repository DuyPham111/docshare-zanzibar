// Engine Zanzibar tự viết, chạy trong process: lưu tuple trong bộ nhớ và đánh giá luật viết lại userset
// của cùng model OpenFGA (JSON do @openfga/syntax-transformer sinh từ authz/model.fga).
// Mục đích: test chạy không cần Docker, và để đọc được thuật toán Check của Zanzibar trong ~200 dòng.
// API và ngữ nghĩa bám theo OpenFGA để test/parity.test.js đối chiếu hai engine trên cùng dữ liệu.
const { compile, MissingParameter } = require('../cel')
const { splitObject, parseUser, formatTuple } = require('../tuple')
const { AuthzError } = require('../errors')

// Giới hạn độ sâu giải quyết, giống resolve depth mặc định của OpenFGA.
const MAX_DEPTH = 25

/** @typedef {{ object: string, relation: string, user: string, condition?: { name: string, context?: Record<string, unknown> } }} Tuple */
/** @typedef {{ context: Record<string, unknown>, contextual: Map<string, Tuple[]>, ignoreWildcard?: boolean }} Request */

class LocalEngine {
  /** @param {any} model JSON model (schema 1.1) */
  constructor(model) {
    this.name = 'local'
    this.types = new Map(model.type_definitions.map(t => [t.type, t]))
    this.conditions = Object.fromEntries(
      Object.entries(model.conditions ?? {}).map(([name, c]) => [name, { ...c, evaluate: compile(c) }]),
    )
    /** @type {Map<string, Tuple[]>} chỉ mục theo "object#relation", giống cách Zanzibar đọc tuple theo khóa */
    this.tuples = new Map()
    this.changes = []
  }

  /** @param {Tuple[]} [tuples] */
  async reset(tuples = []) {
    this.tuples = new Map()
    this.changes = []
    for (let i = 0; i < tuples.length; i += 100) await this.write({ writes: tuples.slice(i, i + 100) })
  }

  // ---------- Write / Read / ReadChanges ----------

  /** Ghi nguyên tử: kiểm hết rồi mới áp dụng, như một transaction của OpenFGA. @param {{ writes?: Tuple[], deletes?: Tuple[] }} body */
  async write({ writes = [], deletes = [] }) {
    const seen = new Set()
    const once = t => {
      const key = formatTuple(t)
      if (seen.has(key)) throw new AuthzError('invalid_tuple', `duplicate tuple in request: ${key}`)
      seen.add(key)
    }
    for (const t of deletes) {
      once(t)
      if (!this.#find(t)) throw new AuthzError('tuple_not_found', formatTuple(t))
    }
    for (const t of writes) {
      once(t)
      this.#validate(t)
      if (this.#find(t)) throw new AuthzError('tuple_exists', formatTuple(t))
    }

    const timestamp = new Date().toISOString()
    for (const t of deletes) {
      const key = `${t.object}#${t.relation}`
      this.tuples.set(key, this.tuples.get(key).filter(x => x.user !== t.user))
      this.changes.push({ tuple_key: { object: t.object, relation: t.relation, user: t.user }, operation: 'TUPLE_OPERATION_DELETE', timestamp })
    }
    for (const t of writes) {
      const key = `${t.object}#${t.relation}`
      const tuple = { object: t.object, relation: t.relation, user: t.user, ...(t.condition && { condition: t.condition }) }
      this.tuples.set(key, [...(this.tuples.get(key) ?? []), tuple])
      this.changes.push({ tuple_key: tuple, operation: 'TUPLE_OPERATION_WRITE', timestamp })
    }
  }

  /** @param {{ object?: string, relation?: string, user?: string }} [filter] object có thể chỉ là "type:" */
  async read({ object, relation, user } = {}) {
    const all = [...this.tuples.values()].flat()
    return all.filter(
      t =>
        (!object || (object.endsWith(':') ? t.object.startsWith(object) : t.object === object)) &&
        (!relation || t.relation === relation) &&
        (!user || t.user === user),
    )
  }

  /** Watch API của Zanzibar: nhật ký thay đổi tuple. @param {{ type?: string }} [filter] */
  async readChanges({ type } = {}) {
    return this.changes.filter(c => !type || c.tuple_key.object.startsWith(`${type}:`))
  }

  // Tuple chỉ hợp lệ khi khớp type restriction của relation, ví dụ viewer: [user, user:*, group#member, user with not_expired].
  /** @param {Tuple} t */
  #validate(t) {
    const { type, id } = splitObject(t.object)
    const def = this.types.get(type)
    if (!def || !id) throw new AuthzError('invalid_tuple', `unknown object type: ${t.object}`)
    if (!def.relations?.[t.relation]) throw new AuthzError('invalid_tuple', `relation ${type}#${t.relation} not found`)
    const allowed = def.metadata?.relations?.[t.relation]?.directly_related_user_types ?? []
    const u = parseUser(t.user)
    const condition = t.condition?.name ?? null
    if (condition && !this.conditions[condition]) throw new AuthzError('invalid_tuple', `unknown condition ${condition}`)
    const ok = allowed.some(
      r =>
        r.type === u.type &&
        (r.relation ?? null) === u.relation &&
        Boolean(r.wildcard) === u.wildcard &&
        (r.condition ?? null) === condition,
    )
    if (!ok) throw new AuthzError('invalid_tuple', `type restriction violated: ${formatTuple(t)}`)
  }

  /** @param {Tuple} t */
  #find(t) {
    return (this.tuples.get(`${t.object}#${t.relation}`) ?? []).find(x => x.user === t.user)
  }

  // ---------- Check ----------

  /**
   * Check(user, relation, object): user có thuộc userset object#relation không.
   * @param {{ user: string, relation: string, object: string, context?: Record<string, unknown>, contextualTuples?: Tuple[] }} body
   */
  async check({ user, relation, object, context = {}, contextualTuples = [] }) {
    this.#assertRelation(object, relation)
    return this.#check(object, relation, user, this.#request(context, contextualTuples), new Set(), 0)
  }

  /** @param {Array<Parameters<LocalEngine['check']>[0]>} checks */
  async batchCheck(checks) {
    return Promise.all(checks.map(c => this.check(c)))
  }

  /** @param {Record<string, unknown>} context @param {Tuple[]} contextualTuples @returns {Request} */
  #request(context, contextualTuples) {
    const contextual = new Map()
    for (const t of contextualTuples) {
      this.#validate(t)
      const key = `${t.object}#${t.relation}`
      contextual.set(key, [...(contextual.get(key) ?? []), t])
    }
    return { context, contextual }
  }

  /** @param {string} object @param {string} relation */
  #assertRelation(object, relation) {
    const { type } = splitObject(object)
    if (!this.types.get(type)?.relations?.[relation]) throw new AuthzError('invalid_relation', `${type}#${relation}`)
  }

  // Tuple đã lưu + contextual tuple (chỉ tồn tại trong request này), bỏ tuple có condition không thỏa.
  /** @param {string} object @param {string} relation @param {Request} req */
  #tuplesFor(object, relation, req) {
    const key = `${object}#${relation}`
    return [...(this.tuples.get(key) ?? []), ...(req.contextual.get(key) ?? [])].filter(t => this.#conditionHolds(t, req))
  }

  /** @param {Tuple} t @param {Request} req */
  #conditionHolds(t, req) {
    if (!t.condition) return true
    // Giá trị lưu trong tuple thắng giá trị của request (như OpenFGA): client không ghi đè được expires_at.
    const params = { ...req.context, ...t.condition.context }
    try {
      return this.conditions[t.condition.name].evaluate(params)
    } catch (err) {
      if (err instanceof MissingParameter) return false // fail closed
      throw err
    }
  }

  /** @param {string} object @param {string} relation @param {string} user @param {Request} req @param {Set<string>} path @param {number} depth @returns {boolean} */
  #check(object, relation, user, req, path, depth) {
    if (depth > MAX_DEPTH) throw new AuthzError('resolution_too_complex', `${object}#${relation}`)
    const { type } = splitObject(object)
    const rewrite = this.types.get(type)?.relations?.[relation]
    // Relation không tồn tại trên type này (vd. tuple-to-userset trỏ tới type khác): không đóng góp quyền.
    if (!rewrite) return false

    // Phát hiện chu trình (group A chứa B, B chứa A): nhánh đang được giải quyết thì không cho thêm quyền.
    const key = `${object}#${relation}@${user}`
    if (path.has(key)) return false
    path.add(key)
    try {
      return this.#rewrite(rewrite, object, relation, user, req, path, depth)
    } finally {
      path.delete(key)
    }
  }

  /** Luật viết lại userset (userset rewrite) của Zanzibar. @returns {boolean} */
  #rewrite(node, object, relation, user, req, path, depth) {
    const next = n => this.#rewrite(n, object, relation, user, req, path, depth)
    if (node.this) return this.#direct(object, relation, user, req, path, depth)
    if (node.computedUserset) return this.#check(object, node.computedUserset.relation, user, req, path, depth + 1)
    if (node.tupleToUserset) {
      // "viewer from parent": với mỗi tuple object#parent@folder:x, hỏi tiếp folder:x#viewer.
      const { tupleset, computedUserset } = node.tupleToUserset
      return this.#tuplesFor(object, tupleset.relation, req).some(
        t => !parseUser(t.user).relation && this.#check(t.user, computedUserset.relation, user, req, path, depth + 1),
      )
    }
    if (node.union) return node.union.child.some(c => next(c))
    if (node.intersection) return node.intersection.child.every(c => next(c))
    if (node.difference) return next(node.difference.base) && !next(node.difference.subtract)
    throw new AuthzError('unsupported_rewrite', JSON.stringify(node))
  }

  // Quan hệ gán trực tiếp ([user, user:*, group#member]).
  #direct(object, relation, user, req, path, depth) {
    const u = parseUser(user)
    return this.#tuplesFor(object, relation, req).some(t => {
      if (t.user === user) return true
      const tu = parseUser(t.user)
      if (tu.wildcard) return !req.ignoreWildcard && !u.relation && tu.type === u.type
      if (tu.relation) return this.#check(`${tu.type}:${tu.id}`, tu.relation, user, req, path, depth + 1)
      return false
    })
  }

  // ---------- ListObjects / ListUsers / Expand ----------

  // Engine tự viết làm cách đơn giản nhất: lấy mọi object của type có trong tuple rồi Check từng cái.
  // OpenFGA làm reverse expansion (đi ngược đồ thị quan hệ) nên không cần quét hết.
  /** @param {{ user: string, relation: string, type: string, context?: Record<string, unknown>, contextualTuples?: Tuple[] }} body */
  async listObjects({ user, relation, type, context = {}, contextualTuples = [] }) {
    const candidates = new Set()
    for (const t of [...this.tuples.values()].flat()) {
      if (t.object.startsWith(`${type}:`)) candidates.add(t.object)
      const u = parseUser(t.user)
      if (u.type === type && !u.wildcard) candidates.add(`${u.type}:${u.id}`)
    }
    const objects = []
    for (const object of candidates) {
      if (await this.check({ user, relation, object, context, contextualTuples })) objects.push(object)
    }
    return objects.sort()
  }

  /** @param {{ object: string, relation: string, userType?: string, context?: Record<string, unknown> }} body */
  async listUsers({ object, relation, userType = 'user', context = {} }) {
    const candidates = new Set()
    for (const t of [...this.tuples.values()].flat()) {
      const u = parseUser(t.user)
      if (u.type === userType && !u.relation && !u.wildcard) candidates.add(t.user)
    }
    // Như OpenFGA: chỉ liệt kê user có đường quyền không đi qua wildcard; ai chỉ có quyền nhờ public link
    // thì nằm trong cờ `public`. Vẫn phải qua Check đầy đủ để loại người bị blocked.
    this.#assertRelation(object, relation)
    const explicit = { ...this.#request(context, []), ignoreWildcard: true }
    const users = []
    for (const user of candidates) {
      if (this.#check(object, relation, user, explicit, new Set(), 0) && (await this.check({ user, relation, object, context })))
        users.push(user)
    }
    const isPublic = await this.check({ user: `${userType}:*`, relation, object, context })
    return { users: users.sort(), public: isPublic }
  }

  // Expand một tầng, cùng dạng cây với API Expand của OpenFGA.
  /** @param {{ object: string, relation: string }} body */
  async expand({ object, relation }) {
    this.#assertRelation(object, relation)
    const { type } = splitObject(object)
    return { root: this.#expandNode(this.types.get(type).relations[relation], object, relation) }
  }

  #expandNode(node, object, relation) {
    const name = `${object}#${relation}`
    const stored = rel => this.tuples.get(`${object}#${rel}`) ?? []
    if (node.this) return { name, leaf: { users: { users: stored(relation).map(t => t.user) } } }
    if (node.computedUserset) return { name, leaf: { computed: { userset: `${object}#${node.computedUserset.relation}` } } }
    if (node.tupleToUserset) {
      const { tupleset, computedUserset } = node.tupleToUserset
      return {
        name,
        leaf: {
          tupleToUserset: {
            tupleset: `${object}#${tupleset.relation}`,
            computed: stored(tupleset.relation).map(t => ({ userset: `${t.user}#${computedUserset.relation}` })),
          },
        },
      }
    }
    const nodes = c => c.map(n => this.#expandNode(n, object, relation))
    if (node.union) return { name, union: { nodes: nodes(node.union.child) } }
    if (node.intersection) return { name, intersection: { nodes: nodes(node.intersection.child) } }
    if (node.difference) {
      const [base, subtract] = nodes([node.difference.base, node.difference.subtract])
      return { name, difference: { base, subtract } }
    }
    throw new AuthzError('unsupported_rewrite', JSON.stringify(node))
  }
}

module.exports = { LocalEngine }

// Adapter tới OpenFGA server thật (open-source, hiện thực Zanzibar của Auth0/Okta, dự án CNCF).
// Cùng interface với LocalEngine; app không biết đang chạy engine nào.
const { OpenFgaClient, ConsistencyPreference } = require('@openfga/sdk')
const { splitObject } = require('../tuple')
const { AuthzError } = require('../errors')

// HIGHER_CONSISTENCY: đọc thẳng datastore, bỏ cache. Tương đương xin "zookie" mới nhất trong Zanzibar:
// gỡ quyền xong là request kế tiếp thấy ngay (tránh "new enemy problem").
const CONSISTENT = { consistency: ConsistencyPreference.HigherConsistency }
const CHUNK = 100 // giới hạn số tuple trong một write transaction của OpenFGA
const BATCH_LIMIT = 50

/** Lỗi validate từ OpenFGA → AuthzError cùng mã với LocalEngine. */
function mapError(err) {
  const message = String(err?.apiErrorMessage ?? err?.message ?? err)
  if (/already exists/i.test(message)) return new AuthzError('tuple_exists', message)
  if (/did not exist|does not exist/i.test(message)) return new AuthzError('tuple_not_found', message)
  if (/relation .*not found|undefined relation/i.test(message) && err?.apiErrorCode !== 'write_failed_due_to_invalid_input')
    return new AuthzError('invalid_relation', message)
  if (err?.apiErrorCode === 'resolution_too_complex') return new AuthzError('resolution_too_complex', message)
  if (err?.name === 'FgaApiValidationError') return new AuthzError('invalid_tuple', message)
  return err
}

const call = async fn => {
  try {
    return await fn()
  } catch (err) {
    throw mapError(err)
  }
}

const withoutCondition = ({ object, relation, user }) => ({ object, relation, user })

class OpenFgaEngine {
  /** @param {any} model @param {{ apiUrl: string }} options */
  constructor(model, { apiUrl }) {
    this.name = 'openfga'
    this.model = model
    this.client = new OpenFgaClient({ apiUrl })
  }

  // Mỗi lần reset tạo store mới (store = một không gian tuple + model độc lập), xóa store cũ.
  // Test nhờ vậy độc lập nhau mà không phải xóa từng tuple.
  async reset(tuples = []) {
    const previous = this.client.storeId
    const store = await call(() => this.client.createStore({ name: 'docshare' }))
    this.client.storeId = store.id
    const { authorization_model_id: modelId } = await call(() =>
      this.client.writeAuthorizationModel({
        schema_version: this.model.schema_version,
        type_definitions: this.model.type_definitions,
        conditions: this.model.conditions,
      }),
    )
    this.client.authorizationModelId = modelId
    for (let i = 0; i < tuples.length; i += CHUNK) await this.write({ writes: tuples.slice(i, i + CHUNK) })
    if (previous) await this.client.deleteStore({ storeId: previous }).catch(() => {})
  }

  // db của app in-memory nên mỗi lần khởi động là một store mới. Với datastore lưu bền (Postgres),
  // store của các lần chạy trước còn lại: xóa mọi store cùng tên trừ store đang dùng.
  async pruneStores() {
    const stale = []
    let continuationToken
    do {
      const res = await call(() => this.client.listStores({ pageSize: 100, continuationToken }))
      stale.push(...res.stores.filter(s => s.name === 'docshare' && s.id !== this.client.storeId))
      continuationToken = res.continuation_token
    } while (continuationToken)
    for (const store of stale) await this.client.deleteStore({ storeId: store.id })
    return stale.length
  }

  async write({ writes = [], deletes = [] }) {
    if (!writes.length && !deletes.length) return
    await call(() =>
      this.client.write({
        ...(writes.length && { writes }),
        ...(deletes.length && { deletes: deletes.map(withoutCondition) }),
      }),
    )
  }

  async read({ object, relation, user } = {}) {
    const tuples = []
    let continuationToken
    do {
      const res = await call(() =>
        this.client.read({ object, relation, user }, { ...CONSISTENT, pageSize: 100, continuationToken }),
      )
      tuples.push(...res.tuples.map(t => t.key))
      continuationToken = res.continuation_token
    } while (continuationToken)
    return tuples.map(({ object, relation, user, condition }) => ({
      object,
      relation,
      user,
      ...(condition && { condition: { name: condition.name, context: condition.context } }),
    }))
  }

  async readChanges({ type } = {}) {
    const changes = []
    let continuationToken
    for (;;) {
      const res = await call(() => this.client.readChanges(type ? { type } : {}, { pageSize: 100, continuationToken }))
      if (!res.changes.length) break
      changes.push(...res.changes)
      continuationToken = res.continuation_token
    }
    return changes
  }

  async check({ user, relation, object, context = {}, contextualTuples = [] }) {
    const res = await call(() => this.client.check({ user, relation, object, context, contextualTuples }, CONSISTENT))
    return res.allowed === true
  }

  // BatchCheck phía server (OpenFGA >= 1.8): nhiều câu hỏi trong một round trip, ghép lại theo correlationId.
  async batchCheck(checks) {
    if (!checks.length) return []
    const items = checks.map((c, i) => ({ ...c, contextualTuples: undefined, correlationId: `c${i}` }))
    const byId = new Map()
    // Server giới hạn số check trong một BatchCheck (OPENFGA_MAX_CHECKS_PER_BATCH_CHECK, mặc định 50).
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
      const res = await call(() => this.client.batchCheck({ checks: items.slice(i, i + BATCH_LIMIT) }, CONSISTENT))
      for (const r of res.result) byId.set(r.correlationId, r)
    }
    return items.map(({ correlationId }) => {
      const r = byId.get(correlationId)
      if (r?.error) throw new AuthzError('check_failed', JSON.stringify(r.error))
      return r?.allowed === true
    })
  }

  async listObjects({ user, relation, type, context = {}, contextualTuples = [] }) {
    const res = await call(() => this.client.listObjects({ user, relation, type, context, contextualTuples }, CONSISTENT))
    return res.objects.sort()
  }

  async listUsers({ object, relation, userType = 'user', context = {} }) {
    const res = await call(() =>
      this.client.listUsers({ object: splitObject(object), relation, user_filters: [{ type: userType }], context }, CONSISTENT),
    )
    const users = res.users.filter(u => u.object).map(u => `${u.object.type}:${u.object.id}`)
    const isPublic = res.users.some(u => u.wildcard)
    // Với "viewer but not blocked" + wildcard, ListUsers trả cả wildcard; user cụ thể vẫn phải lọc lại bằng Check.
    const allowed = []
    for (const user of users) if (await this.check({ user, relation, object, context })) allowed.push(user)
    return { users: allowed.sort(), public: isPublic && (await this.check({ user: `${userType}:*`, relation, object, context })) }
  }

  async expand({ object, relation }) {
    const res = await call(() => this.client.expand({ object, relation }, CONSISTENT))
    return res.tree
  }
}

module.exports = { OpenFgaEngine }

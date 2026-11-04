// Đường "list" (ListObjects) và đường "check" (Check từng object) phải ra cùng một tập, cho mọi user.
const db = require('../src/db')
const { api, as, useSeed } = require('./helpers')
const { USERS } = require('./oracle')

useSeed()

describe.each(['documents', 'folders'])('Nhất quán list và check: %s', kind => {
  test.each(USERS)('%s', async user => {
    const list = await api().get(`/${kind}`).set(as(user))
    expect(list.status).toBe(200)

    const all = kind === 'documents' ? db.listDocuments() : db.listFolders()
    const readable = []
    for (const { id } of all) {
      const res = await api().get(`/${kind}/${id}`).set(as(user))
      expect([200, 404]).toContain(res.status)
      if (res.status === 200) readable.push(id)
    }
    expect(list.body.map(x => x.id).sort()).toEqual(readable.sort())
  })
})

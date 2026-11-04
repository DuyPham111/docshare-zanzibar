const { api, as, expectDenied, useSeed } = require('./helpers')

useSeed()

describe('Comment', () => {
  test('người xem được tài liệu đọc được comment, kèm cờ canDelete', async () => {
    const res = await api().get('/documents/api-spec/comments').set(as('frank'))
    expect(res.status).toBe(200)
    expect(res.body.map(c => [c.id, c.canDelete])).toEqual([
      ['c1', false],
      ['c2', false],
    ])
  })

  test('không thấy tài liệu → 404 cả với comment', async () => {
    expectDenied(await api().get('/documents/api-spec/comments').set(as('dave')), 404)
  })

  test('viewer không comment được; commenter thì được', async () => {
    expectDenied(await api().post('/documents/handbook/comments').set(as('erin')).send({ body: 'Hay' }), 403)
    const res = await api().post('/documents/draft/comments').set(as('carol')).send({ body: 'Thêm hình minh họa' })
    expect(res.status).toBe(201)
    expect(res.body.authorId).toBe('carol')
  })

  test('tác giả xóa comment của mình; owner tài liệu xóa comment của người khác', async () => {
    expect((await api().delete('/comments/c1').set(as('carol'))).status).toBe(204)
    expect((await api().delete('/comments/c3').set(as('bob'))).status).toBe(204)
  })

  test('editor không xóa comment của người khác (403); người ngoài nhận 404', async () => {
    expectDenied(await api().delete('/comments/c1').set(as('frank')), 403)
    expectDenied(await api().delete('/comments/c1').set(as('dave')), 404)
  })

  test('tác giả mất quyền xem tài liệu thì cũng không xóa được comment (deleter and can_view)', async () => {
    await api().delete('/documents/draft/shares?subject=user:carol').set(as('bob'))
    expectDenied(await api().delete('/comments/c3').set(as('carol')), 404)
  })
})

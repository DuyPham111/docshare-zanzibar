// Route chỉ chuyển request vào service; kiểm quyền nằm trong service (business layer).
// Express 5 tự chuyển lỗi của handler async sang error handler.
const { Router } = require('express')
const documents = require('../services/documentService')
const folders = require('../services/folderService')
const shares = require('../services/shareService')
const groups = require('../services/groupService')
const comments = require('../services/commentService')
const orgs = require('../services/orgService')

const id = req => String(req.params.id)
const subjectOf = req => req.query.subject

/** Các route chia sẻ dùng chung cho /folders/:id và /documents/:id. @param {'folder' | 'document'} kind */
function sharingRoutes(router, kind) {
  router.get('/:id/shares', async (req, res) => res.json(await shares.listShares(req.user, kind, id(req))))
  router.post('/:id/shares', async (req, res) => res.status(201).json(await shares.share(req.user, kind, id(req), req.body)))
  router.post('/:id/shares/preview', async (req, res) => res.json(await shares.preview(req.user, kind, id(req), req.body)))
  router.delete('/:id/shares', async (req, res) => {
    await shares.unshare(req.user, kind, id(req), subjectOf(req))
    res.sendStatus(204)
  })
  router.post('/:id/blocks', async (req, res) => res.status(201).json(await shares.block(req.user, kind, id(req), req.body)))
  router.delete('/:id/blocks', async (req, res) => {
    await shares.unblock(req.user, kind, id(req), subjectOf(req))
    res.sendStatus(204)
  })
  router.get('/:id/access', async (req, res) => res.json(await shares.access(req.user, kind, id(req))))
  router.get('/:id/access/expand', async (req, res) =>
    res.json(await shares.expand(req.user, kind, id(req), req.query.relation ?? 'can_view')),
  )
}

const documentRouter = Router()
documentRouter.get('/', async (req, res) => res.json(await documents.list(req.user, req.query)))
documentRouter.post('/', async (req, res) => res.status(201).json(await documents.create(req.user, req.body)))
documentRouter.get('/:id', async (req, res) => res.json(await documents.get(req.user, id(req))))
documentRouter.patch('/:id', async (req, res) => res.json(await documents.update(req.user, id(req), req.body)))
documentRouter.delete('/:id', async (req, res) => {
  await documents.remove(req.user, id(req))
  res.sendStatus(204)
})
documentRouter.get('/:id/comments', async (req, res) => res.json(await comments.list(req.user, id(req))))
documentRouter.post('/:id/comments', async (req, res) => res.status(201).json(await comments.create(req.user, id(req), req.body)))
sharingRoutes(documentRouter, 'document')

const folderRouter = Router()
folderRouter.get('/', async (req, res) => res.json(await folders.list(req.user)))
folderRouter.post('/', async (req, res) => res.status(201).json(await folders.create(req.user, req.body)))
folderRouter.get('/:id', async (req, res) => res.json(await folders.get(req.user, id(req))))
folderRouter.patch('/:id', async (req, res) => res.json(await folders.update(req.user, id(req), req.body)))
folderRouter.delete('/:id', async (req, res) => {
  await folders.remove(req.user, id(req))
  res.sendStatus(204)
})
sharingRoutes(folderRouter, 'folder')

const groupRouter = Router()
groupRouter.get('/', async (req, res) => res.json(await groups.list(req.user)))
groupRouter.post('/', async (req, res) => res.status(201).json(await groups.create(req.user, req.body)))
groupRouter.get('/:id', async (req, res) => res.json(await groups.get(req.user, id(req))))
groupRouter.post('/:id/members', async (req, res) => res.status(201).json(await groups.addMember(req.user, id(req), req.body)))
groupRouter.delete('/:id/members', async (req, res) => {
  await groups.removeMember(req.user, id(req), subjectOf(req))
  res.sendStatus(204)
})

const commentRouter = Router()
commentRouter.delete('/:id', async (req, res) => {
  await comments.remove(req.user, id(req))
  res.sendStatus(204)
})

const orgRouter = Router()
orgRouter.get('/:id', async (req, res) => res.json(await orgs.get(req.user, id(req))))
orgRouter.get('/:id/changes', async (req, res) => res.json(await orgs.changes(req.user, id(req))))

const api = Router()
api.get('/me', async (req, res) => res.json(await orgs.me(req.user)))
api.use('/documents', documentRouter)
api.use('/folders', folderRouter)
api.use('/groups', groupRouter)
api.use('/comments', commentRouter)
api.use('/orgs', orgRouter)

module.exports = api

// Test oracle viết tay từ kịch bản seed (không tính bằng engine), dùng cho test/oracle.test.js và scripts/oracle.js.
// Mức: owner > editor > commenter > viewer > none. share = can_share.
// Mỗi ô ghi lý do để người đọc đối chiếu với model.

const USERS = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hank']

/** @type {Record<string, Record<string, [string, boolean, string]>>} document → user → [mức, can_share, lý do] */
const DOCUMENTS = {
  'api-spec': {
    alice: ['owner', true, 'admin org acme → owner acme-drive → kế thừa xuống'],
    bob: ['owner', true, 'tạo tài liệu + owner thư mục specs'],
    carol: ['editor', true, 'frontend ⊂ eng, eng là editor của engineering; là member acme nên chia sẻ được'],
    dave: ['none', false, 'sales không có quan hệ với engineering'],
    erin: ['none', false, 'không thuộc nhóm nào'],
    frank: ['editor', true, 'dba ⊂ backend ⊂ eng: nhóm lồng 3 tầng'],
    gina: ['none', false, 'org khác'],
    hank: ['none', false, 'org khác'],
  },
  'db-schema': {
    alice: ['owner', true, 'admin org'],
    bob: ['owner', true, 'owner thư mục specs'],
    carol: ['editor', true, 'eng editor của engineering'],
    dave: ['none', false, ''],
    erin: ['none', false, ''],
    frank: ['owner', true, 'tạo tài liệu'],
    gina: ['none', false, ''],
    hank: ['none', false, ''],
  },
  postmortem: {
    alice: ['owner', true, 'admin org; admin không còn là member của frontend nên không bị chặn'],
    bob: ['owner', true, 'tạo tài liệu'],
    carol: ['none', false, 'frontend bị chặn ở thư mục incidents (blocked from parent), thắng quyền editor'],
    dave: ['none', false, ''],
    erin: ['none', false, ''],
    frank: ['editor', true, 'eng editor, không thuộc frontend'],
    gina: ['none', false, ''],
    hank: ['none', false, ''],
  },
  pricing: {
    alice: ['owner', true, 'admin org'],
    bob: ['none', false, ''],
    carol: ['none', false, ''],
    dave: ['owner', true, 'tạo tài liệu'],
    erin: ['none', false, ''],
    frank: ['none', false, ''],
    gina: ['editor', false, 'khách ngoài org, editor có hạn 2026-12-31; không phải member acme nên không chia sẻ được'],
    hank: ['none', false, ''],
  },
  forecast: {
    alice: ['owner', true, 'admin org'],
    bob: ['none', false, ''],
    carol: ['none', false, ''],
    dave: ['owner', true, 'tạo tài liệu'],
    erin: ['viewer', false, 'chia sẻ trực tiếp ở mức viewer'],
    frank: ['none', false, ''],
    gina: ['none', false, ''],
    hank: ['none', false, ''],
  },
  handbook: {
    alice: ['owner', true, 'tạo tài liệu'],
    bob: ['viewer', false, 'thư mục public có viewer user:*'],
    carol: ['viewer', false, 'public'],
    dave: ['viewer', false, 'public'],
    erin: ['viewer', false, 'public'],
    frank: ['none', false, 'bị chặn trực tiếp: blocked thắng cả wildcard'],
    gina: ['viewer', false, 'public, kể cả org khác'],
    hank: ['viewer', false, 'public, kể cả org khác'],
  },
  'bob-notes': {
    alice: ['owner', true, 'admin org thấy cả thư mục cá nhân trong org (như admin Workspace)'],
    bob: ['owner', true, 'tạo tài liệu'],
    carol: ['none', false, ''],
    dave: ['none', false, ''],
    erin: ['none', false, ''],
    frank: ['none', false, ''],
    gina: ['none', false, ''],
    hank: ['none', false, ''],
  },
  draft: {
    alice: ['owner', true, 'admin org'],
    bob: ['owner', true, 'tạo tài liệu'],
    carol: ['commenter', false, 'chia sẻ trực tiếp ở mức commenter'],
    dave: ['none', false, ''],
    erin: ['none', false, ''],
    frank: ['none', false, ''],
    gina: ['none', false, ''],
    hank: ['none', false, ''],
  },
  'globex-plan': {
    alice: ['none', false, 'admin acme không có đường nào sang org globex'],
    bob: ['none', false, ''],
    carol: ['none', false, ''],
    dave: ['none', false, ''],
    erin: ['none', false, ''],
    frank: ['none', false, ''],
    gina: ['owner', true, 'tạo tài liệu + admin globex'],
    hank: ['editor', true, 'editor trực tiếp, là member globex'],
  },
}

const LEVEL_RELATIONS = { owner: 'can_delete', editor: 'can_edit', commenter: 'can_comment', viewer: 'can_view' }
const ORDER = ['none', 'viewer', 'commenter', 'editor', 'owner']

/** Kỳ vọng boolean cho từng relation can_* từ mức truy cập. */
function expectedRelations(level, share) {
  const rank = ORDER.indexOf(level)
  return {
    can_view: rank >= 1,
    can_comment: rank >= 2,
    can_edit: rank >= 3,
    can_delete: rank >= 4,
    can_share: share,
  }
}

module.exports = { USERS, DOCUMENTS, LEVEL_RELATIONS, ORDER, expectedRelations }

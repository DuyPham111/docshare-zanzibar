# DocShare: phân quyền kiểu Zanzibar cho hệ thống chia sẻ tài liệu

DocShare là một API chia sẻ tài liệu giống Google Drive. Ứng dụng gồm org (tenant), nhóm lồng nhau, thư mục lồng nhau, tài liệu, comment, chia sẻ cho user, nhóm hoặc public link, chia sẻ có thời hạn, và chặn người dùng. Toàn bộ phân quyền dựa trên **Zanzibar**, hệ thống phân quyền Google dùng cho Drive, Calendar, YouTube.

- **Engine chính: [OpenFGA](https://openfga.dev) v1.22.1.** Đây là hiện thực Zanzibar mã nguồn mở (dự án CNCF), chạy bằng Docker.
- **Engine tự viết: [`src/authz/engine/local.js`](src/authz/engine/local.js), khoảng 300 dòng.** Engine này đọc cùng file model, dùng để test không cần Docker và để trình bày thuật toán `Check`.
- Cả hai engine dùng chung một file chính sách: [`authz/model.fga`](authz/model.fga). Bài [`test/parity.test.js`](test/parity.test.js) chứng minh hai engine trả cùng kết quả trên hơn 500 câu `Check` và trên mọi lệnh `ListObjects`, `ListUsers`, `Expand`.

> Dự án tiếp nối Block 6 ([task-api](../task-api)). Trong task-api, quyền là hàm `decide()` viết tay. Ở DocShare, quyền là **dữ liệu quan hệ (tuple) + luật viết lại userset**, và một engine riêng (PDP) trả lời mọi câu hỏi phân quyền.

## Vì sao cần Zanzibar ở đây

| Yêu cầu | Viết tay như task-api | Zanzibar |
| --- | --- | --- |
| Thư mục lồng nhau kế thừa quyền | Đệ quy ở mỗi API, dễ quên ở API mới | `viewer from parent`, khai báo một lần |
| Nhóm chứa nhóm (dba ⊂ backend ⊂ eng) | JOIN đệ quy | userset `group:eng#member` |
| Chặn thắng cả public link | if/else theo thứ tự, dễ sai | `viewer but not blocked` |
| Khách ngoài org được sửa nhưng không được chia sẻ tiếp | Điều kiện riêng | `editor and member from org` |
| Chia sẻ có thời hạn | Cron xóa quyền | condition `not_expired` trên tuple |
| "Shared with me", tìm kiếm có phân quyền | Lọc sau khi tải (N+1) | `ListObjects` |
| "Who has access" | Tự duyệt cây | `ListUsers` |
| Giải thích vì sao có quyền | Không có | `Expand` |
| Xem trước khi chia sẻ | Phải ghi thử rồi xóa | contextual tuple |
| Nhật ký thay đổi quyền | Tự viết audit | `ReadChanges` (Watch) |
| Gỡ quyền có hiệu lực ngay | Cache, role trong JWT | tuple là nguồn sự thật, `HIGHER_CONSISTENCY` |

## Chạy nhanh

```bash
npm install
```

```bash
npm test
```

`npm test` chạy toàn bộ test trên engine tự viết, không cần Docker.

```bash
npm run fga:up
```

```bash
npm run test:openfga
```

`npm run fga:up` bật OpenFGA bằng Docker. `npm run test:openfga` chạy lại toàn bộ test trên OpenFGA thật, cộng thêm engine test và parity.

```bash
npm run demo:openfga
```

Lệnh trên mở trang demo ở http://localhost:3200 (`npm run demo` để dùng engine tự viết). Trang demo cho phép:

- đăng nhập thành bất kỳ user nào trong seed;
- duyệt thư mục và tài liệu, chia sẻ, chặn, xem trước khi chia sẻ;
- xem "ai có quyền", cây Expand, ma trận quyền của mọi user, nhật ký ReadChanges.

Gọi API bằng curl:

```bash
curl -H "Authorization: Bearer $(npm run -s token -- bob)" localhost:3000/documents
```

| Lệnh | Việc |
| --- | --- |
| `npm start` | API ở cổng 3000 (`AUTHZ_ENGINE=local` hoặc `openfga`) |
| `npm run oracle` | Ghi [`docs/oracle-matrix.md`](docs/oracle-matrix.md): kỳ vọng viết tay so với kết quả engine |
| `npm run evidence` | Ghi [`docs/evidence/`](docs/evidence): kết quả test hai engine và kết quả mutation test |
| `docker compose up --build` | Chạy OpenFGA và API trong container |

## Kiến trúc

```
client ──JWT(sub)──▶ Express route ──▶ Service (PEP) ──▶ src/authz (cổng PDP) ──▶ LocalEngine | OpenFGA
                                         │                                           ▲
                                         ▼                                           │ tuple
                                     db (in-memory): tên, nội dung, cây thư mục ─────┘ cấu trúc (org, parent)
```

- **Token chỉ chứa `sub`.** Role, org, nhóm và mọi chia sẻ nằm trong Zanzibar, nên gỡ quyền có hiệu lực ngay ở request kế tiếp.
- **Chỉ service mới hỏi quyền (PEP), qua `enforce()`** trong [`src/services/access.js`](src/services/access.js). Route không tự kiểm quyền. Quy ước mã lỗi: không có `can_view` thì trả **404** (không lộ việc object tồn tại); thấy object nhưng thiếu quyền thì trả **403**.
- **Chọn engine bằng biến môi trường `AUTHZ_ENGINE`.** Service không biết đang chạy engine nào.

Chi tiết thiết kế, thuật toán Check, dual write, consistency và các đánh đổi: [`docs/thiet-ke.md`](docs/thiet-ke.md).

## Model ([authz/model.fga](authz/model.fga))

| Type | Relation chính | Tính năng Zanzibar |
| --- | --- | --- |
| `org` | `admin`, `member` | tenant; `member: [user] or admin` |
| `group` | `member: [user, group#member]`, `manager` | userset lồng nhau, `admin from org` |
| `folder` | `owner`, `editor`, `commenter`, `viewer`, `blocked`, `parent`, `org` | kế thừa `... from parent`, wildcard `user:*`, condition |
| `document` | như folder, thêm `can_comment` | `but not blocked`, `editor and org_member` |
| `comment` | `author`, `parent` | `can_delete: (author or owner from parent) and can_view` |
| condition `not_expired` | `current_time < expires_at` | ABAC gắn trên tuple, `current_time` do server đặt |

## API

| Endpoint | Quyền (relation) | API Zanzibar dùng |
| --- | --- | --- |
| `GET /me` | | ListObjects (nhóm của tôi), Check |
| `GET /documents?q=&filter=shared\|owned` | | **ListObjects** + **BatchCheck** (mức truy cập) |
| `POST /documents` | `folder#can_create` | Write (org, parent, owner) |
| `GET /documents/:id` | `can_view` | Check + BatchCheck (capabilities) |
| `PATCH /documents/:id` | `can_edit`; chuyển thư mục thêm `folder#can_create` ở đích | Write (đổi tuple parent) |
| `DELETE /documents/:id` | `can_delete` | Read + Write (xóa tuple) |
| `GET/POST /documents/:id/comments` | `can_view` / `can_comment` | |
| `DELETE /comments/:id` | `comment#can_delete` | |
| `GET/POST/PATCH/DELETE /folders[/:id]` | `can_view`, `can_create`, `can_edit`, `can_delete` | ListObjects, BatchCheck (lọc con bị chặn) |
| `GET /{documents,folders}/:id/shares` | `can_share` | **Read** |
| `POST /{documents,folders}/:id/shares` `{subject, relation, expiresAt?}` | `can_share` | Write (tuple có condition) |
| `POST /{documents,folders}/:id/shares/preview` | `can_share` | Check + **contextual tuples** |
| `DELETE /{documents,folders}/:id/shares?subject=` | `can_share` | Write (delete) |
| `POST/DELETE /{documents,folders}/:id/blocks` | `can_block` | Write |
| `GET /{documents,folders}/:id/access` | `can_share` | **ListUsers** |
| `GET /{documents,folders}/:id/access/expand?relation=` | `can_share` | **Expand** |
| `GET/POST /groups`, `GET /groups/:id` | `org#member`, `group#can_view` | ListObjects, ListUsers (member thực tế) |
| `POST/DELETE /groups/:id/members` | `group#can_manage` | Check userset để chặn chu trình |
| `GET /orgs/:id`, `GET /orgs/:id/changes` | `org#member`, `org#admin` | **ReadChanges** |

`subject` có dạng `user:bob`, `group:eng` hoặc `public`.

## Dữ liệu mẫu ([data/seed.json](data/seed.json))

- **Org `acme`** (cho phép chia sẻ ra ngoài): alice (admin), bob, carol, dave, erin, frank.
- **Org `globex`** (không cho phép chia sẻ ra ngoài): gina (admin), hank.
- **Nhóm:**
  - `eng` gồm `backend` và `frontend`;
  - `backend` gồm bob và `dba`;
  - `dba` gồm frank;
  - `frontend` gồm carol; `sales` gồm dave; `ops` gồm hank.
- **Thư mục:**
  - `acme-drive`, bên trong có:
    - `engineering` (editor: eng), bên trong có `specs` và `incidents` (chặn frontend);
    - `sales-docs` (editor: sales);
    - `public` (viewer: `user:*`).
  - Thư mục cá nhân `home-bob`.
  - Thư mục `globex-drive` của org globex.
- **Chia sẻ đặc biệt:**
  - gina là editor của `pricing` đến 2026-12-31 (khách ngoài org, có thời hạn);
  - frank bị chặn ở `handbook` (chặn thắng public link);
  - erin là viewer của `forecast`, carol là commenter của `draft`.

Ma trận đầy đủ user × tài liệu có lý do cho từng ô: [`docs/oracle-matrix.md`](docs/oracle-matrix.md).

## Test và evidence

| Bộ test | Nội dung |
| --- | --- |
| [oracle.test.js](test/oracle.test.js) | 72 ô user × tài liệu từ [oracle viết tay](test/oracle.js), cộng 8 danh sách `GET /documents` |
| [sharing.test.js](test/sharing.test.js) | chia sẻ user/nhóm/public, chính sách ra ngoài, khách không chia sẻ tiếp, hết hạn, chặn, ListUsers, Expand, xem trước |
| [folders.test.js](test/folders.test.js) | kế thừa, con bị chặn, breadcrumb, chuyển thư mục đổi quyền cả cây, chặn chu trình cây, xóa cả cây |
| [groups.test.js](test/groups.test.js) | nhóm lồng 3 tầng, manager khác member, thu hồi ngay, chặn chu trình nhóm |
| [documents.test.js](test/documents.test.js), [comments.test.js](test/comments.test.js), [tenant.test.js](test/tenant.test.js) | 401/403/404, mass assignment, tìm kiếm, cách ly org, thuộc tính tự khai, ReadChanges |
| [consistency.test.js](test/consistency.test.js) | đường list (ListObjects) và đường check cho cùng tập với mọi user |
| [engine.test.js](test/engine.test.js) | cùng kỳ vọng cho LocalEngine và OpenFGA ở các ca biên |
| [parity.test.js](test/parity.test.js) | hai engine khớp nhau trên toàn bộ seed, ở hai thời điểm |

Kết quả (xem [`docs/evidence/`](docs/evidence)):

- **Engine tự viết:** 197/197 test xanh (7 test parity bỏ qua vì cần OpenFGA).
- **OpenFGA v1.22.1:** 218/218 test xanh.
- **Mutation test:** làm sai 6 luật trong model thì cả 6 đều bị test bắt ([mutations.md](docs/evidence/mutations.md)).

## Giới hạn

- **DB in-memory và OpenFGA datastore memory:** khởi động lại là mất dữ liệu. Production cần Postgres cho cả hai.
- **Dual write không có transaction chung:** ghi tuple trước rồi mới ghi DB. Hướng xử lý (outbox) có trong [thiết kế](docs/thiet-ke.md#dual-write).
- **ListObjects của engine tự viết quét mọi object rồi gọi Check:** độ phức tạp O(N). OpenFGA dùng reverse expansion.
- **Chưa có zookie theo từng object:** dùng `HIGHER_CONSISTENCY` cho mọi request, đổi lại độ trễ.
- **Bộ đánh giá CEL của engine tự viết chỉ hỗ trợ phép so sánh, `&&`, `||`, `!`.**

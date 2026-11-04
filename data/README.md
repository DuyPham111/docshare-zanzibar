# Dữ liệu đi kèm

- `seed.json` là dataset giả của lab: 2 org, 8 user, 6 nhóm, 8 thư mục, 9 tài liệu, 3 comment, 21 tuple chia sẻ. File không chứa secret hay token.
- Khi khởi động, `src/reset.js` nạp file này vào **hai nơi**:
  - `src/db.js`: dữ liệu nghiệp vụ, gồm tên, nội dung, cây thư mục.
  - Zanzibar (engine tự viết, hoặc OpenFGA qua một store mới): tuple quan hệ.
- Tuple gồm hai phần:
  - **Tuple cấu trúc** được sinh tự động từ bản ghi ([src/authz/seedTuples.js](../src/authz/seedTuples.js)): `org#member` cho mỗi user; `org` và `parent` cho thư mục, tài liệu; `owner` cho người tạo; `parent` và `author` cho comment. Nhờ vậy cây thư mục trong db và trong Zanzibar luôn khớp nhau.
  - **Tuple chia sẻ** ghi tay trong mảng `tuples`, theo ký pháp Zanzibar `object#relation@user`. Tuple có thời hạn ghi dạng object kèm `condition`.
- Dữ liệu chạy trong RAM. Muốn quay về trạng thái ban đầu thì khởi động lại server, hoặc bấm "Đặt lại seed" trên trang demo (`POST /dev/reset`).
- Không cần import thủ công, không cần cài cơ sở dữ liệu.

## Kịch bản

| User | Org | Quan hệ đáng chú ý |
| --- | --- | --- |
| alice | acme | `org:acme#admin`: owner mọi thư mục của acme |
| bob | acme | member `backend`; owner `specs`, `incidents`, `home-bob` |
| carol | acme | member `frontend`, manager `eng`; commenter `draft` |
| dave | acme | member và manager `sales`; owner `sales-docs` |
| erin | acme | không thuộc nhóm nào; viewer trực tiếp `forecast` |
| frank | acme | member `dba` (dba ⊂ backend ⊂ eng); bị chặn ở `handbook` |
| gina | globex | `org:globex#admin`; editor `pricing` của acme đến 2026-12-31 |
| hank | globex | member `ops`; editor `globex-plan` |

| Thư mục | Cha | Quan hệ |
| --- | --- | --- |
| acme-drive | (gốc) | owner alice |
| engineering | acme-drive | editor `group:eng#member` |
| specs, incidents | engineering | `incidents` chặn `group:frontend#member` |
| sales-docs | acme-drive | editor `group:sales#member` |
| public | acme-drive | viewer `user:*` |
| home-bob | (gốc) | owner bob |
| globex-drive | (gốc, org globex) | owner gina |

Ma trận mức truy cập user × tài liệu có lý do cho từng ô: [docs/oracle-matrix.md](../docs/oracle-matrix.md).

Muốn thử kịch bản khác, sửa `seed.json` rồi khởi động lại. Bộ test giả định đúng dataset trên, nên chạy `npm test` với seed gốc.

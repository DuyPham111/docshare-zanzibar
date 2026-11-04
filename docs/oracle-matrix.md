# Ma trận quyền: user × tài liệu

Engine: `openfga`. Ký hiệu: O owner, E editor, C commenter, V viewer, · không thấy (404); `+s` = chia sẻ tiếp được.
Mỗi ô là **kỳ vọng viết tay**; nếu engine trả khác, ô ghi `kỳ vọng ≠ thực tế` và in đậm.

| Tài liệu | alice | bob | carol | dave | erin | frank | gina | hank |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| api-spec | O+s | O+s | E+s | · | · | E+s | · | · |
| db-schema | O+s | O+s | E+s | · | · | O+s | · | · |
| postmortem | O+s | O+s | · | · | · | E+s | · | · |
| pricing | O+s | · | · | O+s | · | · | E | · |
| forecast | O+s | · | · | O+s | V | · | · | · |
| handbook | O+s | V | V | V | V | · | V | V |
| bob-notes | O+s | O+s | · | · | · | · | · | · |
| draft | O+s | O+s | C | · | · | · | · | · |
| globex-plan | · | · | · | · | · | · | O+s | E+s |

Số ô lệch: **0** / 72.

## Lý do từng ô có quyền

- **api-spec × alice** (owner): admin org acme → owner acme-drive → kế thừa xuống
- **api-spec × bob** (owner): tạo tài liệu + owner thư mục specs
- **api-spec × carol** (editor): frontend ⊂ eng, eng là editor của engineering; là member acme nên chia sẻ được
- **api-spec × dave** (none): sales không có quan hệ với engineering
- **api-spec × erin** (none): không thuộc nhóm nào
- **api-spec × frank** (editor): dba ⊂ backend ⊂ eng: nhóm lồng 3 tầng
- **api-spec × gina** (none): org khác
- **api-spec × hank** (none): org khác
- **db-schema × alice** (owner): admin org
- **db-schema × bob** (owner): owner thư mục specs
- **db-schema × carol** (editor): eng editor của engineering
- **db-schema × frank** (owner): tạo tài liệu
- **postmortem × alice** (owner): admin org; admin không còn là member của frontend nên không bị chặn
- **postmortem × bob** (owner): tạo tài liệu
- **postmortem × carol** (none): frontend bị chặn ở thư mục incidents (blocked from parent), thắng quyền editor
- **postmortem × frank** (editor): eng editor, không thuộc frontend
- **pricing × alice** (owner): admin org
- **pricing × dave** (owner): tạo tài liệu
- **pricing × gina** (editor): khách ngoài org, editor có hạn 2026-12-31; không phải member acme nên không chia sẻ được
- **forecast × alice** (owner): admin org
- **forecast × dave** (owner): tạo tài liệu
- **forecast × erin** (viewer): chia sẻ trực tiếp ở mức viewer
- **handbook × alice** (owner): tạo tài liệu
- **handbook × bob** (viewer): thư mục public có viewer user:*
- **handbook × carol** (viewer): public
- **handbook × dave** (viewer): public
- **handbook × erin** (viewer): public
- **handbook × frank** (none): bị chặn trực tiếp: blocked thắng cả wildcard
- **handbook × gina** (viewer): public, kể cả org khác
- **handbook × hank** (viewer): public, kể cả org khác
- **bob-notes × alice** (owner): admin org thấy cả thư mục cá nhân trong org (như admin Workspace)
- **bob-notes × bob** (owner): tạo tài liệu
- **draft × alice** (owner): admin org
- **draft × bob** (owner): tạo tài liệu
- **draft × carol** (commenter): chia sẻ trực tiếp ở mức commenter
- **globex-plan × alice** (none): admin acme không có đường nào sang org globex
- **globex-plan × gina** (owner): tạo tài liệu + admin globex
- **globex-plan × hank** (editor): editor trực tiếp, là member globex

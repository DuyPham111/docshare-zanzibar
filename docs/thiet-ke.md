# Thiết kế phân quyền DocShare theo Zanzibar

## 1. Ba thành phần của Zanzibar

| Zanzibar (paper 2019) | Trong DocShare |
| --- | --- |
| **Namespace config**: khai báo relation và luật viết lại userset | [`authz/model.fga`](../authz/model.fga) (OpenFGA DSL, schema 1.1) |
| **Relation tuple** `object#relation@user` | Tuple trong OpenFGA hoặc trong `LocalEngine.tuples` |
| **API** Check, Read, Write, Expand, Watch | `check`, `read`, `write`, `expand`, `readChanges`, cộng `listObjects`, `listUsers`, `batchCheck` của OpenFGA |

Bốn dạng user trong một tuple:

```
document:forecast#viewer@user:erin                 user cụ thể
folder:public#viewer@user:*                        wildcard: mọi user (public link)
folder:engineering#editor@group:eng#member         userset: mọi member của group eng
document:api-spec#parent@folder:specs              object: dùng cho tuple-to-userset (… from parent)
```

## 2. Luật viết lại userset và thuật toán Check

Relation trong model là một cây gồm 6 loại nút. [`LocalEngine.#rewrite`](../src/authz/engine/local.js) xử lý từng loại:

| Nút | DSL | Check(user, rel, obj) làm gì |
| --- | --- | --- |
| `this` | `[user, group#member]` | Đọc tuple `obj#rel`. Có tuple khớp user, hoặc tuple wildcard cùng type, hoặc tuple userset mà user thuộc về (gọi Check đệ quy) thì đúng |
| `computedUserset` | `or owner` | Check(user, owner, obj) |
| `tupleToUserset` | `viewer from parent` | Với mỗi tuple `obj#parent@folder:x`, Check(user, viewer, folder:x) |
| `union` | `a or b` | một nhánh đúng là đủ |
| `intersection` | `a and b` | mọi nhánh phải đúng |
| `difference` | `a but not b` | a đúng và b sai |

Kèm theo ba cơ chế an toàn:

- **Chu trình:** ghi lại khóa `object#relation@user` đang giải quyết; gặp lại khóa đó thì nhánh đó trả false.
- **Độ sâu tối đa 25:** giống resolve depth mặc định của OpenFGA.
- **Condition:** đánh giá lúc đọc tuple. Giá trị trong tuple thắng giá trị trong request, nên client không ghi đè được `expires_at`. Thiếu tham số thì từ chối (fail closed).

### Ví dụ: frank có `can_edit` trên `document:api-spec` không?

```
document:api-spec#can_edit = editor but not blocked
  editor = [user…] ∪ owner ∪ editor from parent
    editor from parent → document:api-spec#parent@folder:specs
      folder:specs#editor = … ∪ editor from parent → folder:engineering
        folder:engineering#editor: tuple @group:eng#member
          group:eng#member: tuple @group:backend#member
            group:backend#member: tuple @group:dba#member
              group:dba#member: tuple @user:frank   ✔
  blocked = [user, group#member] ∪ blocked from parent → không có tuple nào  ✘
⇒ ALLOW
```

Cùng cách đó, carol bị từ chối trên `postmortem`. `editor` đúng (carol thuộc frontend, frontend nằm trong eng). Nhưng `blocked from parent` cũng đúng, vì có tuple `folder:incidents#blocked@group:frontend#member`. `difference` trả false. Quyền chặn chảy xuống cùng chiều với quyền xem.

## 3. Quy ước 404 / 403

[`enforce()`](../src/services/access.js) hỏi relation cần thiết trước. Nếu bị từ chối, nó hỏi tiếp relation "được thấy" của type đó (`can_view`, hoặc `member` với org):

- **không thấy → 404**, cùng body với object không tồn tại, nên không dò được ID;
- **thấy nhưng không được làm → 403**, client hợp lệ biết lý do.

Đánh đổi: một lần từ chối tốn hai lần Check. Ghi chú: comment có `can_view` suy từ document cha, nên tác giả đã mất quyền xem tài liệu nhận 404 khi xóa comment.

## 4. Dữ liệu nằm ở đâu

| Dữ liệu | Nơi lưu | Lý do |
| --- | --- | --- |
| Chia sẻ, chặn, thành viên nhóm, admin org | **Chỉ Zanzibar** | Nguồn sự thật duy nhất; Read API trả danh sách cho UI |
| Cấu trúc (document thuộc folder, folder cha, org) | **Cả hai**: db (để vẽ cây) và tuple (để kế thừa quyền) | Dual write |
| Tên, nội dung, comment, cài đặt org | Chỉ db | Không liên quan quyền |
| Chính sách org (`allowExternalSharing`) | db, kiểm ở service | Là thuộc tính cấu hình chứ không phải quan hệ |

### Dual write

- **Tạo:** ghi tuple trước, rồi ghi db. Zanzibar từ chối thì db chưa có gì để dọn.
- **Xóa:** xóa tuple trước để quyền mất ngay, rồi mới xóa db.
- **Chuyển thư mục:** một write gồm xóa tuple parent cũ và ghi tuple parent mới. OpenFGA thực hiện nguyên tử. Cả cây con đổi quyền theo mà không phải sửa ACL từng tài liệu.

Rủi ro còn lại: process chết giữa hai bước thì để lại tuple mồ côi. Tuple mồ côi không cấp quyền cho object không tồn tại, vì service trả 404 khi db không có object. Production nên dùng **transactional outbox**: ghi db và một dòng "tuple cần ghi" trong cùng transaction SQL, rồi worker đẩy sang OpenFGA, kèm idempotency key.

## 5. Consistency: "new enemy problem"

Ví dụ: Alice gỡ Bob khỏi tài liệu, rồi sửa nội dung nhạy cảm. Nếu lần Check của Bob đọc snapshot cũ thì Bob thấy được nội dung mới. Zanzibar giải quyết bằng **zookie**: lúc ghi, server trả một token phiên bản; lúc đọc, client gửi kèm zookie để đọc snapshot ít nhất mới bằng thời điểm đó.

OpenFGA cung cấp `consistency: HIGHER_CONSISTENCY`, tức bỏ cache và đọc thẳng datastore. [Adapter](../src/authz/engine/openfga.js) dùng chế độ này cho mọi Check, List và Read. Test `groups.test.js › gỡ bob khỏi backend → mất quyền ngay` và `sharing.test.js › gỡ chia sẻ` chứng minh hiệu quả. Đánh đổi: không hưởng cache của OpenFGA. Có thể tối ưu bằng cách chỉ dùng HIGHER_CONSISTENCY cho object vừa đổi quyền, giống tinh thần zookie theo từng object.

So với Block 6: task-api không có cache nên không gặp vấn đề này. Slide 20 cho thấy giữ role trong JWT 15 phút tạo cửa sổ 15 phút còn quyền sau khi bị gỡ. DocShare không đưa quyền vào token.

## 6. Check và List

- **Một object:** Check.
- **Cờ quyền cho nhiều object** (danh sách, nút trên UI): một **BatchCheck** thay vì N lần Check. OpenFGA giới hạn 50 check mỗi lô; adapter tự chia lô.
- **"Tôi xem được gì"** (danh sách, tìm kiếm, shared with me): **ListObjects** trả đúng tập id, sau đó mới lấy dữ liệu từ db. Không tải hết rồi lọc. Test `consistency.test.js` đối chiếu list với check cho mọi user.
- **"Ai xem được"**: **ListUsers**. Ngữ nghĩa của OpenFGA: user chỉ có quyền nhờ wildcard không được liệt kê mà gộp vào cờ `public`. Engine tự viết làm theo y hệt; parity test đối chiếu.

Engine tự viết làm ListObjects theo cách đơn giản nhất: Check từng ứng viên, O(số object × chi phí Check). OpenFGA làm **reverse expansion**: đi ngược đồ thị từ user. Với hàng triệu tài liệu, chỉ cách sau dùng được.

## 7. Ba cách đưa thuộc tính vào quyết định

| Cách | Dùng khi | Trong DocShare |
| --- | --- | --- |
| Tuple lưu sẵn | Quan hệ bền: thành viên, chia sẻ, cây thư mục | Hầu hết |
| **Condition** trên tuple | Thuộc tính của *chính lần chia sẻ đó* | `not_expired(expires_at)`, `current_time` do server đặt |
| **Contextual tuple** | Quan hệ chỉ đúng trong một request, hoặc giả định "nếu…" | `POST …/shares/preview`: hỏi "nếu chia sẻ thì sao" mà không ghi gì |

Một số luật không đưa vào model vì là kiểm tra nghiệp vụ, không phải câu hỏi về quan hệ:

- cấm chia sẻ ra ngoài theo cài đặt org;
- cấm chuyển tài liệu sang org khác;
- cấm tạo chu trình cây thư mục.

Riêng chu trình nhóm thì hỏi chính Zanzibar: `Check(group:X#member, member, group:Y)`. Nếu X đã nằm trong Y thì không cho thêm Y vào X.

## 8. Engine tự viết và OpenFGA

| | LocalEngine | OpenFGA v1.22.1 |
| --- | --- | --- |
| Model | cùng `model.fga` (parse bằng `@openfga/syntax-transformer`) | cùng file |
| Lưu tuple | Map trong bộ nhớ, chỉ mục `object#relation` | memory, Postgres hoặc MySQL |
| Check | DFS theo cây rewrite, phát hiện chu trình | song song, cache, dispatch |
| ListObjects | Check mọi ứng viên | reverse expansion, có giới hạn thời gian và số kết quả |
| Condition | tập con CEL (so sánh, `&&`, `||`, `!`) | cel-go đầy đủ |
| Validate tuple | type restriction, condition, trùng, xóa không tồn tại | như trái |
| Dùng để | test nhanh không cần Docker, giảng thuật toán | chạy thật |

Có test để hai engine không lệch nhau:

- [`engine.test.js`](../test/engine.test.js) chạy cùng kỳ vọng trên cả hai engine;
- [`parity.test.js`](../test/parity.test.js) so toàn bộ seed: mọi user × mọi object × mọi relation `can_*`, ở hai thời điểm (trước và sau hạn chia sẻ của gina).

## 9. Câu hỏi vấn đáp

1. **Vì sao không giữ hàm `decide()` như task-api?** Khi có nhóm lồng nhau, thư mục lồng nhau và chặn, `decide()` thành truy vấn đệ quy mà mỗi API phải gọi đúng cách. Zanzibar tách chính sách (model) khỏi dữ liệu (tuple): thêm API mới chỉ cần gọi Check với relation có sẵn.
2. **Scope OAuth2 còn cần không?** Vẫn cần, ở tầng khác: giới hạn những gì một client được làm. Zanzibar trả lời câu hỏi user có quan hệ với object cụ thể không. Như Block 6, scope không thay được kiểm quyền mức object.
3. **Ẩn nút trên giao diện có đủ không?** Không. Trang demo có nút "Gửi PATCH trực tiếp" để chứng minh server vẫn trả 403.
4. **Hàng triệu tài liệu chia sẻ qua nhiều nhóm thì sao?** Đây đúng là bài toán Zanzibar giải. Thêm một người vào nhóm là ghi một tuple, không phải hàng nghìn dòng ACL. Mọi API dùng chung một PDP và một model. Danh sách dùng ListObjects. Consistency dùng zookie hoặc HIGHER_CONSISTENCY.
5. **Admin org có toàn quyền trong org không?** Có, thông qua `owner … or admin from org` ở thư mục, kể cả thư mục cá nhân, giống quyền của admin Google Workspace. Nhưng admin không tự là member của mọi nhóm, nên không bị dính các luật chặn theo nhóm. Đây là lỗi mình gặp và sửa khi viết oracle (xem lịch sử git).
6. **Điều gì chưa được kiểm tra?** Các ca sau chưa có test:
   - tải lớn: số object lớn, độ sâu nhóm lớn;
   - lỗi mạng giữa app và OpenFGA khi đang dual write;
   - nhiều instance app ghi đồng thời cùng một tuple (mới chỉ map lỗi `tuple_exists` sang 409);
   - Watch dạng stream (mới đọc theo trang).

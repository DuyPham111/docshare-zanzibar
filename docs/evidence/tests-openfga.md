# Kết quả test: OpenFGA (http://localhost:8080), gồm engine test và parity

Ngày chạy: 2026-11-04T04:44:56.741Z

**243 passed, 0 failed, 0 skipped** / 243 tests

## test/cel.test.js

- ✅ CEL subset › timestamp so sánh theo thời điểm, không theo chuỗi
- ✅ CEL subset › a == b với {"a":2,"b":2} → true
- ✅ CEL subset › a != b với {"a":2,"b":3} → true
- ✅ CEL subset › a <= b với {"a":3,"b":3} → true
- ✅ CEL subset › a > b với {"a":3,"b":3} → false
- ✅ CEL subset › a >= b && a < 10 với {"a":5,"b":5} → true
- ✅ CEL subset › a > 100 || b == 3 với {"a":1,"b":3} → true
- ✅ CEL subset › !(a == b) với {"a":1,"b":2} → true
- ✅ CEL subset › (a < b) && !(b < a) với {"a":1,"b":2} → true
- ✅ CEL subset › literal chuỗi, số, boolean
- ✅ CEL subset › thiếu tham số → MissingParameter (engine chuyển thành từ chối)
- ✅ CEL subset › identifier không khai báo hoặc timestamp sai định dạng → lỗi
- ✅ CEL subset › cú pháp ngoài tập con bị từ chối ngay khi nạp model
- ✅ CEL subset › kiểu tham số chưa hỗ trợ (duration) → lỗi rõ ràng

## test/comments.test.js

- ✅ Comment › người xem được tài liệu đọc được comment, kèm cờ canDelete
- ✅ Comment › không thấy tài liệu → 404 cả với comment
- ✅ Comment › viewer không comment được; commenter thì được
- ✅ Comment › tác giả xóa comment của mình; owner tài liệu xóa comment của người khác
- ✅ Comment › editor không xóa comment của người khác (403); người ngoài nhận 404
- ✅ Comment › tác giả mất quyền xem tài liệu thì cũng không xóa được comment (deleter and can_view)

## test/consistency.test.js

- ✅ Nhất quán list và check: documents › alice
- ✅ Nhất quán list và check: documents › bob
- ✅ Nhất quán list và check: documents › carol
- ✅ Nhất quán list và check: documents › dave
- ✅ Nhất quán list và check: documents › erin
- ✅ Nhất quán list và check: documents › frank
- ✅ Nhất quán list và check: documents › gina
- ✅ Nhất quán list và check: documents › hank
- ✅ Nhất quán list và check: folders › alice
- ✅ Nhất quán list và check: folders › bob
- ✅ Nhất quán list và check: folders › carol
- ✅ Nhất quán list và check: folders › dave
- ✅ Nhất quán list và check: folders › erin
- ✅ Nhất quán list và check: folders › frank
- ✅ Nhất quán list và check: folders › gina
- ✅ Nhất quán list và check: folders › hank

## test/documents.test.js

- ✅ Xác thực › không có token → 401
- ✅ Xác thực › token sai chữ ký → 401
- ✅ Xác thực › token của user không tồn tại → 401
- ✅ Đọc và sửa tài liệu › không có quyền xem → 404 giống hệt tài liệu không tồn tại
- ✅ Đọc và sửa tài liệu › xem được nhưng không được sửa → 403
- ✅ Đọc và sửa tài liệu › editor qua nhóm sửa được; field ngoài danh sách (orgId, createdBy) bị bỏ qua
- ✅ Đọc và sửa tài liệu › commenter không sửa được nội dung
- ✅ Đọc và sửa tài liệu › title không hợp lệ → 400 (sau khi đã qua kiểm quyền)
- ✅ Tạo tài liệu › tạo trong thư mục có quyền editor: người tạo là owner, org lấy từ thư mục
- ✅ Tạo tài liệu › tạo trong thư mục chỉ xem → 403; thư mục không thấy → 404
- ✅ Tạo tài liệu › khách ngoài org có quyền editor ở thư mục vẫn tạo được; tài liệu thuộc org của thư mục
- ✅ Chuyển tài liệu sang thư mục khác › quyền đổi theo thư mục mới: một tuple parent thay đổi
- ✅ Chuyển tài liệu sang thư mục khác › cần can_create ở thư mục đích
- ✅ Chuyển tài liệu sang thư mục khác › không chuyển sang thư mục của org khác
- ✅ Xóa tài liệu › owner xóa được; tuple bị xóa nên không còn ai thấy, kể cả qua danh sách
- ✅ Xóa tài liệu › editor không xóa được
- ✅ Tìm kiếm có phân quyền › chỉ trả tài liệu người gọi xem được
- ✅ Tìm kiếm có phân quyền › filter=shared: tài liệu người khác chia sẻ cho mình

## test/engine.test.js

- ✅ Engine local › computed userset + tuple-to-userset: owner của doc cha xem được doc con
- ✅ Engine local › userset lồng: ann ∈ team:a ⊂ team:b
- ✅ Engine local › userset làm subject: team:a#member có phải member của team:b
- ✅ Engine local › wildcard khớp mọi user; exclusion thắng wildcard
- ✅ Engine local › intersection: cần cả reviewer và viewer
- ✅ Engine local › condition: đúng hạn thì có quyền, quá hạn thì mất
- ✅ Engine local › condition: giá trị trong tuple thắng giá trị client gửi trong context
- ✅ Engine local › contextual tuple chỉ có hiệu lực trong request đó
- ✅ Engine local › chu trình nhóm không làm treo Check
- ✅ Engine local › ghi tuple sai type restriction bị từ chối
- ✅ Engine local › ghi trùng và xóa tuple không tồn tại bị từ chối
- ✅ Engine local › ListObjects và ListUsers
- ✅ Engine local › Read và ReadChanges
- ✅ Engine local › Expand trả cây userset một tầng
- ✅ Engine openfga › computed userset + tuple-to-userset: owner của doc cha xem được doc con
- ✅ Engine openfga › userset lồng: ann ∈ team:a ⊂ team:b
- ✅ Engine openfga › userset làm subject: team:a#member có phải member của team:b
- ✅ Engine openfga › wildcard khớp mọi user; exclusion thắng wildcard
- ✅ Engine openfga › intersection: cần cả reviewer và viewer
- ✅ Engine openfga › condition: đúng hạn thì có quyền, quá hạn thì mất
- ✅ Engine openfga › condition: giá trị trong tuple thắng giá trị client gửi trong context
- ✅ Engine openfga › contextual tuple chỉ có hiệu lực trong request đó
- ✅ Engine openfga › chu trình nhóm không làm treo Check
- ✅ Engine openfga › ghi tuple sai type restriction bị từ chối
- ✅ Engine openfga › ghi trùng và xóa tuple không tồn tại bị từ chối
- ✅ Engine openfga › ListObjects và ListUsers
- ✅ Engine openfga › Read và ReadChanges
- ✅ Engine openfga › Expand trả cây userset một tầng

## test/folders.test.js

- ✅ Xem thư mục › con bị chặn không xuất hiện trong danh sách con
- ✅ Xem thư mục › breadcrumb chỉ gồm thư mục cha người gọi xem được
- ✅ Xem thư mục › GET /folders: root là thư mục đầu tiên người gọi thấy trên mỗi nhánh
- ✅ Xem thư mục › thư mục không thấy → 404
- ✅ Tạo thư mục › tạo thư mục con: kế thừa quyền từ cha ngay lập tức
- ✅ Tạo thư mục › tạo thư mục gốc: thuộc org của người gọi, chỉ người tạo (và admin org) thấy
- ✅ Tạo thư mục › chỉ có quyền xem thì không tạo được thư mục con
- ✅ Chuyển thư mục: đổi một tuple parent, cả cây con đổi quyền › chuyển specs từ engineering sang sales-docs
- ✅ Chuyển thư mục: đổi một tuple parent, cả cây con đổi quyền › không chuyển vào chính nó hoặc thư mục con của nó
- ✅ Chuyển thư mục: đổi một tuple parent, cả cây con đổi quyền › chỉ owner chuyển được thư mục
- ✅ Chuyển thư mục: đổi một tuple parent, cả cây con đổi quyền › đổi tên cần can_edit
- ✅ Chia sẻ và xóa thư mục › chia sẻ thư mục cho user → thấy mọi tài liệu bên trong
- ✅ Chia sẻ và xóa thư mục › xóa thư mục xóa cả cây; tuple bị xóa theo nên không còn quyền mồ côi
- ✅ Chia sẻ và xóa thư mục › editor không xóa được thư mục

## test/groups.test.js

- ✅ Nhóm lồng nhau › effectiveMembers của eng gồm cả member qua backend và dba (3 tầng)
- ✅ Nhóm lồng nhau › /me liệt kê mọi nhóm user thuộc về, kể cả gián tiếp
- ✅ Nhóm lồng nhau › mọi member org xem được nhóm của org; org khác → 404
- ✅ Quản lý thành viên › manager thêm user → user nhận ngay quyền của nhóm ở mọi thư mục
- ✅ Quản lý thành viên › member thường không quản lý được nhóm
- ✅ Quản lý thành viên › admin org quản lý mọi nhóm của org nhưng không vì thế mà thành member
- ✅ Quản lý thành viên › gỡ bob khỏi backend → mất quyền editor ở engineering ngay (thu hồi không chờ cache/token)
- ✅ Quản lý thành viên › không thêm user hoặc nhóm của org khác
- ✅ Quản lý thành viên › thêm trùng → 409; gỡ người không phải member → 404
- ✅ Chống chu trình nhóm › thêm eng vào dba (dba ⊂ backend ⊂ eng) → 409
- ✅ Chống chu trình nhóm › thêm nhóm vào chính nó → 409
- ✅ Chống chu trình nhóm › thêm nhóm không tạo chu trình thì được
- ✅ Tạo nhóm › người tạo là manager, nhóm thuộc org của người tạo

## test/ops.test.js

- ✅ Vận hành › [P1] /health không cần token, báo engine đang dùng
- ✅ Vận hành › [P2] không lộ framework qua X-Powered-By
- ✅ Vận hành › [P3] JSON lỗi → 400 invalid_json; body quá 20 KB → 413
- ✅ Vận hành › [P4] route không tồn tại → 404 JSON
- ✅ Vận hành › [P5] NODE_ENV=production mà thiếu JWT_SECRET thì app từ chối khởi động
- ✅ Audit log › [L1] AUDIT_LOG=deny: chỉ ghi lần từ chối, dạng JSON Lines; body trả về không có lý do
- ✅ Audit log › [L2] AUDIT_LOG=all ghi cả lần cho phép; off không ghi gì
- ✅ Tài liệu API và server demo › [D1] mọi route của API đều có trong docs/openapi.yaml và ngược lại
- ✅ Tài liệu API và server demo › [D2] mọi operation thao tác trên object đều ghi relation Zanzibar cần có (x-relation)
- ✅ Tài liệu API và server demo › [S1] app chính không có /dev: cửa cấp token chỉ nằm ở server demo
- ✅ Tài liệu API và server demo › [S2] server demo đi qua phân quyền thật ở /api và phục vụ Swagger UI

## test/oracle.test.js

- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × bob → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × carol → editor
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × frank → editor
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › api-spec × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × bob → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × carol → editor
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × frank → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › db-schema × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × bob → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × carol → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × frank → editor
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › postmortem × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × bob → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × carol → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × dave → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × gina → editor
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › pricing × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × bob → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × carol → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × dave → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × erin → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › forecast × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × bob → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × carol → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × dave → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × erin → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × gina → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › handbook × hank → viewer
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × bob → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × carol → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › bob-notes × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × alice → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × bob → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × carol → commenter
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × gina → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › draft × hank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × alice → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × bob → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × carol → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × dave → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × erin → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × frank → none
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × gina → owner
- ✅ Oracle: mức truy cập của từng user trên từng tài liệu › globex-plan × hank → editor
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › alice
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › bob
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › carol
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › dave
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › erin
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › frank
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › gina
- ✅ Oracle: GET /documents trả đúng tập tài liệu xem được › hank

## test/parity.test.js

- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › Check, thời điểm hôm nay (2026-11-04)
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › Check, thời điểm sau hạn chia sẻ của gina (2027-01-01)
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › ListObjects can_view document cho từng user
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › ListObjects can_view folder cho từng user
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › ListObjects can_view group cho từng user
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › ListUsers can_view cho từng tài liệu
- ✅ Parity: LocalEngine và OpenFGA cho cùng kết quả › Expand mọi relation trực tiếp của tài liệu

## test/sharing.test.js

- ✅ Chia sẻ cho user, nhóm, public link › owner chia sẻ viewer cho user → người đó xem được, không sửa được
- ✅ Chia sẻ cho user, nhóm, public link › chia sẻ cho nhóm: mọi member, kể cả qua nhóm con, nhận quyền
- ✅ Chia sẻ cho user, nhóm, public link › public link: mọi user đã đăng nhập xem được, kể cả org khác
- ✅ Chia sẻ cho user, nhóm, public link › public link chỉ ở mức viewer
- ✅ Chia sẻ cho user, nhóm, public link › đổi mức chia sẻ: thay mức cũ chứ không cộng dồn
- ✅ Chia sẻ cho user, nhóm, public link › gỡ chia sẻ → mất quyền ngay ở request kế tiếp
- ✅ Chia sẻ cho user, nhóm, public link › gỡ chia sẻ không tồn tại → 404
- ✅ Chia sẻ cho user, nhóm, public link › subject không tồn tại hoặc sai dạng → 400
- ✅ Ai được chia sẻ tiếp › viewer và commenter không chia sẻ được
- ✅ Ai được chia sẻ tiếp › editor là member của org chia sẻ được (intersection editor ∧ member org)
- ✅ Ai được chia sẻ tiếp › khách ngoài org là editor nhưng không chia sẻ tiếp được
- ✅ Ai được chia sẻ tiếp › người không thấy tài liệu nhận 404 chứ không phải 403
- ✅ Chính sách chia sẻ ra ngoài org › acme cho phép: chia sẻ cho user globex được
- ✅ Chính sách chia sẻ ra ngoài org › globex không cho phép: chia sẻ cho user acme hoặc tạo public link bị từ chối
- ✅ Chính sách chia sẻ ra ngoài org › không chia sẻ cho nhóm của org khác
- ✅ Chia sẻ có thời hạn (condition not_expired) › quyền của gina trên pricing hết khi qua expires_at
- ✅ Chia sẻ có thời hạn (condition not_expired) › tạo chia sẻ có hạn qua API
- ✅ Chia sẻ có thời hạn (condition not_expired) › hạn trong quá khứ hoặc sai định dạng → 400
- ✅ Chặn (exclusion: viewer but not blocked) › chặn thắng cả public link
- ✅ Chặn (exclusion: viewer but not blocked) › chặn một nhóm ở thư mục cha áp xuống mọi tài liệu con
- ✅ Chặn (exclusion: viewer but not blocked) › chỉ owner chặn được; editor thì không
- ✅ Chặn (exclusion: viewer but not blocked) › bỏ chặn trả lại quyền
- ✅ Chặn (exclusion: viewer but not blocked) › chặn trùng → 409; không chặn được public
- ✅ Ai có quyền (ListUsers) và vì sao (Expand) › access của api-spec: gồm người có quyền qua nhóm lồng nhau và thư mục cha
- ✅ Ai có quyền (ListUsers) và vì sao (Expand) › access của handbook: public, người bị chặn không được liệt kê
- ✅ Ai có quyền (ListUsers) và vì sao (Expand) › chỉ người chia sẻ được mới xem danh sách quyền
- ✅ Ai có quyền (ListUsers) và vì sao (Expand) › expand viewer của handbook: một tầng userset, chỉ tới thư mục cha
- ✅ Ai có quyền (ListUsers) và vì sao (Expand) › expand relation không tồn tại → 400
- ✅ Xem trước khi chia sẻ (contextual tuple) › trả quyền trước/sau mà không ghi tuple nào
- ✅ Xem trước khi chia sẻ (contextual tuple) › xem trước cho thấy chặn vẫn thắng

## test/tenant.test.js

- ✅ Cách ly org › admin acme không thấy gì của globex, kể cả danh sách
- ✅ Cách ly org › admin globex chỉ thấy tài liệu acme được chia sẻ hoặc public
- ✅ Cách ly org › nhật ký thay đổi quyền chỉ cho admin org, chỉ gồm object của org đó
- ✅ Thuộc tính tự khai của client không có tác dụng › header X-Org-Id, query orgId, body role không tăng quyền
- ✅ Thuộc tính tự khai của client không có tác dụng › body { role: "owner" } khi sửa tài liệu không làm editor thành owner
- ✅ Thuộc tính tự khai của client không có tác dụng › không ghi được tuple tùy ý: chia sẻ quan hệ ngoài danh sách cho phép → 400

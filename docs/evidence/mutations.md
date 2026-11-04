# Kiểm tra bộ test bằng cách làm sai model

Mỗi dòng sửa một luật trong `authz/model.fga`, chạy lại toàn bộ test (engine local), rồi khôi phục.

| Lỗi cố ý | Test đỏ | Ví dụ test bắt được |
| --- | --- | --- |
| document can_view bỏ "but not blocked" | 9 | Oracle: mức truy cập của từng user trên từng tài liệu postmortem × carol → none<br>Oracle: mức truy cập của từng user trên từng tài liệu handbook × frank → none |
| document sharer bỏ intersection với org member | 2 | Oracle: mức truy cập của từng user trên từng tài liệu pricing × gina → editor<br>Ai được chia sẻ tiếp khách ngoài org là editor nhưng không chia sẻ tiếp được |
| condition not_expired luôn đúng | 2 | Chia sẻ có thời hạn (condition not_expired) quyền của gina trên pricing hết khi qua expires_at<br>Chia sẻ có thời hạn (condition not_expired) tạo chia sẻ có hạn qua API |
| folder owner: mọi member org thay vì admin | 77 | Chia sẻ cho user, nhóm, public link owner chia sẻ viewer cho user → người đó xem được, không sửa được<br>Chia sẻ cho user, nhóm, public link gỡ chia sẻ → mất quyền ngay ở request kế tiếp |
| comment can_delete bỏ điều kiện can_view | 1 | Comment tác giả mất quyền xem tài liệu thì cũng không xóa được comment (deleter and can_view) |
| group can_view bỏ "member from org" | 1 | Nhóm lồng nhau mọi member org xem được nhóm của org; org khác → 404 |

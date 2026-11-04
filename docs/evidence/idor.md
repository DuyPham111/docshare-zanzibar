# Evidence IDOR/BOLA và leo thang quyền: đỏ trước khi sửa, xanh sau khi sửa

Mỗi mục tái hiện bản lỗi bằng cách bỏ đúng một lời gọi `enforce()` trong `src/services/documentService.js` (PEP), gửi request thật, chạy toàn bộ test (engine local), rồi khôi phục code và làm lại. Sinh bằng `npm run evidence`.

## IDOR/BOLA: erin đọc tài liệu không được chia sẻ cho mình

Request: `GET /documents/api-spec, token của erin`

Bản lỗi (bỏ kiểm quyền):

```diff
-   await enforce(user, 'can_view', `document:${id}`)
```

| | Response | Bộ test |
| --- | --- | --- |
| Trước khi sửa | **200** `{"id":"api-spec","title":"API specification","content":"REST API v2 cho DocShare.","orgId":"acme","folderId":"specs","createdBy":"bob","capabilities":{"can_comment":false,"can_edit":false,"can_share":false,"can_delete":false,"can_block":false}}` | **69 test đỏ**, ví dụ: Đọc và sửa tài liệu không có quyền xem → 404 giống hệt tài liệu không tồn tại; Nhất quán list và check: documents alice; Nhất quán list và check: documents bob |
| Sau khi sửa (bản nộp) | **404** `{"error":"not_found"}` | **224 passed, 0 failed** |

## Leo thang dọc (BFLA): erin chỉ là viewer của handbook nhưng sửa được

Request: `PATCH /documents/handbook {"title":"Bị sửa trái phép"}, token của erin`

Bản lỗi (bỏ kiểm quyền):

```diff
-   await enforce(user, 'can_edit', object)
```

| | Response | Bộ test |
| --- | --- | --- |
| Trước khi sửa | **200** `{"id":"handbook","title":"Bị sửa trái phép","content":"Sổ tay nhân viên, công khai.","orgId":"acme","folderId":"public","createdBy":"alice"}` | **3 test đỏ**, ví dụ: Đọc và sửa tài liệu xem được nhưng không được sửa → 403; Vận hành [P6] Zanzibar lỗi hoặc mất kết nối → 500, không trả dữ liệu (fail closed); Đọc và sửa tài liệu commenter không sửa được nội dung |
| Sau khi sửa (bản nộp) | **403** `{"error":"forbidden"}` | **224 passed, 0 failed** |

# Nhóm 07: DocShare, phân quyền kiểu Zanzibar cho hệ thống chia sẻ tài liệu

**Thành viên:** 23127045 · 23127102 · 23127159 · 23127183 · 23127393.

DocShare là một API chia sẻ tài liệu giống Google Drive, gồm:

- org (tenant), nhóm lồng nhau, thư mục lồng nhau, tài liệu, comment;
- chia sẻ cho user, cho nhóm hoặc qua public link; chia sẻ có thời hạn; chặn người dùng.

Mọi quyết định phân quyền do **Zanzibar** trả lời, cụ thể là [OpenFGA](https://openfga.dev) v1.22.1. Kèm theo là một engine Zanzibar nhóm tự viết, đọc cùng file chính sách [`authz/model.fga`](authz/model.fga).

Gói nộp gồm:

- mã nguồn và dữ liệu [`data/`](data/README.md);
- README này (hướng dẫn triển khai);
- [**REPORT.md**](REPORT.md) và [**REPORT.html**](REPORT.html): giải thích các lựa chọn của nhóm;
- evidence chạy thật, trang demo, đặc tả OpenAPI và Swagger UI.

| Kết quả | Giá trị |
| --- | --- |
| Ma trận oracle viết tay (8 user × 9 tài liệu) | **72/72** ô khớp trên cả hai engine ([oracle-matrix.md](docs/oracle-matrix.md)) |
| Automated test, engine tự viết | **222/222** (`npm test`; 7 test parity cần OpenFGA nên bỏ qua) |
| Automated test, OpenFGA v1.22.1 | **243/243** (`npm run test:openfga`, gồm engine test và parity) |
| Parity hai engine | 1.920 câu Check (960 × 2 thời điểm), cùng ListObjects, ListUsers, Expand: **0 khác biệt** |
| Mutation test model | 6/6 lỗi cố ý bị test bắt ([mutations.md](docs/evidence/mutations.md)) |
| Coverage `src/` (chạy trên OpenFGA) | 96,5% dòng; `access.js`, `cel.js` 100% |

## 1. Yêu cầu môi trường

- **Node.js ≥ 22**. Ứng dụng dùng `process.loadEnvFile` có sẵn để đọc `.env`. Gói đã kiểm tra trên Node **22.16.0**, npm 11.7.
- Cần Internet khi cài dependency lần đầu và khi kéo image OpenFGA.
- Chạy được trên Windows PowerShell, macOS và Linux.
- **Docker Desktop / Docker Engine**:
  - **cần** nếu muốn chạy OpenFGA thật (mục 3, 5);
  - **không cần** nếu chỉ chạy test và demo bằng engine tự viết (mục 2).
- Các cổng phải trống: **3000** (API), **3200** (server demo), **8080/8081** (OpenFGA).

## 2. Chạy nhanh, không cần Docker

Mở terminal tại thư mục chứa `package.json`:

~~~powershell
node --version          # >= 22
npm ci                  # cài đúng phiên bản trong package-lock.json
npm test                # 222 test trên engine tự viết, khoảng 15 giây
npm run demo            # trang demo http://localhost:3200, Swagger UI http://localhost:3200/docs
~~~

`npm start` chạy API thuần tại http://localhost:3000. Kiểm tra nhanh ở terminal thứ hai:

~~~bash
curl http://localhost:3000/health                                     # {"status":"ok","authzEngine":"local"}
TOKEN=$(npm run -s token -- erin)
curl -i http://localhost:3000/documents -H "Authorization: Bearer $TOKEN"            # forecast, handbook
curl -i http://localhost:3000/documents/api-spec -H "Authorization: Bearer $TOKEN"   # 404 (che sự tồn tại)
curl -i -X PATCH http://localhost:3000/documents/handbook -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"title":"x"}'                        # 403 (xem được, không sửa được)
~~~

Trên PowerShell: `$TOKEN = npm run -s token -- erin`, rồi dùng `curl.exe` thay cho `curl`.

## 3. Chạy với OpenFGA thật

~~~bash
npm run fga:up          # docker compose up -d openfga  (OpenFGA v1.22.1, datastore memory)
npm run test:openfga    # 243 test: toàn bộ test HTTP chạy lại trên OpenFGA + engine test + parity
npm run demo:openfga    # trang demo dùng OpenFGA
npm run fga:down        # tắt
~~~

Muốn API dùng OpenFGA khi chạy `npm start`, đặt `AUTHZ_ENGINE=openfga` trong `.env`. Lần khởi động nào API cũng tạo một store mới, ghi model và seed tuple vào đó, rồi xóa store cũ cùng tên.

## 4. Cấu hình

Môi trường dev không bắt buộc có `.env`: thiếu file thì app dùng giá trị mặc định cho lab. Muốn đổi thì sao chép [`.env.example`](.env.example) thành `.env`:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `JWT_SECRET` | `docshare-dev-secret` (chỉ dev) | Khóa ký JWT HS256. **Bắt buộc** khi `NODE_ENV=production`; thiếu thì app từ chối khởi động |
| `AUTHZ_ENGINE` | `local` | `local`: engine tự viết. `openfga`: OpenFGA server |
| `FGA_API_URL` | `http://localhost:8080` | HTTP API của OpenFGA |
| `AUDIT_LOG` | `deny` (`off` khi chạy test) | Ghi quyết định phân quyền ra stdout dạng JSON Lines: `off`, `deny`, `all` |
| `PORT` | `3000` | Cổng API |
| `DEMO_PORT` | `3200` | Cổng server demo |

`npm start`, `npm run demo` và `npm run token` đều tự đọc `.env`, nên token sinh ra khớp với server đang chạy.

## 5. Triển khai bằng Docker

~~~bash
cp .env.example .env    # rồi đặt JWT_SECRET ngẫu nhiên
docker compose up --build
~~~

Lệnh trên chạy OpenFGA (datastore memory) và API tại http://localhost:3000.

~~~bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build
~~~

Lệnh trên chạy bản lưu bền: OpenFGA lưu tuple vào **PostgreSQL 17**. Container `openfga-migrate` tạo schema trước, rồi mới khởi động OpenFGA.

- Image API dùng `node:22-alpine`, `npm ci --omit=dev`, chạy bằng user `node`, có `HEALTHCHECK` gọi `/health`, và dừng gọn khi nhận `SIGTERM`.
- Image **không** chứa `demo/`, `test/`, `scripts/`, nên trên production không có endpoint cấp token `/dev/*`.
- Thiếu `JWT_SECRET` thì container API thoát ngay với lỗi `JWT_SECRET is required`.
- Đã chạy thử cả hai cấu hình. Với Postgres: API healthy, Gina thấy đúng 3 tài liệu, khởi động lại API vẫn chỉ còn 1 store hoạt động.

## 6. Trang demo và tài liệu API

`npm run demo` (hoặc `npm run demo:openfga`) mở http://localhost:3200. Server demo chỉ nghe trên 127.0.0.1. Trang demo cho phép:

- đăng nhập thành bất kỳ user nào trong seed;
- duyệt thư mục, tài liệu và nhóm, kèm các cờ quyền (`can_*`) của mỗi object;
- chia sẻ, chặn, xem trước khi chia sẻ (contextual tuple);
- xem "ai có quyền" (ListUsers), cây giải thích (Expand), nhật ký thay đổi tuple của org (ReadChanges);
- xem **ma trận quyền của mọi user** trên object đang chọn; hàng nào vừa đổi quyền sau thao tác cuối được viền vàng;
- dùng nút "Gửi PATCH trực tiếp" để chứng minh ẩn nút trên giao diện không chặn được request: server vẫn trả 403.

Swagger UI ở http://localhost:3200/docs đọc [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1, 40 operation). Mỗi operation ghi relation cần có (`x-relation`) và API Zanzibar được dùng (`x-zanzibar`). Lấy token bằng `npm run token -- bob`, bấm **Authorize**, rồi dùng "Try it out".

## 7. Lệnh thường dùng

| Lệnh | Việc |
| --- | --- |
| `npm test` / `npm run test:openfga` / `npm run test:all` | Test trên engine tự viết / trên OpenFGA / cả hai |
| `npm run test:coverage` | Coverage |
| `npm run token -- <user>` | In JWT của một user (alice, bob, carol, dave, erin, frank, gina, hank) |
| `npm run oracle` | Ghi [`docs/oracle-matrix.md`](docs/oracle-matrix.md): kỳ vọng viết tay so với kết quả engine |
| `npm run evidence` | Ghi [`docs/evidence/`](docs/evidence): kết quả test của hai engine và mutation test (cần OpenFGA) |
| `npm run report` | Dựng lại `REPORT.html` từ `report/slides/*.html` |

## 8. Cấu trúc thư mục

```
authz/model.fga                 Chính sách Zanzibar (OpenFGA DSL), nguồn duy nhất cho cả hai engine
data/seed.json                  Dataset lab: org, user, nhóm, thư mục, tài liệu, comment, tuple chia sẻ
src/
  app.js, server.js, auth.js    Express app, khởi động, xác thực JWT (chỉ sub)
  authz/index.js                Cổng PDP duy nhất của app: check, batchCheck, listObjects, listUsers, expand...
  authz/engine/local.js         Engine Zanzibar tự viết (Check theo userset rewrite, ListObjects, ...)
  authz/engine/openfga.js       Adapter OpenFGA (@openfga/sdk, HIGHER_CONSISTENCY)
  authz/cel.js                  Tập con CEL cho condition
  services/*.js                 PEP: document, folder, share, group, comment, org; access.js = enforce()
  routes/index.js               Route mỏng, chỉ gọi service
demo/                           Server demo (127.0.0.1) + trang demo + Swagger UI
test/                           Jest + Supertest; oracle.js = kỳ vọng viết tay
docs/                           openapi.yaml, thiet-ke.md, oracle-matrix.md, evidence/
report/                         Slide nguồn của REPORT.html
```

## 9. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `OpenFGA không phản hồi ở http://localhost:8080` | Chạy `npm run fga:up`; kiểm tra `curl localhost:8080/healthz` trả `SERVING` |
| Cổng 8080 đang bị chiếm | Đổi cổng trong `docker-compose.yml` (ví dụ `"18080:8080"`) và đặt `FGA_API_URL=http://localhost:18080` |
| `401 invalid_token` khi gọi container | Token phải ký bằng đúng `JWT_SECRET` của container: đặt cùng giá trị trong `.env` rồi chạy `npm run token` |
| Container API thoát ngay | Chưa đặt `JWT_SECRET` (xem `docker compose logs api`) |
| Test chia sẻ có hạn "đúng hôm nay, sai ngày mai" | Không xảy ra: test dùng đồng hồ giả (`src/clock.js`). Riêng seed của gina hết hạn thật sau 2026-12-31 khi chạy demo |

## 10. Giới hạn đã biết

Chi tiết ở [REPORT.md §10](REPORT.md#10-giới-hạn-và-hướng-phát-triển).

- Dữ liệu nghiệp vụ nằm trong RAM. API nạp lại seed mỗi lần khởi động; OpenFGA có thể chạy memory hoặc Postgres.
- Dual write giữa db và OpenFGA chưa có outbox.
- ListObjects của engine tự viết là O(N).

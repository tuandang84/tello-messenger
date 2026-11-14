# Kiến trúc Tello Messenger

Tài liệu này mô tả cách các thành phần nói chuyện với nhau. Nếu bạn chỉ muốn build, xem
[README](../README.md).

## Tổng quan

Ba tiến trình, một cửa sổ:

```
src/            React 19 + Vite + Zustand (chạy trong WebView2)
src-tauri/      Rust: vòng đời cửa sổ, tray, spawn sidecar
core-sidecar/   Bun + TypeScript: Telegram, Zalo, SQLite, vault
```

- **UI** không bao giờ gọi trực tiếp Telegram/Zalo. Nó gửi lệnh qua `invoke("core_send")` và
  nhận sự kiện `core:event`.
- **Rust** chỉ là vỏ: spawn sidecar, chuyển tiếp stdout theo dòng thành event, giữ cửa sổ/tray.
- **Sidecar** sở hữu toàn bộ trạng thái mạng và cơ sở dữ liệu.

## Giao thức sidecar

JSON theo dòng (NDJSON) trên stdin/stdout. `stdout` chỉ dành cho giao thức; mọi log đi `stderr`
(sidecar ghi đè `console.log`).

Yêu cầu từ host:

```json
{ "id": "req_1", "cmd": "messages.send", "chatId": "tg_123", "text": "xin chào" }
```

Phản hồi:

```json
{ "type": "res", "id": "req_1", "ok": true, "data": { "message": { "...": "..." } } }
```

Sự kiện:

```json
{ "type": "event", "event": "message:new", "data": { "message": { "...": "..." } } }
```

### Lệnh

| Nhóm | Lệnh |
| --- | --- |
| Ứng dụng | `app.info`, `config.get`, `config.set` |
| Xác thực | `auth.status`, `auth.telegram.start/code/password/logout`, `auth.zalo.start/logout` |
| Hội thoại | `chats.list`, `chats.refresh` |
| Tin nhắn | `messages.list`, `messages.send`, `messages.sendMedia`, `messages.read`, `messages.active` |
| Tệp | `media.get`, `vault.status`, `vault.flush` |

### Sự kiện

`core:ready`, `auth:status`, `chats`, `messages`, `message:new`, `message:update`,
`zalo:qr`, `zalo:scanned`, `zalo:qr_expired`, `tg:need_code`, `tg:need_password`, `tg:error`,
`vault:status`, `notice`.

## Mô hình dữ liệu

ID hợp nhất:

- Hội thoại Telegram: `tg_<peerId>`; Zalo: `zl_<threadId>`.
- Tin nhắn: `<chatId>_<idGốc>` — nhờ vậy `media.get` tìm được cả tin Telegram và Zalo.

Bảng SQLite (`src-tauri` không can thiệp):

| Bảng | Vai trò |
| --- | --- |
| `chats` | Danh sách hội thoại, preview, chưa đọc |
| `messages` | Tin nhắn + `media_json` (kind/name/mime/size/localPath/vaulted) |
| `vault_queue` | Job đang chờ đẩy lên Telegram (bền vững qua khởi động lại) |
| `vault_map` | `zalo_msg_id → tg_peer + tg_message_id` |

Luồng vault:

```
tin nhắn Zalo có tệp
  → zalo.downloadAttachment()  (media/)
  → copy sang cache/           (xem ngay trong UI)
  → vault_queue INSERT
  → telegram.uploadToVault()   (peer mặc định "me", forceDocument: true, caption #tello)
  → vault_map INSERT
  → xoá tệp trong media/
  → message.media.vaulted = true
```

`forceDocument: true` giữ nguyên byte gốc: nếu thiếu, Telegram sẽ nén ảnh/video và bản lưu không
còn là tệp gốc. Caption chứa `#tello` để tìm nhanh trong Saved Messages trên điện thoại.

Nếu bước upload thất bại, job ở lại queue và thử lại sau 30 giây. Tệp tạm chỉ bị xoá khi mọi
bước trên đã commit.

## Bảo mật

- `sessions.enc`: AES-256-GCM, IV ngẫu nhiên mỗi lần ghi, ghi qua file tạm rồi `rename`.
- `secret.key`: 32 byte ngẫu nhiên, quyền chỉ chủ sở hữu.
- Khoá nằm cạnh dữ liệu → chống đọc lén khi copy một file, nhưng **không** chống được kẻ đọc
  toàn bộ thư mục. Khuyến nghị BitLocker.
- Không có telemetry, không có server của dự án.

## Biên dịch sidecar

`bun build src/index.ts --compile` tạo một file `.exe` tự chứa (Bun runtime + code). Tauri đóng
gói file này qua `bundle.externalBin` trong `tauri.conf.json`, với hậu tố target triple do Tauri
yêu cầu (`core-sidecar-x86_64-pc-windows-msvc.exe`).

Vì vậy mỗi lần đổi `core-sidecar/src/**` phải chạy lại `npm run sidecar:build` trước khi build
Tauri.

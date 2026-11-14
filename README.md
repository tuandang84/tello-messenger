# Tello Messenger

> Hộp thư hợp nhất **Telegram + Zalo** cho Windows — xây bằng Tauri v2, React và Bun.

Tello gộp hội thoại Telegram và Zalo vào một cửa sổ duy nhất, lưu lịch sử cục bộ để tra cứu
tức thì, và **đẩy tệp Zalo lên kho Telegram** để giải phóng ổ cứng mà vẫn giữ được tệp gốc.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078d4)

> **Trạng thái:** alpha (`0.1.0`). Đang dùng hằng ngày nhưng API và giao diện còn có thể thay đổi.
> Tello là dự án **không chính thức**, không liên kết với Telegram hay Zalo.

---

## Tính năng

- **Một danh sách hội thoại** cho cả Telegram và Zalo, có bộ lọc theo nền tảng và chưa đọc.
- **Nhắn tin hai chiều**: văn bản, ảnh, video, tài liệu; tải tệp về khi cần.
- **Kho Telegram (vault)**: tệp Zalo được tải về, đẩy lên Saved Messages (hoặc supergroup riêng)
  qua **hàng đợi bền vững trong SQLite**. Tệp tạm chỉ bị xoá sau khi Telegram xác nhận đã lưu và
  ánh xạ đã ghi vào cơ sở dữ liệu — mất mạng hay tắt app giữa chừng không làm mất tệp.
- **Lịch sử cục bộ**: `tello.db` (SQLite) giữ hội thoại và tin nhắn để mở tức thì, kể cả khi
  đang ngoại tuyến.
- **Đăng nhập Telegram** bằng số điện thoại + mã xác nhận + mật khẩu 2FA.
- **Đăng nhập Zalo** bằng mã QR như Zalo Web.
- **Khay hệ thống**: đóng cửa sổ (X) chỉ ẩn xuống tray, thoát hẳn bằng menu tray.
- **Giao diện tối, tiếng Việt**, tối ưu cho Windows.

## Kiến trúc

```
┌──────────────────────────────┐
│  React 19 + Vite (WebView2)  │  Giao diện, Zustand store
└──────────────┬───────────────┘
               │ Tauri IPC (invoke + events)
┌──────────────▼───────────────┐
│  Rust shell (Tauri v2)       │  Cửa sổ, tray, spawn/giám sát sidecar
└──────────────┬───────────────┘
               │ stdin/stdout — JSON theo dòng
┌──────────────▼───────────────┐
│  Bun sidecar (binary .exe)   │
│  ├─ teleproto → Telegram     │  MTProto
│  ├─ zca-js    → Zalo         │  Zalo Web API
│  └─ bun:sqlite → tello.db    │  chats / messages / vault
└──────────────────────────────┘
```

Mọi thứ chạy trên máy bạn. Không có server trung gian của Tello.

## Yêu cầu

| Thành phần | Phiên bản |
| --- | --- |
| Windows | 10/11 (x64), WebView2 Runtime |
| Node.js + npm | 20+ |
| Bun | 1.2+ (dùng để build sidecar) |
| Rust | stable, toolchain `x86_64-pc-windows-msvc` |
| Visual Studio Build Tools | “Desktop development with C++” |

## Cài đặt và chạy

```powershell
git clone https://github.com/<username>/tello-messenger.git
cd tello-messenger

npm install          # phụ thuộc giao diện
npm run sidecar:build # bun install + biên dịch sidecar thành .exe
npm run tauri dev    # chạy bản phát triển
```

Build bản phát hành (NSIS installer):

```powershell
npm run sidecar:build
npm run tauri build
# Kết quả: src-tauri/target/release/bundle/nsis/Tello_0.1.0_x64-setup.exe
```

> Sidecar đã biên dịch (`src-tauri/binaries/*.exe`, ~120 MB) không nằm trong repo.
> Bạn **phải** chạy `npm run sidecar:build` trước khi `npm run tauri dev` hoặc `npm run tauri build`.

Tuỳ chọn: tạo lại icon từ `assets/tello.svg` bằng `npm run icon`.

## Phát hành lên GitHub

Nếu bạn là maintainer và muốn đẩy bản sao này lên GitHub, dùng script có sẵn:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1
```

Script sẽ đăng nhập GitHub CLI (nếu cần), tạo commit đầu tiên với email noreply của tài khoản,
tạo repo `tello-messenger` công khai và push nhánh `main`, sau đó gắn topic. Đổi tên repo bằng
`-Repo ten-khac` nếu muốn.

## Cấu hình Telegram API

Tello dùng sẵn cặp `api_id` / `api_hash` công khai của Telegram Desktop để chạy ngay. Bạn nên
thay bằng cặp của riêng mình:

1. Truy cập <https://my.telegram.org> → *API development tools*.
2. Tạo ứng dụng, lấy `api_id` và `api_hash`.
3. Trong Tello: **Cài đặt → Thông tin kỹ thuật Telegram**, dán giá trị và lưu.
4. Thay đổi có hiệu lực ở lần đăng nhập Telegram kế tiếp.

## Kho Telegram hoạt động thế nào

1. Tin nhắn Zalo có tệp → sidecar tải tệp về thư mục `media/` và chép một bản vào `cache/`.
2. Một job được ghi vào bảng `vault_queue` trong SQLite.
3. Khi Telegram đã kết nối, job được đẩy lên peer trong **Cài đặt → Kho Telegram**
   (mặc định `me` = Saved Messages). Tệp luôn gửi dạng **document gốc** (`forceDocument`),
   không bị Telegram nén lại, kèm caption có thẻ `#tello` để tra cứu trên điện thoại.
4. Telegram trả về `message_id` → Tello ghi ánh xạ vào `vault_map` → **sau đó** mới xoá tệp tạm.
5. Lỗi mạng: thử lại mỗi 30 giây, tối đa 3 lần; nút **Đẩy lại hàng đợi** để thử tiếp.

Bạn có thể trỏ vault vào một supergroup riêng (ví dụ `-1001234567890`) để dễ tra cứu trên
điện thoại.

## Dữ liệu trên máy

Thư mục: `%LOCALAPPDATA%\com.tello.desktop\`

| Tệp | Nội dung |
| --- | --- |
| `tello.db` | SQLite: hội thoại, tin nhắn, hàng đợi và ánh xạ vault |
| `config.json` | `api_id`, `api_hash`, peer nhận vault |
| `sessions.enc` | Phiên Telegram + Zalo, mã hoá AES-256-GCM |
| `secret.key` | Khoá AES dùng cho `sessions.enc` |
| `media/`, `cache/` | Tệp tạm và bản cache tải về |

**Lưu ý bảo mật:** khoá AES nằm cùng thư mục với dữ liệu, nên đây là lớp che giấu + chống sửa
đổi khi lưu trên đĩa, **không thay thế** mã hoá ổ đĩa của hệ điều hành. Hãy bật BitLocker cho ổ
chứa dữ liệu cá nhân. Xoá cả thư mục trên để đăng xuất hoàn toàn và xoá lịch sử cục bộ.

## Giới hạn đã biết

- **Chỉ Windows**: sidecar được biên dịch cho `x86_64-pc-windows-msvc`.
- **Zalo Web chỉ một phiên**: đăng nhập Tello sẽ chiếm phiên Zalo Web; đừng mở Zalo Web ở trình
  duyệt khác cùng lúc. Điện thoại vẫn dùng bình thường.
- **Zalo không có API chính thức**: `zca-js` dùng giao thức web, có thể hỏng khi Zalo đổi API và
  có rủi ro với tài khoản. Hãy dùng tài khoản phụ nếu bạn lo ngại.
- **Lịch sử Zalo**: chỉ nhóm có API lịch sử; tin nhắn riêng được ghi lại từ khi Tello kết nối.
- Chưa hỗ trợ: chỉnh sửa/xoá tin nhắn, thả cảm xúc, gọi điện, render sticker động, thông báo
  desktop, tự cập nhật.
- Danh sách tin nhắn chưa ảo hoá (virtualized) — hội thoại rất dài có thể chậm.

## Lộ trình

- [ ] Thông báo desktop + badge trên tray
- [ ] Chỉnh sửa / xoá / trả lời tin nhắn
- [ ] Render sticker, voice message có trình phát
- [ ] Ảo hoá danh sách tin nhắn và tải lịch sử theo trang
- [ ] Lưu khoá vào Windows Credential Manager
- [ ] Build macOS / Linux
- [ ] Tự động cập nhật (Tauri updater)

## Đóng góp

Rất hoan nghênh issue và pull request. Đọc [CONTRIBUTING.md](CONTRIBUTING.md) trước khi bắt đầu.
Lỗ hổng bảo mật: xem [SECURITY.md](SECURITY.md), vui lòng **không** mở issue công khai.

## Giấy phép

[MIT](LICENSE) © 2026 Tello Messenger contributors.

## Miễn trừ trách nhiệm

Tello là công cụ không chính thức, không được Telegram hay V-Zalo (Zalo) bảo trợ hay chấp thuận.
Việc dùng client không chính thức có thể vi phạm điều khoản dịch vụ của các nền tảng và có rủi ro
với tài khoản của bạn. Bạn tự chịu trách nhiệm khi sử dụng.

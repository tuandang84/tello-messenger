# Chính sách bảo mật

Tello xử lý phiên đăng nhập Telegram/Zalo và lịch sử tin nhắn trên máy người dùng, nên báo cáo
bảo mật được ưu tiên.

## Báo cáo

Vui lòng **không** mở issue công khai. Hãy dùng *Report a vulnerability* trong tab **Security**
của repository GitHub để gửi báo cáo riêng cho maintainer.

Kèm theo: phiên bản, hệ điều hành, mô tả tác động, bước tái hiện, proof of concept nếu có.

## Phạm vi

- Rò rỉ hoặc giải mã được `sessions.enc` khi không có quyền đọc thư mục dữ liệu.
- Leo thang đặc quyền qua sidecar / IPC của Tauri.
- SSRF hoặc ghi file tuỳ ý qua lệnh `messages.sendMedia` / `media.get`.
- Rò rỉ token, session hay nội dung tin nhắn ra ngoài máy.

## Ngoài phạm vi

- Cần quyền truy cập vật lý hoặc quyền đọc toàn bộ thư mục dữ liệu (khi đó `secret.key` cũng lộ).
- Tấn công vào chính Telegram/Zalo hoặc giao thức của họ.
- Việc dùng client không chính thức vi phạm điều khoản nền tảng.

Chúng tôi sẽ phản hồi trong vòng 7 ngày và ghi công nếu bạn muốn.

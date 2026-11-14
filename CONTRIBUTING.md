# Đóng góp cho Tello Messenger

Cảm ơn bạn đã quan tâm! Dưới đây là những điều cần biết để thay đổi của bạn dễ được merge.

## Môi trường phát triển

```powershell
npm install
npm run sidecar:build
npm run tauri dev
```

Kiểm tra trước khi mở PR:

```powershell
npm run build                 # typecheck + build giao diện
cd core-sidecar; bunx tsc --noEmit
cd ..\src-tauri; cargo check
```

Nếu sửa `core-sidecar/src/**`, nhớ chạy `npm run sidecar:build` để cập nhật binary mà Tauri dùng.

## Quy ước code

- TypeScript strict, không dùng `any` mới nếu tránh được (một số payload thư viện buộc phải có).
- Giữ giao diện tiếng Việt, câu ngắn, không viết tắt khó hiểu.
- Component React đặt trong `src/components`, logic trạng thái trong `src/store`.
- Sidecar: mỗi nền tảng một file (`telegram.ts`, `zalo.ts`); `index.ts` chỉ dispatch.
- Comment giải thích *vì sao*, không mô tả lại code.
- Không commit `src-tauri/binaries/*.exe`, `node_modules`, `dist`, `target`.

## Commit & PR

- Commit nhỏ, thông điệp dạng `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- PR mô tả: vấn đề, cách sửa, cách kiểm tra, ảnh chụp nếu là thay đổi giao diện.
- Với thay đổi ảnh hưởng dữ liệu (schema SQLite, vault), nêu rõ đường nâng cấp.

## Báo lỗi

Mở issue với: phiên bản Tello, Windows, các bước tái hiện, log từ terminal `tauri dev`.
**Không** dán session, mã QR, `api_hash` hay nội dung tin nhắn riêng tư vào issue.

Lỗ hổng bảo mật: xem [SECURITY.md](SECURITY.md).

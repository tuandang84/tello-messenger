import { useApp } from "../store/useAppStore";
import { CloseIcon, TelegramIcon } from "./Icons";

export function TelegramQrModal() {
  const auth = useApp((state) => state.auth);
  const qr = useApp((state) => state.telegramQr);
  const scanned = useApp((state) => state.telegramScanned);
  const hidden = useApp((state) => state.telegramQrHidden);
  const hide = useApp((state) => state.hideTelegramQr);

  const waiting = auth.telegram.phase === "waiting_qr" || auth.telegram.phase === "connecting";
  if (!waiting || hidden || (!qr && !scanned)) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Đăng nhập Telegram bằng mã QR">
      <div className="qr-modal">
        <button type="button" className="modal-close" onClick={hide} aria-label="Ẩn">
          <CloseIcon size={20} />
        </button>
        <span className="qr-icon">
          <TelegramIcon size={22} />
        </span>
        <h2>Đăng nhập Telegram</h2>
        <p className="qr-hint">Mở ứng dụng Telegram trên điện thoại → Quét mã QR để đăng nhập.</p>

        <div className="qr-frame">
          {qr ? (
            <img src={qr} alt="Mã QR đăng nhập Telegram" />
          ) : (
            <div className="qr-placeholder">
              <span className="spinner" />
            </div>
          )}
          {scanned && !qr && <div className="qr-scanned">✓ {scanned}</div>}
        </div>

        <div className="qr-status">
          {scanned && qr ? (
            <span>{scanned}</span>
          ) : (
            <span>
              <span className="spinner small" /> {qr ? "Đang chờ quét mã…" : "Đang tạo mã QR…"}
            </span>
          )}
        </div>

        <p className="qr-note">
          Lưu ý: Mã QR chỉ có hiệu lực trong thời gian ngắn. Quét trong Telegram app (Settings → Devices → Link device).
        </p>

        <button type="button" className="ghost-button" onClick={hide}>
          Ẩn và tiếp tục dùng Tello
        </button>
      </div>
    </div>
  );
}
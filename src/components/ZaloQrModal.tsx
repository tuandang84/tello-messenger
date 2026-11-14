import { useApp } from "../store/useAppStore";
import { CloseIcon, ZaloIcon } from "./Icons";

export function ZaloQrModal() {
  const auth = useApp((state) => state.auth);
  const qr = useApp((state) => state.zaloQr);
  const scanned = useApp((state) => state.zaloScanned);
  const hidden = useApp((state) => state.zaloQrHidden);
  const hide = useApp((state) => state.hideZaloQr);

  const waiting = auth.zalo.phase === "waiting_qr" || auth.zalo.phase === "connecting";
  if (!waiting || hidden || (!qr && !scanned)) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Đăng nhập Zalo bằng mã QR">
      <div className="qr-modal">
        <button type="button" className="modal-close" onClick={hide} aria-label="Ẩn">
          <CloseIcon size={20} />
        </button>
        <span className="qr-icon">
          <ZaloIcon size={22} />
        </span>
        <h2>Đăng nhập Zalo</h2>
        <p className="qr-hint">Mở ứng dụng Zalo trên điện thoại → Quét mã QR để đăng nhập.</p>

        <div className="qr-frame">
          {qr ? (
            <img src={qr} alt="Mã QR đăng nhập Zalo" />
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
          Lưu ý: Zalo chỉ cho phép một phiên Web hoạt động. Khi Tello đang kết nối, đừng mở Zalo Web
          trên trình duyệt khác.
        </p>

        <button type="button" className="ghost-button" onClick={hide}>
          Ẩn và tiếp tục dùng Tello
        </button>
      </div>
    </div>
  );
}

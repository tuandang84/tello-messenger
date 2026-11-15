import { useState } from "react";
import { useApp } from "../store/useAppStore";
import { CloudIcon, LockIcon, ShieldIcon, TelegramIcon, ZaloIcon } from "./Icons";

export function Onboarding() {
  const auth = useApp((state) => state.auth);
  const step = useApp((state) => state.telegramStep);
  const startTelegram = useApp((state) => state.startTelegram);
  const submitCode = useApp((state) => state.submitTelegramCode);
  const submitPassword = useApp((state) => state.submitTelegramPassword);
  const resetStep = useApp((state) => state.resetTelegramStep);
  const startZalo = useApp((state) => state.startZalo);
  const showZaloQr = useApp((state) => state.showZaloQr);
  const dismiss = useApp((state) => state.dismissOnboarding);

  const [phone, setPhone] = useState("+84");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const zalo = auth.zalo;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setLocalError(null);
    try {
      await action();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-panel">
        <section className="onboarding-hero">
          <div className="hero-brand">
            <div className="brand-mark large">
              <img src="/logo.png" alt="Tello" />
            </div>
            <span>Tello</span>
          </div>
          <h1>Một cửa sổ cho Telegram và Zalo</h1>
          <p>
            Nhắn tin hai chiều với cả hai nền tảng, gộp hội thoại vào một danh sách và đẩy tệp Zalo
            lên kho Telegram để không phình ổ cứng.
          </p>

          <ul className="hero-list">
            <li>
              <CloudIcon size={18} />
              <div>
                <strong>Kho Telegram vô hạn</strong>
                <span>Ảnh, video, tài liệu Zalo được lưu vĩnh viễn trên cloud Telegram.</span>
              </div>
            </li>
            <li>
              <ShieldIcon size={18} />
              <div>
                <strong>Ưu tiên cục bộ</strong>
                <span>Phiên đăng nhập mã hoá AES, lịch sử tra cứu nằm trên máy của bạn.</span>
              </div>
            </li>
            <li>
              <LockIcon size={18} />
              <div>
                <strong>Không qua server trung gian</strong>
                <span>Kết nối trực tiếp tới Telegram và Zalo từ máy Windows.</span>
              </div>
            </li>
          </ul>

          <div className="hero-footnote">
            Zalo cá nhân dùng giao thức Web; chỉ chạy một phiên Zalo Web tại một thời điểm. Trên điện
            thoại bạn vẫn dùng ứng dụng Zalo bình thường.
          </div>
        </section>

        <section className="onboarding-actions">
          <h2>Kết nối tài khoản</h2>
          <p className="section-sub">Bạn có thể bỏ qua và kết nối sau trong Cài đặt.</p>

          <article className="connect-card">
            <header>
              <span className="connect-icon telegram">
                <TelegramIcon size={20} />
              </span>
              <div>
                <strong>Telegram</strong>
                <small>
                  {auth.telegram.connected
                    ? auth.telegram.user ?? "Đã kết nối"
                    : auth.telegram.phase === "waiting_qr"
                      ? "Đang chờ quét mã QR"
                      : "Đăng nhập bằng số điện thoại + mã xác nhận"}
                </small>
              </div>
              {auth.telegram.connected && <span className="connected-pill">Đã kết nối</span>}
            </header>

            {!auth.telegram.connected && (
              <div className="connect-form">
                {step === "phone" && (
                  <>
                    <label>
                      Số điện thoại
                      <input
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+8490..."
                        inputMode="tel"
                        autoFocus
                      />
                    </label>
                    <div className="step-buttons">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy || phone.replace(/\D/g, "").length < 7}
                        onClick={() => void run(() => startTelegram(phone.trim()))}
                      >
                        {busy ? "Đang gửi mã…" : "Gửi mã xác nhận"}
                      </button>
                      <button
                        type="button"
                        className="link-button secondary"
                        onClick={() => {
                          resetStep();
                          setLocalError(null);
                        }}
                      >
                        Đổi số điện thoại
                      </button>
                      {/* QR login temporarily disabled - use phone login */}
                      {/* <button
                        type="button"
                        className="link-button secondary"
                        onClick={() => {
                          // Start Telegram QR login
                          resetStep();
                          setLocalError(null);
                          set({ telegramStep: "qr" });
                        }}
                      >
                        Quét mã QR
                      </button> */}
                    </div>
                  </>
                )}

                {step === "code" && (
                  <>
                    <label>
                      Mã xác nhận
                      <input
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="12345"
                        inputMode="numeric"
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || code.trim().length < 3}
                      onClick={() => void run(() => submitCode(code.trim()))}
                    >
                      {busy ? "Đang xác nhận…" : "Xác nhận mã"}
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        resetStep();
                        setCode("");
                        setLocalError(null);
                      }}
                    >
                      Đổi số điện thoại
                    </button>
                  </>
                )}

                {step === "password" && (
                  <>
                    <label>
                      Mật khẩu xác thực hai lớp
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Mật khẩu 2FA của Telegram"
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || !password}
                      onClick={() => void run(() => submitPassword(password))}
                    >
                      {busy ? "Đang đăng nhập…" : "Đăng nhập"}
                    </button>
                  </>
                )}

                {auth.telegram.phase === "waiting_qr" && (
                  <>
                    <p className="form-error">
                      Vui lòng mở Telegram trên điện thoại và quét mã QR.
                    </p>
                  </>
                )}

                {localError && <div className="form-error">{localError}</div>}
              </div>
            )}

          </article>

          <article className="connect-card">
            <header>
              <span className="connect-icon zalo">
                <ZaloIcon size={20} />
              </span>
              <div>
                <strong>Zalo</strong>
                <small>
                  {zalo.connected
                    ? zalo.user ?? "Đã kết nối"
                    : zalo.phase === "waiting_qr" || zalo.phase === "connecting"
                      ? "Đang chờ bạn quét mã QR"
                      : "Đăng nhập bằng mã QR trên ứng dụng Zalo"}
                </small>
              </div>
              {zalo.connected && <span className="connected-pill zalo">Đã kết nối</span>}
            </header>

            {!zalo.connected && (
              <div className="connect-form">
                <button
                  type="button"
                  className="primary-button zalo"
                  disabled={zalo.phase === "waiting_qr" || zalo.phase === "connecting"}
                  onClick={() => {
                    startZalo();
                  }}
                >
                  {zalo.phase === "waiting_qr" || zalo.phase === "connecting"
                    ? "Đang chờ quét mã…"
                    : "Tạo mã QR đăng nhập"}
                </button>
                {zalo.phase === "waiting_qr" && (
                  <button type="button" className="link-button" onClick={showZaloQr}>
                    Hiện mã QR
                  </button>
                )}
                {zalo.error && <div className="form-error">{zalo.error}</div>}
              </div>
            )}
          </article>

          <div className="onboarding-footer">
            <button type="button" className="link-button" onClick={dismiss}>
              Bỏ qua, xem dữ liệu cục bộ
            </button>
            <span>Tello 0.1 · Windows</span>
          </div>
        </section>
      </div>
    </div>
  );
}
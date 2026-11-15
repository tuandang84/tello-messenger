import { useEffect, useState } from "react";
import { useApp } from "../store/useAppStore";
import { formatBytes } from "../lib/format";
import { CloseIcon, CloudIcon, SettingsIcon, TelegramIcon, ZaloIcon } from "./Icons";

export function SettingsModal() {
  const open = useApp((state) => state.settingsOpen);
  const setOpen = useApp((state) => state.setSettingsOpen);
  const auth = useApp((state) => state.auth);
  const vault = useApp((state) => state.vault);
  const info = useApp((state) => state.info);
  const logout = useApp((state) => state.logout);
  const saveConfig = useApp((state) => state.saveConfig);
  const flushVault = useApp((state) => state.flushVault);
  const startZalo = useApp((state) => state.startZalo);
  const showZaloQr = useApp((state) => state.showZaloQr);
  const showOnboarding = useApp((state) => state.showOnboarding);

  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [vaultPeer, setVaultPeer] = useState("me");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !info) return;
    setApiId(String(info.config?.telegramApiId ?? ""));
    setApiHash(info.config?.telegramApiHash ?? "");
    setVaultPeer(info.config?.vaultPeer ?? "me");
  }, [open, info]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    try {
      await saveConfig({
        telegramApiId: Number(apiId) || undefined,
        telegramApiHash: apiHash.trim(),
        vaultPeer: vaultPeer.trim() || "me",
      });
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false);
    }
  }

  const zaloWaiting = auth.zalo.phase === "waiting_qr" || auth.zalo.phase === "connecting";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt Tello"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="settings-modal">
        <header className="settings-head">
          <div>
            <span className="eyebrow">
              <SettingsIcon size={15} /> Cài đặt
            </span>
            <h2>Tello &amp; kết nối</h2>
          </div>
          <button type="button" className="modal-close inline" onClick={() => setOpen(false)} aria-label="Đóng">
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Tài khoản</h3>
            <div className="account-row">
              <span className="connect-icon telegram">
                <TelegramIcon size={19} />
              </span>
              <div className="account-main">
                <strong>Telegram</strong>
                <span>
                  {auth.telegram.connected
                    ? auth.telegram.user ?? "Đã kết nối"
                    : auth.telegram.error ?? "Chưa kết nối"}
                </span>
              </div>
              {auth.telegram.connected ? (
                <button type="button" className="ghost-button danger" onClick={() => void logout("telegram")}>
                  Ngắt kết nối
                </button>
              ) : (
                <button type="button" className="ghost-button" onClick={showOnboarding}>
                  Kết nối
                </button>
              )}
            </div>

            <div className="account-row">
              <span className="connect-icon zalo">
                <ZaloIcon size={19} />
              </span>
              <div className="account-main">
                <strong>Zalo</strong>
                <span>{auth.zalo.connected ? auth.zalo.user ?? "Đã kết nối" : auth.zalo.error ?? "Chưa kết nối"}</span>
              </div>
              {auth.zalo.connected ? (
                <button type="button" className="ghost-button danger" onClick={() => void logout("zalo")}>
                  Ngắt kết nối
                </button>
              ) : zaloWaiting ? (
                <button type="button" className="ghost-button" onClick={showZaloQr}>
                  Hiện mã QR
                </button>
              ) : (
                <button type="button" className="ghost-button" onClick={() => startZalo()}>
                  Kết nối
                </button>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h3>
              <CloudIcon size={16} /> Kho Telegram
            </h3>
            <div className="vault-stats">
              <div>
                <b>{vault.uploaded}</b>
                <span>đã lưu</span>
              </div>
              <div>
                <b>{vault.pending}</b>
                <span>đang chờ</span>
              </div>
              <div>
                <b className={vault.failed ? "danger-text" : ""}>{vault.failed}</b>
                <span>lỗi</span>
              </div>
            </div>
            <label className="field">
              Peer nhận tệp
              <input
                value={vaultPeer}
                onChange={(event) => setVaultPeer(event.target.value)}
                placeholder="me hoặc -1001234567890"
                spellCheck={false}
              />
              <small>
                Mặc định <code>me</code> (Saved Messages). Có thể dùng ID một supergroup riêng để dễ
                tra cứu trên điện thoại.
              </small>
            </label>
            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={() => void flushVault()}>
                Đẩy lại hàng đợi
              </button>
              <span className="muted">Tệp tạm chỉ bị xoá sau khi Telegram xác nhận đã lưu.</span>
            </div>
          </section>

          <section className="settings-section">
            <h3>Thông tin kỹ thuật Telegram</h3>
            <p className="muted">
              Tello dùng bộ api_id mặc định của Telegram Desktop để chạy ngay. Bạn nên thay bằng cặp
              api_id / api_hash riêng lấy từ my.telegram.org.
            </p>
            <div className="field-grid">
              <label className="field">
                api_id
                <input value={apiId} onChange={(event) => setApiId(event.target.value)} inputMode="numeric" />
              </label>
              <label className="field">
                api_hash
                <input
                  value={apiHash}
                  onChange={(event) => setApiHash(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
            <small className="muted">Thay đổi có hiệu lực ở lần đăng nhập Telegram kế tiếp.</small>
          </section>

          <section className="settings-section">
            <h3>Dữ liệu trên máy</h3>
            <div className="data-grid">
              <div>
                <span>Thư mục dữ liệu</span>
                <code>{info?.dataDir ?? "—"}</code>
              </div>
              <div>
                <span>Cơ sở dữ liệu</span>
                <code>
                  {info ? `${info.stats.chats} hội thoại · ${info.stats.messages} tin nhắn · ${formatBytes(info.stats.sizeBytes)}` : "—"}
                </code>
              </div>
              <div>
                <span>Phiên bản</span>
                <code>{info ? `${info.version} · ${info.runtime}` : "—"}</code>
              </div>
            </div>
          </section>
        </div>

        <footer className="settings-foot">
          <span className="muted">
            Thay đổi cấu hình được lưu ngay trên máy này.
          </span>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
              Đóng
            </button>
            <button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu cấu hình"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

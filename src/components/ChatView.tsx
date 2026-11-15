import { useApp } from "../store/useAppStore";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageList, ThreadHeader } from "./MessageList";
import { CloudIcon, SettingsIcon, ShieldIcon, TelegramIcon, ZaloIcon } from "./Icons";

export function ChatView() {
  const activeChatId = useApp((state) => state.activeChat);
  const chats = useApp((state) => state.chats);
  const messages = useApp((state) => state.messages);
  const auth = useApp((state) => state.auth);
  const vault = useApp((state) => state.vault);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const refresh = useApp((state) => state.refresh);

  const chat = chats.find((item) => item.id === activeChatId) ?? null;

  if (!chat) {
    return (
      <main className="chat-pane empty">
        <div className="welcome">
          <div className="welcome-logo">
            <img src="/logo.png" alt="Tello" />
          </div>
          <h1>Hộp thư hợp nhất của bạn</h1>
          <p>
            Telegram và Zalo trong cùng một cửa sổ. Tệp Zalo được đẩy lên kho Telegram để giải phóng ổ
            cứng, còn lịch sử tra cứu vẫn nằm ngay trên máy.
          </p>

          <div className="welcome-grid">
            <div className="welcome-card">
              <TelegramIcon size={20} />
              <div>
                <strong>Telegram</strong>
                <span>{auth.telegram.connected ? auth.telegram.user ?? "Đã kết nối" : "Chưa kết nối"}</span>
              </div>
            </div>
            <div className="welcome-card">
              <ZaloIcon size={20} />
              <div>
                <strong>Zalo</strong>
                <span>{auth.zalo.connected ? auth.zalo.user ?? "Đã kết nối" : "Chưa kết nối"}</span>
              </div>
            </div>
            <div className="welcome-card">
              <CloudIcon size={20} />
              <div>
                <strong>Kho Telegram</strong>
                <span>{vault.uploaded} tệp đã lưu · {vault.pending} đang chờ</span>
              </div>
            </div>
            <div className="welcome-card">
              <ShieldIcon size={20} />
              <div>
                <strong>Cục bộ & bảo mật</strong>
                <span>Phiên đăng nhập được mã hoá trên máy</span>
              </div>
            </div>
          </div>

          <div className="welcome-actions">
            <button type="button" className="primary-button" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={18} />
              Mở cài đặt kết nối
            </button>
            <button type="button" className="ghost-button" onClick={() => void refresh()}>
              Đồng bộ hội thoại
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-pane">
      <ThreadHeader chat={chat} onOpenSettings={() => setSettingsOpen(true)} onRefresh={() => void refresh()} />
      <div className="thread-body">
        <div className="thread-banner">
          <Avatar id={chat.id} title={chat.title} network={chat.network} size={34} />
          <span>
            {chat.network === "telegram" ? "Telegram" : "Zalo"}
            {chat.isGroup ? " · Nhóm" : ""} · tin nhắn được lưu cục bộ
          </span>
        </div>
        <MessageList chat={chat} messages={messages[chat.id] ?? []} />
      </div>
      <Composer chat={chat} />
    </main>
  );
}

import { useMemo } from "react";
import { useApp } from "../store/useAppStore";
import { formatRelative, classNames, networkLabel } from "../lib/format";
import type { ChatSummary } from "../lib/types";
import { Avatar } from "./Avatar";
import { CloudIcon, RefreshIcon, SearchIcon, SettingsIcon, TelegramIcon, ZaloIcon } from "./Icons";

const FOLDERS = [
  { id: "all", label: "Tất cả" },
  { id: "telegram", label: "Telegram" },
  { id: "zalo", label: "Zalo" },
  { id: "unread", label: "Chưa đọc" },
] as const;

export function Sidebar() {
  const chats = useApp((state) => state.chats);
  const folder = useApp((state) => state.folder);
  const search = useApp((state) => state.search);
  const activeChat = useApp((state) => state.activeChat);
  const auth = useApp((state) => state.auth);
  const vault = useApp((state) => state.vault);
  const setFolder = useApp((state) => state.setFolder);
  const setSearch = useApp((state) => state.setSearch);
  const openChat = useApp((state) => state.openChat);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const refresh = useApp((state) => state.refresh);

  const counts = useMemo(
    () => ({
      all: chats.length,
      telegram: chats.filter((chat) => chat.network === "telegram").length,
      zalo: chats.filter((chat) => chat.network === "zalo").length,
      unread: chats.reduce((total, chat) => total + (chat.unread > 0 ? 1 : 0), 0),
    }),
    [chats],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (folder === "telegram" && chat.network !== "telegram") return false;
        if (folder === "zalo" && chat.network !== "zalo") return false;
        if (folder === "unread" && chat.unread === 0) return false;
        if (!needle) return true;
        return (
          chat.title.toLowerCase().includes(needle) ||
          chat.lastText.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [chats, folder, search]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div className="brand-text">
            <strong>Tello</strong>
            <span>Telegram + Zalo</span>
          </div>
        </div>
        <div className="connection-dots">
          <button
            type="button"
            className={classNames("status-dot", auth.telegram.connected && "online")}
            title={
              auth.telegram.connected
                ? `Telegram: ${auth.telegram.user ?? "đã kết nối"}`
                : "Telegram: chưa kết nối"
            }
            onClick={() => setSettingsOpen(true)}
            aria-label="Trạng thái Telegram"
          >
            <TelegramIcon size={14} />
          </button>
          <button
            type="button"
            className={classNames("status-dot", auth.zalo.connected && "online")}
            title={auth.zalo.connected ? `Zalo: ${auth.zalo.user ?? "đã kết nối"}` : "Zalo: chưa kết nối"}
            onClick={() => setSettingsOpen(true)}
            aria-label="Trạng thái Zalo"
          >
            <ZaloIcon size={14} />
          </button>
          <button
            type="button"
            className={classNames("icon-button small", auth.telegram.phase === "error" && "attention")}
            onClick={() => void refresh()}
            title="Đồng bộ hội thoại"
            aria-label="Đồng bộ hội thoại"
          >
            <RefreshIcon size={16} />
          </button>
        </div>
      </div>

      <label className="search-box">
        <SearchIcon size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm hội thoại, tin nhắn…"
          spellCheck={false}
        />
      </label>

      <div className="folders" role="tablist" aria-label="Bộ lọc hội thoại">
        {FOLDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={folder === item.id}
            className={classNames("folder", folder === item.id && "active")}
            onClick={() => setFolder(item.id)}
          >
            {item.label}
            <span>{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <div className="chat-list">
        {filtered.map((chat) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            active={chat.id === activeChat}
            onClick={() => void openChat(chat.id)}
          />
        ))}
        {!filtered.length && (
          <div className="empty-list">
            {chats.length === 0 ? (
              <>
                <p>Chưa có hội thoại nào</p>
                <span>Kết nối Telegram hoặc Zalo để bắt đầu nhắn tin.</span>
              </>
            ) : (
              <>
                <p>Không có hội thoại phù hợp</p>
                <span>Thử đổi bộ lọc hoặc từ khoá tìm kiếm.</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="vault-pill" onClick={() => setSettingsOpen(true)}>
          <CloudIcon size={17} />
          <span>Kho Telegram</span>
          <b>{vault.uploaded}</b>
          {vault.pending > 0 && <i className="pending-dot" title={`${vault.pending} tệp đang chờ`} />}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSettingsOpen(true)}
          title="Cài đặt"
          aria-label="Cài đặt"
        >
          <SettingsIcon size={19} />
        </button>
      </div>
    </aside>
  );
}

function ChatRow({
  chat,
  active,
  onClick,
}: {
  chat: ChatSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={classNames("chat-row", active && "active")} onClick={onClick}>
      <Avatar id={chat.id} title={chat.title} network={chat.network} />
      <div className="chat-main">
        <div className="chat-top">
          <span className="chat-title">{chat.title}</span>
          <span className="platform-badge">
            {chat.network === "telegram" ? <TelegramIcon size={12} /> : <ZaloIcon size={12} />}
            {networkLabel(chat.network)}
          </span>
          <span className="chat-time">{formatRelative(chat.lastAt)}</span>
        </div>
        <div className="chat-bottom">
          <span className="chat-preview">{chat.lastText || "Bắt đầu trò chuyện"}</span>
          {chat.unread > 0 && <span className="unread-badge">{chat.unread > 99 ? "99+" : chat.unread}</span>}
        </div>
      </div>
    </button>
  );
}

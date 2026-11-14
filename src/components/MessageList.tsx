import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/bridge";
import { classNames, formatBytes, formatDay, formatTime, initials, networkLabel } from "../lib/format";
import type { ChatMessage, ChatSummary } from "../lib/types";
import { useApp } from "../store/useAppStore";
import { CloseIcon, CloudIcon, DownloadIcon, UsersIcon } from "./Icons";

export function MessageList({ chat, messages }: { chat: ChatSummary; messages: ChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const fetchMedia = useApp((state) => state.fetchMedia);

  // Keep the view pinned to the newest message unless the user scrolled up.
  // Images grow after they decode, so a ResizeObserver follows layout changes.
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    pinned.current = true;

    const stick = () => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    };
    stick();
    requestAnimationFrame(stick);

    const observer = new ResizeObserver(stick);
    const inner = element.querySelector(".message-list-inner");
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [chat.id, hasMessages]);

  useEffect(() => {
    if (!pinned.current) return;
    const element = scrollRef.current;
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, messages[messages.length - 1]?.id]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  if (!messages.length) {
    return (
      <div className="message-scroll empty-thread">
        <div className="empty-thread-card">
          <CloudIcon size={28} />
          <h3>Chưa có tin nhắn trong bộ nhớ</h3>
          <p>
            Tello lưu lịch sử cục bộ để mở tức thì. Zalo chỉ cung cấp lịch sử nhóm, còn tin nhắn
            riêng sẽ được ghi lại từ khi bạn kết nối.
          </p>
        </div>
      </div>
    );
  }

  const rows: Array<
    | { kind: "day"; key: string; label: string }
    | { kind: "message"; key: string; message: ChatMessage; showSender: boolean }
  > = [];
  let currentDay = "";

  messages.forEach((message, index) => {
    const dayKey = new Date(message.at).toDateString();
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      rows.push({ kind: "day", key: `day-${dayKey}`, label: formatDay(message.at) });
    }
    const previous = messages[index - 1];
    const showSender =
      chat.isGroup &&
      !message.outgoing &&
      (!previous || previous.senderName !== message.senderName || previous.at < message.at - 10 * 60_000);
    rows.push({ kind: "message", key: message.id, message, showSender });
  });

  const isBroken = (message: ChatMessage) => broken.has(message.id);

  return (
    <div className="message-scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="message-list-inner">
        {rows.map((row) =>
          row.kind === "day" ? (
            <div className="day-divider" key={row.key}>
              <span>{row.label}</span>
            </div>
          ) : (
            <MessageBubble
              key={row.key}
              message={row.message}
              showSender={row.showSender}
              broken={isBroken(row.message)}
              onBroken={() =>
                setBroken((current) => {
                  const next = new Set(current);
                  next.add(row.message.id);
                  return next;
                })
              }
              onPreview={setPreview}
              onFetch={() => void fetchMedia(row.message)}
            />
          ),
        )}
      </div>

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-label="Xem ảnh">
          <button type="button" className="lightbox-close" aria-label="Đóng">
            <CloseIcon size={22} />
          </button>
          <img src={preview} alt="" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  showSender,
  broken,
  onBroken,
  onPreview,
  onFetch,
}: {
  message: ChatMessage;
  showSender: boolean;
  broken: boolean;
  onBroken: () => void;
  onPreview: (url: string) => void;
  onFetch: () => void;
}) {
  const media = message.media;
  const localUrl = media?.localPath && !broken ? mediaUrl(media.localPath) : "";
  const canPreviewImage = media?.kind === "image" && localUrl;

  return (
    <div className={classNames("message-row", message.outgoing && "outgoing")}>
      <div className={classNames("bubble", media && "with-media")}>
        {showSender && <div className="sender-name">{message.senderName || "Thành viên"}</div>}

        {canPreviewImage && (
          <button type="button" className="media-image" onClick={() => onPreview(localUrl)}>
            <img src={localUrl} alt={media.name} loading="lazy" onError={onBroken} />
          </button>
        )}

        {media && !canPreviewImage && (
          <div className="media-file">
            <div className="media-icon">
              {media.kind === "image" || media.kind === "sticker" ? "🖼️" : media.kind === "video" ? "🎬" : media.kind === "audio" ? "🎧" : "📎"}
            </div>
            <div className="media-meta">
              <span className="media-name" title={media.name}>
                {media.name}
              </span>
              <span className="media-sub">
                {[media.kind, formatBytes(media.size)].filter(Boolean).join(" · ")}
                {media.vaulted && !media.localPath ? " · trong kho Telegram" : ""}
              </span>
            </div>
            {localUrl ? (
              <a className="media-action" href={localUrl} download={media.name} title="Tải về">
                <DownloadIcon size={17} />
              </a>
            ) : (
              <button type="button" className="media-action" onClick={onFetch} title="Tải từ Telegram">
                <DownloadIcon size={17} />
              </button>
            )}
          </div>
        )}

        {message.text && <p className="bubble-text">{message.text}</p>}

        <div className="bubble-meta">
          {media?.vaulted && (
            <span className="vault-tag" title="Đã lưu trong kho Telegram">
              <CloudIcon size={13} />
            </span>
          )}
          <span className="platform-label">
            {networkLabel(message.network)}
          </span>
          <span>{formatTime(message.at)}</span>
        </div>
      </div>
    </div>
  );
}

export function ThreadHeader({
  chat,
  onOpenSettings,
  onRefresh,
}: {
  chat: ChatSummary;
  onOpenSettings: () => void;
  onRefresh: () => void;
}) {
  const auth = useApp((state) => state.auth);
  const online = auth[chat.network].connected;

  return (
    <header className="thread-head">
      <div className="thread-identity">
        <div className="thread-avatar">
          <div className={classNames("presence", online && "online")} />
          <span className="thread-avatar-initials">{initials(chat.title)}</span>
        </div>
        <div>
          <h2>{chat.title}</h2>
          <span className="thread-sub">
            {chat.network === "telegram" ? "Telegram" : "Zalo"}
            {chat.isGroup ? " · Nhóm" : " · Cá nhân"}
            {!online && " · đang ngoại tuyến"}
            {chat.isGroup && <UsersIcon size={13} />}
          </span>
        </div>
      </div>
      <div className="thread-actions">
        <button type="button" className="ghost-button" onClick={onRefresh} title="Đồng bộ">
          Đồng bộ
        </button>
        <button type="button" className="ghost-button" onClick={onOpenSettings} title="Cài đặt">
          Cài đặt
        </button>
      </div>
    </header>
  );
}

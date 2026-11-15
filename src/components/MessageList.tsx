import React, { useEffect, useMemo, useRef } from "react";
import { formatDay, formatTime, initials } from "../lib/format";
import type { ChatMessage, ChatSummary } from "../lib/types";
import { useApp } from "../store/useAppStore";
import { CloudIcon, RefreshIcon, SettingsIcon, TelegramIcon, ZaloIcon } from "./Icons";

// A busy chat can hold tens of thousands of rows. Rendering all of them stalls
// the WebView, so keep a window of the newest messages while the store still
// keeps the full history.
const MESSAGE_WINDOW = 120;

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
  const online = Boolean(auth[chat.network]?.connected);
  const PlatformIcon = chat.network === "telegram" ? TelegramIcon : ZaloIcon;

  return (
    <header className="thread-head">
      <div className="thread-identity">
        <div className="thread-avatar" aria-hidden="true">
          <span className="thread-avatar-initials">{initials(chat.title)}</span>
          <span className={online ? "presence online" : "presence"} />
        </div>
        <div>
          <h2>{chat.title}</h2>
          <span className="thread-sub">
            <PlatformIcon size={12} />
            {chat.network === "telegram" ? "Telegram" : "Zalo"}
            {chat.isGroup ? " · Nhóm" : " · Cá nhân"}
            {online ? " · trực tuyến" : " · đang ngoại tuyến"}
          </span>
        </div>
      </div>

      <div className="thread-actions">
        <button
          type="button"
          className="icon-button small"
          onClick={onRefresh}
          title="Đồng bộ hội thoại"
          aria-label="Đồng bộ hội thoại"
        >
          <RefreshIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={onOpenSettings}
          title="Cài đặt"
          aria-label="Cài đặt"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  );
}

export function MessageList({ chat, messages }: { chat: ChatSummary; messages: ChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Every hook has to run before the empty state returns below. React counts
  // hooks per render, so a hook after an early return throws "Rendered more
  // hooks than during the previous render" as soon as the first message
  // arrives - which unmounts the tree and leaves an empty dark window.
  const displayed = useMemo(
    () =>
      messages.length > MESSAGE_WINDOW ? messages.slice(messages.length - MESSAGE_WINDOW) : messages,
    [messages],
  );

  const hiddenCount = messages.length - displayed.length;
  const lastId = displayed.length ? displayed[displayed.length - 1]?.id : undefined;

  // Keep the view pinned to the newest message unless the user scrolled up.
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
  }, [chat.id, displayed.length > 0]);

  useEffect(() => {
    if (!pinned.current) return;
    const element = scrollRef.current;
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [lastId, displayed.length]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  if (!displayed.length) {
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

  return (
    <div className="message-scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="message-list-inner">
        {hiddenCount > 0 && (
          <div className="message-window-note">
            Đang hiển thị {MESSAGE_WINDOW} tin nhắn gần nhất trong {messages.length} tin nhắn đã lưu
          </div>
        )}

        {displayed.map((message, index) => {
          const dayKey = new Date(message.at).toDateString();
          const previousDay =
            index === 0 ? null : new Date(displayed[index - 1]?.at ?? 0).toDateString();
          const isFirstOfDay = previousDay !== dayKey;

          const previous = displayed[index - 1];
          const showSender =
            chat.isGroup &&
            !message.outgoing &&
            (!previous ||
              previous.senderName !== message.senderName ||
              previous.at < message.at - 10 * 60_000);

          const edited = Boolean(message.edit);
          const reactions = message.reactions ?? [];

          return (
            <React.Fragment key={message.id}>
              {isFirstOfDay && (
                <div className="day-divider">
                  <span>{formatDay(message.at)}</span>
                </div>
              )}
              <div
                className={[
                  "message-row",
                  message.outgoing ? "outgoing" : "",
                  message.pending ? "pending" : "",
                  message.failed ? "failed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="bubble">
                  {showSender && <div className="sender-name">{message.senderName || "Thành viên"}</div>}
                  {message.media && (
                    <div className="bubble-media">
                      {message.media.kind === "sticker"
                        ? "Sticker"
                        : message.media.kind === "image"
                          ? "Ảnh"
                          : message.media.kind === "video"
                            ? "Video"
                            : message.media.kind === "audio"
                              ? "Âm thanh"
                              : "Tệp"}
                      {message.media.name ? ` · ${message.media.name}` : ""}
                    </div>
                  )}
                  {message.text && <p className="bubble-text">{message.text}</p>}
                  {reactions.length > 0 && (
                    <div className="bubble-reactions">
                      {reactions.map((reaction) => (
                        <span key={`${reaction.emoji}-${reaction.userId}`} className="reaction">
                          {reaction.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="bubble-meta">
                    {edited && <span className="bubble-edited">đã sửa</span>}
                    <span>{formatTime(message.at) || formatDay(message.at)}</span>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

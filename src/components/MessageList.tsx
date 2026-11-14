// @ts-nocheck
import React, { useEffect, useRef, useMemo } from "react";
import { formatDay, initials } from "../lib/format";
import { CloudIcon, CloseIcon } from "./Icons";
import type { ChatMessage, ChatSummary } from "../lib/types";
import { useApp } from "../store/useAppStore";

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
        <div className="presence">{online ? "online" : ""}</div>
        <span className="thread-avatar-initials">{initials(chat.title)}</span>
      </div>
      <div>
        <h2>{chat.title}</h2>
        <span className="thread-sub">
          {chat.network === "telegram" ? "Telegram" : "Zalo"}
          {chat.isGroup ? " · Nhóm" : " · Cá nhân"}
          {!online && " · đang ngoại tuyến"}
          {chat.isGroup && <CloseIcon size={13} />}
        </span>
      </div>
    </header>
  );
}

export function MessageList({ chat, messages }: { chat: ChatSummary; messages: ChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Keep the view pinned to the newest message unless the user scrolled up.
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

  // Virtualized: show latest messages + oldest messages for quick access
  const displayedMessages = useMemo(() => {
    if (messages.length <= 50) return messages;
    // Show last 30 + first 20 (oldest) for virtualized view
    const latest = messages.slice(0, 30);
    const oldest = messages.slice(-20);
    return [...latest, ...oldest];
  }, [messages]);

  return (
    <div className="message-scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="message-list-inner">
        {displayedMessages.map((message, index) => {
          // Calculate day key
          const dayKey = new Date(message.at).toDateString();
          const isFirstOfDay = index === 0 ||
            new Date(displayedMessages[index - 1]?.at || 0).toDateString() !== dayKey;

          const previous = displayedMessages[index - 1];
          const showSender =
            chat.isGroup &&
            !message.outgoing &&
            (!previous || previous.senderName !== message.senderName || previous.at < message.at - 10 * 60_000);

          return (
            <React.Fragment key={message.id}>
              {isFirstOfDay && <div className="day-divider">{formatDay(message.at)}</div>}
              <div className="message-row">
                <div className="bubble">
                  {showSender && <div className="sender-name">{message.senderName || "Thành viên"}</div>}
                  <p className="bubble-text">{message.text}</p>
                  <div className="bubble-meta">
                    <span className="platform-label">
                      {chat.network === "telegram" ? "Telegram" : "Zalo"}
                    </span>
                    <span>{formatDay(message.at)}</span>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* {canLoadOlder && !loadingOlder && (
          <div className="load-older-bar" onClick={loadOlderMessages} role="button" aria-label="Tải tin nhắn cũ hơn">
            <span>📜</span> Tải tin nhắn cũ hơn
          </div>
        )} */}
      </div>

      {/* {preview && (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-label="Xem ảnh">
          <button type="button" className="lightbox-close" aria-label="Đóng">
            <CloseIcon size={22} />
          </button>
          <img src={preview} alt="" onClick={(event) => event.stopPropagation()} />
        </div>
      )} */}
    </div>
  );
}
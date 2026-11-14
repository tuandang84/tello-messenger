import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useApp } from "../store/useAppStore";
import type { ChatSummary } from "../lib/types";
import { PaperclipIcon, SendIcon } from "./Icons";

export function Composer({ chat }: { chat: ChatSummary }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const online = useApp((state) => state.auth[chat.network].connected);
  const sending = useApp((state) => state.sending);
  const send = useApp((state) => state.send);
  const sendFile = useApp((state) => state.sendFile);

  useEffect(() => {
    setText("");
  }, [chat.id]);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || busy || sending || !online) return;
    setBusy(true);
    try {
      await send(value);
      setText("");
    } catch {
      /* the store already surfaced the error */
    } finally {
      setBusy(false);
      textarea.current?.focus();
    }
  }

  async function attach() {
    if (busy || sending || !online) return;
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: "Chọn tệp để gửi",
      });
      if (typeof picked !== "string") return;
      setBusy(true);
      await sendFile(picked, text.trim());
      setText("");
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer-wrap">
      {!online && (
        <div className="offline-note">
          {chat.network === "telegram" ? "Telegram" : "Zalo"} đang ngoại tuyến — bạn vẫn xem được lịch sử
          cục bộ.
        </div>
      )}
      <div className="composer">
        <button
          type="button"
          className="composer-icon"
          onClick={() => void attach()}
          disabled={!online || busy || sending}
          title="Gửi tệp"
          aria-label="Gửi tệp"
        >
          <PaperclipIcon size={20} />
        </button>
        <textarea
          ref={textarea}
          value={text}
          rows={1}
          placeholder={online ? `Nhắn tin tới ${chat.title}…` : "Đang ngoại tuyến…"}
          disabled={!online}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          className="send-button"
          onClick={() => void submit()}
          disabled={!online || !text.trim() || busy || sending}
          title="Gửi (Enter)"
          aria-label="Gửi"
        >
          <SendIcon size={19} />
        </button>
      </div>
      <div className="composer-hint">
        <span>Enter để gửi · Shift + Enter để xuống dòng</span>
        <span>{text.length > 0 ? `${text.length} ký tự` : ""}</span>
      </div>
    </div>
  );
}

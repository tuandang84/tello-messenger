import { useEffect, useRef, useState } from "react";
import { ChatView } from "./components/ChatView";
import { Onboarding } from "./components/Onboarding";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { ZaloQrModal } from "./components/ZaloQrModal";
import { isTauri, startBridge } from "./lib/bridge";
import { useApp } from "./store/useAppStore";

export default function App() {
  const booted = useApp((state) => state.booted);
  const coreError = useApp((state) => state.coreError);
  const auth = useApp((state) => state.auth);
  const chats = useApp((state) => state.chats);
  const activeChat = useApp((state) => state.activeChat);
  const onboardingDismissed = useApp((state) => state.onboardingDismissed);
  const hydrate = useApp((state) => state.hydrate);
  const handleEvent = useApp((state) => state.handleEvent);
  const setCoreError = useApp((state) => state.setCoreError);
  const openChat = useApp((state) => state.openChat);
  const [bridgeReady, setBridgeReady] = useState(false);
  const startedRef = useRef(false);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!isTauri()) {
      setCoreError(
        "Tello cần chạy trong ứng dụng desktop. Hãy dùng `npm run tauri dev` thay vì mở trang web.",
      );
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void startBridge(
      (event, data) => {
        if (disposed) return;
        handleEvent(event, data);
      },
      {
        onExit: (code) => {
          if (disposed) return;
          setCoreError(
            `Lõi kết nối đã dừng (mã ${code ?? "không rõ"}). Hãy khởi động lại Tello.`,
          );
        },
        onError: (message) => {
          if (disposed) return;
          setCoreError(message);
        },
      },
    )
      .then(async (unlisteners) => {
        if (disposed) {
          unlisteners.forEach((unlisten) => unlisten());
          return;
        }
        cleanup = () => unlisteners.forEach((unlisten) => unlisten());
        setBridgeReady(true);
        await hydrate();
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setCoreError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [handleEvent, hydrate, setCoreError]);

  useEffect(() => {
    if (autoOpened.current) return;
    if (!chats.length) return;
    if (activeChat) {
      autoOpened.current = true;
      return;
    }
    autoOpened.current = true;
    void openChat(chats[0].id);
  }, [activeChat, chats, openChat]);

  const showOnboarding =
    booted &&
    !coreError &&
    !onboardingDismissed &&
    !auth.telegram.connected &&
    !auth.zalo.connected;

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Sidebar />
        <ChatView />
      </div>

      {!bridgeReady && !coreError && <Splash label="Đang khởi động lõi kết nối…" />}
      {bridgeReady && !booted && !coreError && <Splash label="Đang nạp dữ liệu cục bộ…" />}

      {coreError && <StartupError message={coreError} />}

      <SettingsModal />
      <ZaloQrModal />
      <Toasts />

      {showOnboarding && (
        <div className="modal-backdrop onboarding-backdrop">
          <Onboarding />
        </div>
      )}
    </div>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-card">
        <div className="splash-mark">T</div>
        <strong>Tello</strong>
        <span className="splash-line">
          <span className="spinner small" /> {label}
        </span>
      </div>
    </div>
  );
}

function StartupError({ message }: { message: string }) {
  const hydrate = useApp((state) => state.hydrate);

  return (
    <div className="splash" role="alert">
      <div className="splash-card error">
        <div className="splash-mark error">!</div>
        <strong>Không kết nối được lõi Tello</strong>
        <p>{message}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void hydrate();
          }}
        >
          Thử lại
        </button>
        <small>
          Nếu lỗi vẫn tiếp diễn, hãy đóng hẳn Tello từ khay hệ thống rồi mở lại.
        </small>
      </div>
    </div>
  );
}

import { useApp } from "../store/useAppStore";
import { CloseIcon } from "./Icons";

export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span>{toast.text}</span>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="Đóng thông báo">
            <CloseIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

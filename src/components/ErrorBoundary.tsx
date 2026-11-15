import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Last line of defence. Without a boundary a single render error makes React
 * unmount the whole tree, which on a dark window looks exactly like a frozen
 * black screen with no clue for the user. The boundary keeps the failure
 * readable and offers a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[tello] giao dien gap loi", error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reload = () => {
    window.location.reload();
  };

  private reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <div className="splash-mark error">!</div>
          <strong>Giao diện Tello gặp lỗi</strong>
          <p>
            Ứng dụng vẫn chạy, nhưng màn hình này đã dừng hiển thị. Bấm “Tải lại” để khởi động lại
            giao diện; lịch sử tin nhắn trên máy không bị ảnh hưởng.
          </p>
          <code className="crash-message">{error.message || String(error)}</code>

          {info && (
            <details className="crash-details">
              <summary>Chi tiết kỹ thuật</summary>
              <pre>{info}</pre>
            </details>
          )}

          <div className="crash-actions">
            <button type="button" className="primary-button" onClick={this.reload}>
              Tải lại
            </button>
            <button type="button" className="ghost-button" onClick={this.reset}>
              Thử lại không tải lại
            </button>
          </div>
        </div>
      </div>
    );
  }
}

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type EventHandler = (event: string, data: any) => void;

const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let sequence = 0;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startBridge(
  onEvent: EventHandler,
  handlers: { onExit?: (code: number | null) => void; onError?: (message: string) => void } = {},
): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen<string>("core:event", (event) => {
      let message: any;
      try {
        message = JSON.parse(event.payload);
      } catch {
        return;
      }

      if (message?.type === "res") {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.ok) request.resolve(message.data);
        else request.reject(new Error(message.error || "Lõi xử lý không rõ"));
        return;
      }

      if (message?.type === "event" && typeof message.event === "string") {
        onEvent(message.event, message.data);
      }
    }),
  );

  unlisteners.push(
    await listen<number | null>("core:exit", (event) => {
      handlers.onExit?.(event.payload);
    }),
  );

  unlisteners.push(
    await listen<string>("core:error", (event) => {
      handlers.onError?.(event.payload);
    }),
  );

  return unlisteners;
}

export async function call<T = unknown>(
  cmd: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 120_000,
): Promise<T> {
  if (!isTauri()) {
    throw new Error("Tello cần chạy trong ứng dụng desktop. Hãy dùng `npm run tauri dev`.");
  }

  const id = `req_${Date.now()}_${++sequence}`;
  const promise = new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("Lõi kết nối không phản hồi. Hãy thử khởi động lại Tello."));
    }, timeoutMs);

    pending.set(id, {
      resolve: (value) => {
        window.clearTimeout(timer);
        resolve(value as T);
      },
      reject: (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    });
  });

  try {
    await invoke("core_send", { payload: JSON.stringify({ id, cmd, ...payload }) });
  } catch (error) {
    pending.delete(id);
    throw error instanceof Error ? error : new Error(String(error));
  }

  return promise;
}

export function mediaUrl(localPath: string): string {
  if (!isTauri()) return "";
  return convertFileSrc(localPath);
}

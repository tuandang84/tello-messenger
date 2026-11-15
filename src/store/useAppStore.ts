import { create } from "zustand";
import { call } from "../lib/bridge";
import type {
  AppConfig,
  AppInfo,
  AuthStatus,
  ChatMessage,
  ChatSummary,
  Folder,
  Network,
  TelegramStep,
  VaultStatus,
} from "../lib/types";

interface Toast {
  id: number;
  kind: "info" | "error";
  text: string;
}

interface Reaction {
  emoji: string;
  userId: string;
  username?: string;
  at: number;
}

// Onboarding is a first-run hint, so remember the dismissal per profile
// instead of showing it again after every restart.
const ONBOARDING_KEY = "tello.onboardingDismissed";

function readOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOnboardingDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(ONBOARDING_KEY, "1");
    else localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // Local storage can be unavailable in hardened WebView setups.
  }
}

interface AppState {
  booted: boolean;
  coreError: string | null;
  auth: AuthStatus;
  chats: ChatSummary[];
  messages: Record<string, ChatMessage[]>;
  reactions: Record<string, Reaction[]>; // chatId -> reactions
  activeChat: string | null;
  folder: Folder;
  search: string;
  settingsOpen: boolean;
  onboardingDismissed: boolean;
  telegramStep: TelegramStep;
  zaloQr: string | null;
  zaloScanned: string | null;
  zaloQrHidden: boolean;
  vault: VaultStatus;
  sending: boolean;
  info: AppInfo | null;
  toasts: Toast[];
  telegramQr: string | null;
  telegramScanned: string | null;
  telegramQrHidden: boolean;
  hideTelegramQr: () => void;

  hydrate: () => Promise<void>;
  handleEvent: (event: string, data: any) => void;
  setFolder: (folder: Folder) => void;
  setSearch: (search: string) => void;
  setSettingsOpen: (open: boolean) => void;
  dismissOnboarding: () => void;
  showOnboarding: () => void;
  setCoreError: (message: string | null) => void;
  showZaloQr: () => void;
  hideZaloQr: () => void;
  openChat: (chatId: string | null) => Promise<void>;
  send: (text: string) => Promise<void>;
  sendFile: (path: string, caption: string) => Promise<void>;
  refresh: () => Promise<void>;
  fetchMedia: (message: ChatMessage) => Promise<void>;
  startTelegram: (phone: string) => Promise<void>;
  submitTelegramCode: (code: string) => Promise<void>;
  submitTelegramPassword: (password: string) => Promise<void>;
  resetTelegramStep: () => void;
  startZalo: () => Promise<void>;
  logout: (network: Network) => Promise<void>;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;
  flushVault: () => Promise<void>;
  toast: (kind: "info" | "error", text: string) => void;
  dismissToast: (id: number) => void;
}

const EMPTY_AUTH: AuthStatus = {
  telegram: { connected: false, phase: "idle" },
  zalo: { connected: false, phase: "idle" },
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeMessages(existing: ChatMessage[] = [], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  const add = (message: ChatMessage | undefined | null) => {
    if (!message || !message.id) return;
    const current = map.get(message.id);
    map.set(message.id, current ? { ...current, ...message } : message);
  };
  for (const message of existing) add(message);
  for (const message of Array.isArray(incoming) ? incoming : []) add(message);
  return [...map.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
}

function normalizeQr(image: string): string {
  if (!image) return "";
  if (image.startsWith("data:") || image.startsWith("http")) return image;
  return `data:image/png;base64,${image}`;
}

// The sidecar can hand back partially filled rows (a dialog without a title, a
// chat that never received a message). Fill the gaps so the sidebar can always
// render, instead of throwing on an undefined title somewhere down the tree.
function normalizeChats(list: unknown): ChatSummary[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      network: item.network === "zalo" ? "zalo" : "telegram",
      title: typeof item.title === "string" && item.title.trim() ? item.title : "Hội thoại không tên",
      isGroup: Boolean(item.isGroup),
      unread: Number(item.unread) || 0,
      lastAt: Number(item.lastAt) || 0,
      lastText: typeof item.lastText === "string" ? item.lastText : "",
      avatar: typeof item.avatar === "string" ? item.avatar : undefined,
    }));
}

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  coreError: null,
  auth: EMPTY_AUTH,
  chats: [],
  messages: {},
  reactions: {},
  activeChat: null,
  folder: "all",
  search: "",
  settingsOpen: false,
  onboardingDismissed: readOnboardingDismissed(),
  telegramStep: "phone",
  zaloQr: null,
  zaloScanned: null,
  zaloQrHidden: false,
  vault: { pending: 0, uploaded: 0, failed: 0 },
  sending: false,
  info: null,
  toasts: [],
  telegramQr: null,
  telegramScanned: null,
  telegramQrHidden: false,
  hideTelegramQr: () => set({ telegramQrHidden: true }),

  hydrate: async () => {
    try {
      const [info, chats, vault] = await Promise.all([
        call<AppInfo>("app.info"),
        call<ChatSummary[]>("chats.list"),
        call<VaultStatus>("vault.status"),
      ]);
      set({ info, auth: info.auth, chats: normalizeChats(chats), vault, booted: true, coreError: null });
    } catch (error) {
      set({ booted: true, coreError: errorText(error) });
    }
  },

  handleEvent: (event, data) => {
    switch (event) {
      case "core:ready": {
        set((state) => ({
          booted: true,
          auth: data?.auth ?? state.auth,
          chats: data?.chats ? normalizeChats(data.chats) : state.chats,
          vault: data?.vault ?? state.vault,
          info: state.info
            ? { ...state.info, config: data?.config ?? state.info.config }
            : state.info,
        }));
        break;
      }
      case "auth:status": {
        set((state) => {
          const nextAuth: AuthStatus = {
            telegram: { ...state.auth.telegram, ...(data?.telegram ?? {}) },
            zalo: { ...state.auth.zalo, ...(data?.zalo ?? {}) },
          };
          return {
            auth: nextAuth,
            telegramStep: nextAuth.telegram.connected ? "phone" : state.telegramStep,
          };
        });
        break;
      }
      case "chats":
        if (Array.isArray(data?.chats)) set({ chats: normalizeChats(data.chats) });
        break;
      case "notification:new": {
        const text = data?.text ?? data?.message ?? data?.title ?? "";
        if (text) get().toast(data?.kind === "error" ? "error" : "info", text);
        break;
      }
      case "messages":
        if (data?.chatId) {
          set((state) => ({
            messages: {
              ...state.messages,
              [data.chatId]: mergeMessages(state.messages[data.chatId], data.messages ?? []),
            },
          }));
        }
        break;
      case "message:new": {
        const message = data?.message as ChatMessage | undefined;
        if (!message) break;
        set((state) => {
          if (!state.messages[message.chatId]) return {};
          return {
            messages: {
              ...state.messages,
              [message.chatId]: mergeMessages(state.messages[message.chatId], [message]),
            },
          };
        });
        break;
      }
      case "message:update": {
        const message = data?.message as ChatMessage | undefined;
        if (!message) break;
        set((state) => {
          const list = state.messages[message.chatId];
          if (!list) return {};
          return {
            messages: {
              ...state.messages,
              [message.chatId]: list.map((item) => (item.id === message.id ? message : item)),
            },
          };
        });
        break;
      }
      case "message:edit": {
        const message = data?.message as ChatMessage | undefined;
        if (!message) break;
        set((state) => {
          const list = state.messages[message.chatId];
          if (!list) return {};
          return {
            messages: {
              ...state.messages,
              [message.chatId]: list.map((item) =>
                item.id === message.id ? { ...item, edit: message } : item
              ),
            },
          };
        });
        break;
      }
      case "message:delete": {
        const { chatId, messageId } = data ?? {};
        if (!chatId || !messageId) break;
        set((state) => {
          const list = state.messages[chatId];
          if (!list) return {};
          return {
            messages: {
              ...state.messages,
              [chatId]: list.filter((item) => item.id !== messageId),
            },
          };
        });
        break;
      }
      case "message:reaction": {
        const { chatId, messageId, emoji, userId, username, at } = data ?? {};
        if (!chatId || !messageId || !emoji) break;
        set((state) => {
          const list = state.messages[chatId];
          if (!list) return {};
          return {
            messages: {
              ...state.messages,
              [chatId]: list.map((item) => {
                if (item.id !== messageId) return item;
                const current = item.reactions ?? [];
                const mine = (reaction: Reaction) =>
                  reaction.emoji === emoji && reaction.userId === userId;
                const reactions = current.some(mine)
                  ? current.filter((reaction) => !mine(reaction))
                  : [...current, { emoji, userId, username, at: at ?? Date.now() }];
                return { ...item, reactions };
              }),
            },
          };
        });
        break;
      }
      case "zalo:qr":
        set({
          zaloQr: normalizeQr(data?.image ?? ""),
          zaloScanned: null,
          zaloQrHidden: false,
        });
        break;
      case "zalo:scanned":
        set({ zaloScanned: data?.name ? `Đã quét bởi ${data.name}` : "Đã quét mã QR", zaloQr: null });
        break;
      case "zalo:qr_expired":
        set({ zaloScanned: "Mã QR đã hết hạn, đang tạo mã mới…" });
        break;
      case "tg:need_code":
        set((state) => ({
          telegramStep: "code",
          auth: { ...state.auth, telegram: { ...state.auth.telegram, phase: "waiting_code" } },
        }));
        break;
      case "tg:need_password":
        set((state) => ({
          telegramStep: "password",
          auth: { ...state.auth, telegram: { ...state.auth.telegram, phase: "waiting_password" } },
        }));
        break;
      case "tg:need_qr":
        set((state) => ({
          telegramStep: "qr",
          auth: { ...state.auth, telegram: { ...state.auth.telegram, phase: "waiting_qr" } },
        }));
        break;
      case "tg:error":
        get().toast("error", `Telegram: ${data?.message ?? "Đăng nhập thất bại"}`);
        break;
      case "vault:status":
        if (data) set({ vault: data });
        break;
      case "notice":
        get().toast(data?.kind === "error" ? "error" : "info", data?.text ?? "");
        break;
      default:
        break;
    }
  },

  setFolder: (folder) => set({ folder }),
  setSearch: (search) => set({ search }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  dismissOnboarding: () => {
    writeOnboardingDismissed(true);
    set({ onboardingDismissed: true });
  },
  showOnboarding: () => {
    writeOnboardingDismissed(false);
    set({ onboardingDismissed: false, settingsOpen: false });
  },
  setCoreError: (message) => set({ coreError: message }),
  showZaloQr: () => set({ zaloQrHidden: false }),
  hideZaloQr: () => set({ zaloQrHidden: true }),

  openChat: async (chatId) => {
    set((state) => ({
      activeChat: chatId,
      chats: chatId
        ? state.chats.map((chat) => (chat.id === chatId ? { ...chat, unread: 0 } : chat))
        : state.chats,
    }));
    try {
      await call("messages.active", { chatId });
      if (!chatId) return;
      const response = await call<{ messages: ChatMessage[] }>("messages.list", { chatId });
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: mergeMessages(state.messages[chatId], response.messages ?? []),
        },
      }));
    } catch (error) {
      get().toast("error", errorText(error));
    }
  },

  send: async (text) => {
    const chatId = get().activeChat;
    if (!chatId || !text.trim()) return;
    set({ sending: true });
    try {
      const response = await call<{ message: ChatMessage }>("messages.send", { chatId, text });
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: mergeMessages(state.messages[chatId], [response.message]),
        },
      }));
    } catch (error) {
      get().toast("error", `Không gửi được tin nhắn: ${errorText(error)}`);
      throw error;
    } finally {
      set({ sending: false });
    }
  },

  sendFile: async (path, caption) => {
    const chatId = get().activeChat;
    if (!chatId) return;
    set({ sending: true });
    try {
      const response = await call<{ message: ChatMessage }>("messages.sendMedia", {
        chatId,
        path,
        caption,
      });
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: mergeMessages(state.messages[chatId], [response.message]),
        },
      }));
    } catch (error) {
      get().toast("error", `Không gửi được tệp: ${errorText(error)}`);
      throw error;
    } finally {
      set({ sending: false });
    }
  },

  refresh: async () => {
    try {
      const chats = await call<ChatSummary[]>("chats.refresh");
      set({ chats: normalizeChats(chats) });
      get().toast("info", "Đã đồng bộ danh sách hội thoại");
    } catch (error) {
      get().toast("error", errorText(error));
    }
  },

  fetchMedia: async (message) => {
    try {
      const response = await call<{ path: string }>("media.get", { messageId: message.id });
      set((state) => {
        const list = state.messages[message.chatId] ?? [];
        return {
          messages: {
            ...state.messages,
            [message.chatId]: list.map((item) =>
              item.id === message.id
                ? { ...item, media: { ...(item.media ?? { kind: "file", name: "file" }), localPath: response.path } }
                : item,
            ),
          },
        };
      });
    } catch (error) {
      get().toast("error", errorText(error));
    }
  },

  startTelegram: async (phone) => {
    try {
      await call("auth.telegram.start", { phone });
    } catch (error) {
      get().toast("error", `Telegram: ${errorText(error)}`);
      throw error;
    }
  },

  submitTelegramCode: async (code) => {
    try {
      await call("auth.telegram.code", { code });
    } catch (error) {
      get().toast("error", `Telegram: ${errorText(error)}`);
      throw error;
    }
  },

  submitTelegramPassword: async (password) => {
    try {
      await call("auth.telegram.password", { password });
    } catch (error) {
      get().toast("error", `Telegram: ${errorText(error)}`);
      throw error;
    }
  },

  resetTelegramStep: () => set({ telegramStep: "phone" }),

  startZalo: async () => {
    set({ zaloQr: null, zaloScanned: null });
    try {
      await call("auth.zalo.start", {}, 180_000);
    } catch (error) {
      get().toast("error", `Zalo: ${errorText(error)}`);
    }
  },

  logout: async (network) => {
    try {
      const auth = await call<AuthStatus>(`auth.${network}.logout`);
      set({ auth, zaloQr: null, zaloScanned: null });
      get().toast("info", `Đã ngắt kết nối ${network === "telegram" ? "Telegram" : "Zalo"}`);
    } catch (error) {
      get().toast("error", errorText(error));
    }
  },

  saveConfig: async (patch) => {
    try {
      const config = await call<AppConfig>("config.set", patch);
      set((state) => ({
        info: state.info ? { ...state.info, config } : state.info,
      }));
      get().toast("info", "Đã lưu cấu hình");
    } catch (error) {
      get().toast("error", errorText(error));
      throw error;
    }
  },

  flushVault: async () => {
    try {
      const vault = await call<VaultStatus>("vault.flush");
      set({ vault });
      get().toast("info", "Đã kích hoạt lại hàng đợi kho Telegram");
    } catch (error) {
      get().toast("error", errorText(error));
    }
  },

  toast: (kind, text) => {
    // A malformed payload must never reach React as an object child.
    const message = typeof text === "string" ? text : String(text ?? "");
    if (!message) return;
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, kind, text: message }] }));
    window.setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

export function unreadTotal(chats: ChatSummary[]): number {
  return chats.reduce((total, chat) => total + chat.unread, 0);
}

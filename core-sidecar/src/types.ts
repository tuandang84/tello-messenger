export type Network = "telegram" | "zalo";

export type MediaKind = "image" | "video" | "audio" | "file" | "sticker";

export interface MessageMedia {
  kind: MediaKind;
  name: string;
  mimeType?: string;
  size?: number;
  /** Local file path that a webview can preview through the Tauri asset protocol. */
  localPath?: string;
  /** True when the original file already lives in the Telegram vault. */
  vaulted?: boolean;
}

export interface ChatSummary {
  id: string;
  network: Network;
  title: string;
  isGroup: boolean;
  unread: number;
  lastAt: number;
  lastText: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  network: Network;
  text: string;
  at: number;
  outgoing: boolean;
  senderName?: string;
  media?: MessageMedia;
  pending?: boolean;
  failed?: boolean;
}

export type AuthPhase =
  | "idle"
  | "connecting"
  | "waiting_code"
  | "waiting_password"
  | "waiting_qr"
  | "error";

export interface NetworkAuthState {
  connected: boolean;
  user?: string;
  phase: AuthPhase;
  error?: string;
}

export interface AuthStatus {
  telegram: NetworkAuthState;
  zalo: NetworkAuthState;
}

export interface AppConfig {
  telegramApiId: number;
  telegramApiHash: string;
  vaultPeer: string;
}

export interface VaultStatus {
  pending: number;
  uploaded: number;
  failed: number;
}

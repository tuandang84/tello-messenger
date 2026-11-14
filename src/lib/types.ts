export type Network = "telegram" | "zalo";

export type MediaKind = "image" | "video" | "audio" | "file" | "sticker";

export interface MessageMedia {
  kind: MediaKind;
  name: string;
  mimeType?: string;
  size?: number;
  localPath?: string;
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
  edit?: ChatMessage; // For edited messages (original message data)
  reactions?: Reaction[]; // Emoji reactions
}

export interface Reaction {
  emoji: string;
  userId: string;
  username?: string;
  at: number;
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

export interface AppInfo {
  dataDir: string;
  version: string;
  runtime: string;
  config: AppConfig;
  auth: AuthStatus;
  stats: { chats: number; messages: number; sizeBytes: number };
  vault: VaultStatus;
}

export type Folder = "all" | "telegram" | "zalo" | "unread";

export type TelegramStep = "phone" | "code" | "password" | "qr";

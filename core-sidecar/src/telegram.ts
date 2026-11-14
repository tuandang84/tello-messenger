import fs from "node:fs";
import path from "node:path";
import { TelegramClient, Api } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { NewMessage, type NewMessageEvent } from "teleproto/events";
import type { ConfigStore } from "./config.ts";
import type { SecretStore } from "./secrets.ts";
import type { LocalStore } from "./store.ts";
import type { AuthStatus, ChatMessage, MessageMedia, NetworkAuthState } from "./types.ts";

type Emit = (event: string, data?: unknown) => void;

interface TelegramSecrets {
  telegramSession?: string;
}

const SESSION_PASSWORD_NEEDED = "SESSION_PASSWORD_NEEDED";

export class TelegramBridge {
  private client: TelegramClient | null = null;
  private state: NetworkAuthState = { connected: false, phase: "idle" };
  private codeHash: string | null = null;
  private phone: string | null = null;
  private handlerAttached = false;
  private loginInFlight = false;

  constructor(
    private readonly deps: {
      dataDir: string;
      config: ConfigStore;
      secrets: SecretStore;
      store: LocalStore;
      emit: Emit;
    },
  ) {}

  getStatus(): AuthStatus["telegram"] {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected && !!this.client;
  }

  async restore(): Promise<void> {
    const saved = this.deps.secrets.read<TelegramSecrets>();
    if (!saved.telegramSession) return;
    try {
      this.setState({ connected: false, phase: "connecting" });
      const client = this.createClient(saved.telegramSession);
      await client.connect();
      if (!(await client.checkAuthorization())) {
        await client.disconnect().catch(() => undefined);
        this.deps.secrets.write({ ...this.deps.secrets.read<TelegramSecrets>(), telegramSession: undefined });
        this.setState({ connected: false, phase: "idle" });
        return;
      }
      this.client = client;
      const me = await client.getMe();
      this.attachHandlers();
      this.state = { connected: true, phase: "idle", user: displayName(me) };
      this.deps.emit("auth:status", { telegram: this.getStatus() });
      await this.refreshDialogs();
      this.deps.store.syncHistory("all"); // Sync message history on restore
    } catch (error) {
      console.error("[telegram] restore failed:", error);
      this.setState({ connected: false, phase: "idle", error: "Phiên Telegram đã hết hạn" });
      this.client = null;
    }
  }

  async startLogin(phone: string): Promise<void> {
    const normalized = phone.replace(/[^\d+]/g, "");
    if (!normalized) throw new Error("Số điện thoại không hợp lệ");

    await this.disconnectClient();

    const { telegramApiId, telegramApiHash } = this.deps.config.get();
    this.phone = normalized;
    this.setState({ connected: false, phase: "connecting" });
    const client = this.createClient("");
    this.client = client;

    try {
      await client.connect();
      const result = await client.sendCode({ apiId: telegramApiId, apiHash: telegramApiHash }, normalized);
      this.codeHash = result.phoneCodeHash;
      this.setState({ connected: false, phase: "waiting_code" });
      this.deps.emit("tg:need_code", { isCodeViaApp: result.isCodeViaApp });
    } catch (error) {
      this.client = null;
      this.setState({ connected: false, phase: "error", error: messageOf(error) });
      this.deps.emit("tg:error", { message: messageOf(error) });
      throw error;
    }
  }

  async startLoginQr(): Promise<void> {
    if (this.loginInFlight) return;
    this.loginInFlight = true;
    this.setState({ connected: false, phase: "connecting" });

    try {
      const client = this.createClient("");
      this.client = client;
      await client.connect();
      // For QR login, we send code normally but mark the phase for QR flow
      const result = await client.sendCode({ apiId: this.deps.config.get().telegramApiId, apiHash: this.deps.config.get().telegramApiHash }, this.phone ?? "");
      this.codeHash = result.phoneCodeHash;
      this.setState({ connected: false, phase: "waiting_code" });
      this.deps.emit("tg:need_code");
    } catch (error) {
      this.client = null;
      this.setState({ connected: false, phase: "error", error: messageOf(error) });
      this.deps.emit("tg:error", { message: messageOf(error) });
      throw error;
    } finally {
      this.loginInFlight = false;
    }
  }

  async submitCode(code: string): Promise<void> {
    if (!this.client || !this.codeHash || !this.phone) throw new Error("Chưa gửi mã đăng nhập");
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phone,
          phoneCodeHash: this.codeHash,
          phoneCode: code.trim(),
        }),
      );
      const me = await this.client.getMe();
      await this.finishLogin(me);
    } catch (error) {
      const text = messageOf(error);
      if (text.includes(SESSION_PASSWORD_NEEDED)) {
        this.setState({ connected: false, phase: "waiting_password" });
        this.deps.emit("tg:need_password");
        return;
      }
      this.setState({ connected: false, phase: "error", error: text });
      this.deps.emit("tg:error", { message: text });
      throw error;
    }
  }

  async submitPassword(password: string): Promise<void> {
    if (!this.client) throw new Error("Chưa kết nối Telegram");
    const { telegramApiId, telegramApiHash } = this.deps.config.get();
    try {
      await this.client.signInWithPassword(
        { apiId: telegramApiId, apiHash: telegramApiHash },
        {
          password: async () => password,
          onError: (error) => {
            throw error;
          },
        },
      );
      const me = await this.client.getMe();
      await this.finishLogin(me);
    } catch (error) {
      this.setState({ connected: false, phase: "error", error: messageOf(error) });
      this.deps.emit("tg:error", { message: messageOf(error) });
      throw error;
    }
  }

  async logout(): Promise<void> {
    await this.disconnectClient();
    this.deps.secrets.write({ ...this.deps.secrets.read<TelegramSecrets>(), telegramSession: undefined });
    this.state = { connected: false, phase: "idle" };
    this.deps.emit("auth:status", { telegram: this.getStatus() });
  }

  async refreshDialogs(): Promise<void> {
    if (!this.client) return;
    const dialogs = await this.client.getDialogs({ limit: 150 });
    for (const dialog of dialogs) {
      const rawId = dialog.id?.toString();
      if (!rawId) continue;
      const chatId = chatIdOf(rawId);
      const last = dialog.message;
      const lastAt = last?.date ? last.date * 1000 : Date.now();
      this.deps.store.upsertChat({
        id: chatId,
        network: "telegram",
        title: dialog.title || dialog.name || rawId,
        isGroup: !!dialog.isGroup || !!dialog.isChannel,
        unread: dialog.unreadCount ?? 0,
        lastAt,
        lastText: last?.text?.replace(/\s+/g, " ").slice(0, 160) || "",
      });
    }
    this.deps.emit("chats", { chats: this.deps.store.listChats() });
  }

  async loadHistory(chatId: string, limit: number): Promise<void> {
    if (!this.client) return;
    const messages = await this.client.getMessages(peerOf(chatId), { limit });
    const chat = this.deps.store.getChat(chatId);
    for (const message of messages) {
      if (!message || !message.id) continue;
      const mapped = this.mapMessage(message, chatId, chat?.title);
      this.deps.store.saveMessage(mapped);
    }
  }

  async sendText(chatId: string, text: string): Promise<ChatMessage> {
    if (!this.client) throw new Error("Telegram chưa kết nối");
    const sent = await this.client.sendMessage(peerOf(chatId), { message: text });
    const chat = this.deps.store.getChat(chatId);
    const mapped = this.mapMessage(sent, chatId, chat?.title);
    this.deps.store.saveMessage(mapped);
    this.deps.store.touchChat(chatId, mapped.at, mapped.text || "[Tệp tin]", false);
    return mapped;
  }

  async sendFile(chatId: string, filePath: string, caption: string): Promise<ChatMessage> {
    if (!this.client) throw new Error("Telegram chưa kết nối");
    const sent = await this.client.sendFile(peerOf(chatId), { file: filePath, caption });
    const chat = this.deps.store.getChat(chatId);
    const mapped = this.mapMessage(sent, chatId, chat?.title);
    if (mapped.media) mapped.media.localPath = filePath;
    this.deps.store.saveMessage(mapped);
    this.deps.store.touchChat(chatId, mapped.at, mapped.text || mapped.media?.name || "[Tệp tin]", false);
    return mapped;
  }

  /** Copies a Telegram message attachment into the local media cache. */
  async downloadMedia(chatId: string, unifiedMessageId: string): Promise<string> {
    if (!this.client) throw new Error("Telegram chưa kết nối");
    const messageId = Number(unifiedMessageId.split("_").pop());
    if (!messageId) throw new Error("ID tin nhắn không hợp lệ");
    const messages = await this.client.getMessages(peerOf(chatId), { ids: [messageId] });
    const message = messages[0];
    if (!message) throw new Error("Không tìm thấy tin nhắn trên Telegram");
    const name = message.file?.name || `telegram_${messageId}`;
    const output = path.join(
      this.deps.dataDir,
      "cache",
      `${safeName(unifiedMessageId)}_${safeName(name)}`,
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!fs.existsSync(output)) {
      const buffer = await this.client.downloadMedia(message, { outputFile: output });
      if (!buffer && !fs.existsSync(output)) throw new Error("Telegram không trả về tệp tin");
      if (buffer && !fs.existsSync(output)) fs.writeFileSync(output, buffer);
    }
    return output;
  }

  /** Uploads a local file into the Telegram vault peer and returns the message id. */
  async uploadToVault(filePath: string, caption: string): Promise<number> {
    if (!this.client) throw new Error("Telegram chưa kết nối");
    const peer = this.deps.config.get().vaultPeer || "me";
    // forceDocument keeps the original bytes: Telegram would otherwise
    // recompress photos/videos, which defeats the point of an archive.
    const sent = await this.client.sendFile(peerOfPeer(peer), {
      file: filePath,
      caption,
      forceDocument: true,
    });
    return sent.id;
  }

  /** Downloads a file that is already stored in the Telegram vault. */
  async downloadVault(peer: string, messageId: number, fileName: string): Promise<string> {
    if (!this.client) throw new Error("Telegram chưa kết nối");
    const messages = await this.client.getMessages(peerOfPeer(peer), { ids: [messageId] });
    const message = messages[0];
    if (!message) throw new Error("Không tìm thấy tệp trong kho Telegram");
    const output = path.join(
      this.deps.dataDir,
      "cache",
      `${safeName(peer)}_${messageId}_${safeName(fileName)}`,
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!fs.existsSync(output)) {
      const buffer = await this.client.downloadMedia(message, { outputFile: output });
      if (buffer && !fs.existsSync(output)) fs.writeFileSync(output, buffer);
    }
    return output;
  }

  private async finishLogin(me: Api.TypeUser): Promise<void> {
    if (!this.client) return;
    const session = (this.client.session as StringSession).save();
    this.deps.secrets.write({ ...this.deps.secrets.read<TelegramSecrets>(), telegramSession: session });
    this.attachHandlers();
    this.state = { connected: true, phase: "idle", user: displayName(me) };
    this.codeHash = null;
    this.phone = null;
    this.deps.emit("auth:status", { telegram: this.getStatus() });
    await this.refreshDialogs().catch((error) => console.error("[telegram] dialogs:", error));
  }

  private createClient(session: string): TelegramClient {
    const { telegramApiId, telegramApiHash } = this.deps.config.get();
    return new TelegramClient(new StringSession(session), telegramApiId, telegramApiHash, {
      connectionRetries: 5,
    });
  }

  private attachHandlers(): void {
    if (!this.client || this.handlerAttached) return;
    this.handlerAttached = true;
    this.client.addEventHandler((event) => this.onNewMessage(event), new NewMessage({}));
  }

  private async onNewMessage(event: NewMessageEvent): Promise<void> {
    const rawChatId = event.chatId?.toString();
    if (!rawChatId) return;
    const chatId = chatIdOf(rawChatId);
    try {
      let chat = this.deps.store.getChat(chatId);
      if (!chat) {
        const entity = await event.getChat().catch(() => null);
        chat = {
          id: chatId,
          network: "telegram",
          title: displayName(entity) || rawChatId,
          isGroup: !event.isPrivate,
          unread: 0,
          lastAt: 0,
          lastText: "",
        };
        this.deps.store.upsertChat(chat);
      }
      const sender = await event.message.getSender().catch(() => null);
      const mapped = this.mapMessage(event.message, chatId, chat.title, displayName(sender));
      this.deps.store.saveMessage(mapped);
      const isActive = this.activeChatId === chatId;
      this.deps.store.touchChat(
        chatId,
        mapped.at,
        mapped.text || mapped.media?.name || "[Tệp tin]",
        !mapped.outgoing && !isActive,
      );
      this.deps.emit("message:new", { message: mapped });
      this.deps.emit("message:edit", { message: mapped });
      this.deps.emit("message:delete", { messageId: mapped.id });
      this.deps.emit("notification:new", { title: "Tello", message: mapped.text ?? "[Tin nhắn mới]" });
      this.deps.emit("chats", { chats: this.deps.store.listChats() });
    } catch (error) {
      console.error("[telegram] new message:", error);
    }
  }

  setActiveChat(chatId: string | null): void {
    this.activeChatId = chatId;
  }

  private activeChatId: string | null = null;

  private mapMessage(
    message: Api.Message,
    chatId: string,
    chatTitle?: string,
    senderName?: string,
  ): ChatMessage {
    const raw = message as unknown as Record<string, any>;
    const media = mediaOf(raw);
    return {
      id: `${chatId}_${raw.id}`,
      chatId,
      network: "telegram",
      text: typeof raw.text === "string" ? raw.text : raw.message ?? "",
      at: Number(raw.date ?? Math.floor(Date.now() / 1000)) * 1000,
      outgoing: Boolean(raw.out),
      senderName: senderName || chatTitle || undefined,
      media,
    };
  }

  private setState(state: NetworkAuthState): void {
    this.state = state;
    this.deps.emit("auth:status", { telegram: this.getStatus() });
  }

  private async disconnectClient(): Promise<void> {
    this.handlerAttached = false;
    if (this.client) {
      await this.client.disconnect().catch(() => undefined);
      this.client = null;
    }
  }
}

export function chatIdOf(rawId: string): string {
  return `tg_${rawId}`;
}

export function peerOf(chatId: string): string | number {
  return peerOfPeer(chatId.replace(/^tg_/, ""));
}

function peerOfPeer(peer: string): string | number {
  if (/^-?\d+$/.test(peer)) {
    const numeric = Number(peer);
    return Number.isSafeInteger(numeric) ? numeric : peer;
  }
  return peer;
}

export function displayName(entity: unknown): string {
  if (!entity || typeof entity !== "object") return "";
  const raw = entity as Record<string, any>;
  const parts = [raw.firstName, raw.lastName].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return raw.title || raw.name || raw.username || "";
}

function mediaOf(raw: Record<string, any>): MessageMedia | undefined {
  const file = raw.file ?? {};
  const name: string = file.name || file.title || "";
  const mimeType: string | undefined = file.mimeType || undefined;
  const size: number | undefined = file.size || undefined;

  if (raw.photo) return { kind: "image", name: name || "photo.jpg", mimeType: mimeType || "image/jpeg", size };
  if (raw.video || raw.videoNote || raw.gif) {
    return { kind: "video", name: name || "video.mp4", mimeType: mimeType || "video/mp4", size };
  }
  if (raw.audio || raw.voice) {
    return { kind: "audio", name: name || "audio.mp3", mimeType: mimeType || "audio/mpeg", size };
  }
  if (raw.sticker) return { kind: "sticker", name: name || "sticker.webp", mimeType, size };
  if (raw.document) return { kind: "file", name: name || "document", mimeType, size };
  return undefined;
}

export function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "file";
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

import fs from "node:fs";
import path from "node:path";
import {
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  type API,
  type GroupInfo,
  type LoginQRCallbackEvent,
  type Message,
  type User,
} from "zca-js";
import { imageSize } from "image-size";
import type { SecretStore } from "./secrets.ts";
import type { LocalStore } from "./store.ts";
import type {
  AuthStatus,
  ChatMessage,
  ChatSummary,
  MediaKind,
  MessageMedia,
  NetworkAuthState,
} from "./types.ts";
import { safeName } from "./telegram.ts";

type Emit = (event: string, data?: unknown) => void;

interface ZaloCredentials {
  imei: string;
  userAgent: string;
  cookie: unknown;
}

interface ZaloSecrets {
  zalo?: ZaloCredentials;
}

export interface ZaloMediaPayload {
  chatId: string;
  messageId: string;
  href: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class ZaloBridge {
  private api: API | null = null;
  private state: NetworkAuthState = { connected: false, phase: "idle" };
  private friends = new Map<string, User>();
  private groups = new Map<string, GroupInfo>();
  private userAgent = DEFAULT_USER_AGENT;
  private loginInFlight = false;
  private activeChatId: string | null = null;

  constructor(
    private readonly deps: {
      dataDir: string;
      secrets: SecretStore;
      store: LocalStore;
      emit: Emit;
      onMedia: (payload: ZaloMediaPayload) => Promise<void>;
    },
  ) {}

  getStatus(): AuthStatus["zalo"] {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected && !!this.api;
  }

  async restore(): Promise<void> {
    const saved = this.deps.secrets.read<ZaloSecrets>();
    if (!saved.zalo) return;
    try {
      this.userAgent = saved.zalo.userAgent || DEFAULT_USER_AGENT;
      this.setState({ connected: false, phase: "connecting" });
      const api = await this.createClient().login({
        imei: saved.zalo.imei,
        userAgent: this.userAgent,
        cookie: saved.zalo.cookie as never,
      });
      await this.attach(api);
    } catch (error) {
      console.error("[zalo] restore failed:", error);
      this.deps.secrets.write({ ...this.deps.secrets.read<ZaloSecrets>(), zalo: undefined });
      this.setState({ connected: false, phase: "idle", error: "Phiên Zalo đã hết hạn" });
    }
  }

  async startLogin(): Promise<void> {
    if (this.loginInFlight) return;
    this.loginInFlight = true;
    this.setState({ connected: false, phase: "waiting_qr" });

    try {
      const api = await this.createClient().loginQR({ userAgent: this.userAgent }, (event) => {
        this.handleQrEvent(event);
      });
      if (!api) throw new Error("Đăng nhập Zalo đã bị hủy");
      await this.attach(api);
    } catch (error) {
      const text = messageOf(error);
      this.setState({ connected: false, phase: "error", error: text });
      this.deps.emit("notice", { kind: "error", text: `Zalo: ${text}` });
      throw error;
    } finally {
      this.loginInFlight = false;
    }
  }

  async logout(): Promise<void> {
    try {
      this.api?.listener.stop();
    } catch {
      /* listener already stopped */
    }
    this.api = null;
    this.setState({ connected: false, phase: "idle" });
    this.deps.secrets.write({ ...this.deps.secrets.read<ZaloSecrets>(), zalo: undefined });
  }

  async refreshContacts(): Promise<void> {
    if (!this.api) return;

    try {
      const friends = await this.api.getAllFriends(500, 1);
      this.friends.clear();
      for (const friend of friends) {
        this.friends.set(friend.userId, friend);
        this.deps.store.upsertChat({
          id: chatIdOf(friend.userId),
          network: "zalo",
          title: friend.displayName || friend.zaloName || friend.userId,
          isGroup: false,
          unread: 0,
          lastAt: 0,
          lastText: "",
          avatar: friend.avatar || undefined,
        });
      }
    } catch (error) {
      console.error("[zalo] friends:", error);
    }

    try {
      const groups = await this.api.getAllGroups();
      const ids = Object.keys(groups.gridVerMap ?? {}).slice(0, 300);
      this.groups.clear();
      if (ids.length) {
        const info = await this.api.getGroupInfo(ids);
        for (const [groupId, group] of Object.entries(info.gridInfoMap ?? {})) {
          this.groups.set(groupId, group);
          this.deps.store.upsertChat({
            id: chatIdOf(groupId),
            network: "zalo",
            title: group.name || groupId,
            isGroup: true,
            unread: 0,
            lastAt: 0,
            lastText: "",
            avatar: group.avt || group.fullAvt || undefined,
          });
        }
      }
    } catch (error) {
      console.error("[zalo] groups:", error);
    }

    this.deps.emit("chats", { chats: this.deps.store.listChats() });
  }

  async loadHistory(chatId: string, limit: number): Promise<void> {
    if (!this.api) return;
    const isGroup = this.deps.store.getChat(chatId)?.isGroup ?? false;
    if (!isGroup) return;

    const groupId = threadIdOf(chatId);
    try {
      const history = await this.api.getGroupChatHistory(groupId, Math.min(limit, 100));
      for (const message of history.groupMsgs ?? []) {
        const mapped = this.mapMessage(message.data, chatId, true, message.isSelf);
        this.deps.store.saveMessage(mapped);
      }
    } catch (error) {
      console.error("[zalo] group history:", error);
    }
  }

  async sendText(chatId: string, text: string): Promise<ChatMessage> {
    if (!this.api) throw new Error("Zalo chưa kết nối");
    const chat = this.deps.store.getChat(chatId);
    const threadId = threadIdOf(chatId);
    const type = chat?.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await this.api.sendMessage({ msg: text }, threadId, type);
    const messageId = String(result.message?.msgId ?? `local_${Date.now()}`);
    const mapped: ChatMessage = {
      id: messageIdOf(chatId, messageId),
      chatId,
      network: "zalo",
      text,
      at: Date.now(),
      outgoing: true,
      senderName: "Bạn",
    };
    this.deps.store.saveMessage(mapped);
    this.deps.store.touchChat(chatId, mapped.at, text, false);
    return mapped;
  }

  async sendFile(chatId: string, filePath: string, caption: string): Promise<ChatMessage> {
    if (!this.api) throw new Error("Zalo chưa kết nối");
    const chat = this.deps.store.getChat(chatId);
    const threadId = threadIdOf(chatId);
    const type = chat?.isGroup ? ThreadType.Group : ThreadType.User;
    const data = fs.readFileSync(filePath);
    const fileName = safeName(path.basename(filePath));
    const result = await this.api.sendMessage(
      {
        msg: caption,
        attachments: [
          {
            data,
            filename: fileName as `${string}.${string}`,
            metadata: { totalSize: data.length },
          },
        ],
      },
      threadId,
      type,
    );
    // For attachment messages Zalo returns the file message id under
    // `attachment`; `message` may be null when there is no caption.
    const messageId = String(
      result.attachment?.[0]?.msgId ?? result.message?.msgId ?? `local_${Date.now()}`,
    );
    const media = mediaFromFile(filePath);
    media.localPath = filePath;
    const mapped: ChatMessage = {
      id: messageIdOf(chatId, messageId),
      chatId,
      network: "zalo",
      text: caption,
      at: Date.now(),
      outgoing: true,
      senderName: "Bạn",
      media,
    };
    this.deps.store.saveMessage(mapped);
    this.deps.store.touchChat(chatId, mapped.at, caption || media.name, false);
    return mapped;
  }

  setActiveChat(chatId: string | null): void {
    this.activeChatId = chatId;
  }

  async downloadAttachment(href: string, fileName: string): Promise<string> {
    const response = await fetch(href, { headers: { "user-agent": this.userAgent } });
    if (!response.ok) throw new Error(`Không tải được tệp Zalo (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const dir = path.join(this.deps.dataDir, "media");
    fs.mkdirSync(dir, { recursive: true });
    const output = path.join(dir, `${Date.now()}_${safeName(fileName)}`);
    fs.writeFileSync(output, buffer);
    return output;
  }

  private async attach(api: API): Promise<void> {
    this.api = api;
    const info = await api.fetchAccountInfo().catch(() => null);
    const profile = info?.profile;
    const name = profile?.displayName || profile?.zaloName || "Zalo";
    this.state = { connected: true, phase: "idle", user: name };

    api.listener.on("message", (message) => {
      void this.handleMessage(message);
    });
    api.listener.on("connected", () => {
      this.setState({ connected: true, phase: "idle", user: name });
      this.deps.emit("notice", { kind: "info", text: "Zalo đã kết nối lại" });
    });
    api.listener.on("closed", (code, reason) => {
      this.setState({ connected: false, phase: "error", error: `Mất kết nối (${code}) ${reason}` });
    });
    api.listener.on("error", (error) => {
      console.error("[zalo] listener:", error);
      this.deps.emit("notice", { kind: "error", text: `Zalo: ${messageOf(error)}` });
    });
    api.listener.start({ retryOnClose: true });

    this.deps.emit("auth:status", { zalo: this.getStatus() });
    await this.refreshContacts();
  }

  private handleQrEvent(event: LoginQRCallbackEvent): void {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        this.deps.emit("zalo:qr", { image: event.data.image, code: event.data.code });
        break;
      case LoginQRCallbackEventType.QRCodeScanned:
        this.deps.emit("zalo:scanned", {
          name: event.data.display_name,
          avatar: event.data.avatar,
        });
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        this.deps.emit("zalo:qr_expired");
        void event.actions.retry();
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        this.deps.emit("notice", { kind: "error", text: "Zalo đã từ chối đăng nhập trên điện thoại" });
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        this.userAgent = event.data.userAgent || this.userAgent;
        this.deps.secrets.write({
          ...this.deps.secrets.read<ZaloSecrets>(),
          zalo: {
            imei: event.data.imei,
            userAgent: this.userAgent,
            cookie: event.data.cookie,
          },
        });
        break;
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    try {
      const isGroup = message.type === ThreadType.Group;
      const threadId = String(message.threadId);
      const chatId = chatIdOf(threadId);
      const chat =
        this.deps.store.getChat(chatId) ??
        this.fallbackChat(chatId, threadId, isGroup, message.data.dName);
      if (!this.deps.store.getChat(chatId)) this.deps.store.upsertChat(chat);

      const mapped = this.mapMessage(message.data, chatId, isGroup, message.isSelf);
      this.deps.store.saveMessage(mapped);

      const preview = mapped.text || mapped.media?.name || "[Tệp tin]";
      const unread = !mapped.outgoing && this.activeChatId !== chatId;
      this.deps.store.touchChat(chatId, mapped.at, preview, unread);
      this.deps.emit("message:new", { message: mapped });
      this.deps.emit("chats", { chats: this.deps.store.listChats() });

      if (mapped.media) {
        const content = asAttachment(message.data.content);
        if (content?.href) {
          await this.deps.onMedia({
            chatId,
            messageId: mapped.id,
            href: content.href,
            fileName: content.title || mapped.media.name,
            mimeType: mapped.media.mimeType || "application/octet-stream",
            size: mapped.media.size ?? 0,
          });
        }
      }
    } catch (error) {
      console.error("[zalo] message:", error);
      this.deps.emit("notice", { kind: "error", text: `Zalo: ${messageOf(error)}` });
    }
  }

  private fallbackChat(
    chatId: string,
    threadId: string,
    isGroup: boolean,
    senderName: string,
  ): ChatSummary {
    const title = isGroup
      ? this.groups.get(threadId)?.name || `Nhóm Zalo ${threadId}`
      : this.friends.get(threadId)?.displayName || senderName || `Zalo ${threadId}`;
    return { id: chatId, network: "zalo", title, isGroup, unread: 0, lastAt: 0, lastText: "" };
  }

  private mapMessage(
    raw: Message["data"],
    chatId: string,
    isGroup: boolean,
    isSelf: boolean,
  ): ChatMessage {
    const text = typeof raw.content === "string" ? raw.content : "";
    const attachment = asAttachment(raw.content);
    const media = attachment ? mediaFromAttachment(raw.msgType, attachment) : undefined;
    const senderName = isSelf
      ? "Bạn"
      : raw.dName || this.friends.get(String(raw.uidFrom))?.displayName || (isGroup ? "Thành viên" : undefined);

    return {
      id: messageIdOf(chatId, String(raw.msgId)),
      chatId,
      network: "zalo",
      text: text || linkText(raw.content),
      at: Number(raw.ts) || Date.now(),
      outgoing: isSelf,
      senderName,
      media,
    };
  }

  private createClient(): Zalo {
    return new Zalo({
      selfListen: false,
      checkUpdate: false,
      logging: false,
      imageMetadataGetter: async (filePath) => {
        try {
          const size = imageSize(fs.readFileSync(filePath));
          return {
            width: size.width ?? 0,
            height: size.height ?? 0,
            size: fs.statSync(filePath).size,
          };
        } catch {
          return null;
        }
      },
    });
  }

  private setState(state: NetworkAuthState): void {
    this.state = state;
    this.deps.emit("auth:status", { zalo: this.getStatus() });
  }
}

export function chatIdOf(threadId: string): string {
  return `zl_${threadId}`;
}

function threadIdOf(chatId: string): string {
  return chatId.replace(/^zl_/, "");
}

function messageIdOf(chatId: string, messageId: string): string {
  return `${chatId}_${messageId}`;
}

function asAttachment(content: unknown): { href?: string; title?: string; thumb?: string; params?: unknown } | null {
  if (!content || typeof content !== "object") return null;
  const raw = content as Record<string, unknown>;
  if (typeof raw.href !== "string") return null;
  return {
    href: raw.href,
    title: typeof raw.title === "string" ? raw.title : undefined,
    thumb: typeof raw.thumb === "string" ? raw.thumb : undefined,
    params: raw.params,
  };
}

function linkText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const raw = content as Record<string, unknown>;
  const parts = [raw.title, raw.description, raw.href].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return parts.join("\n");
}

function mediaFromAttachment(
  msgType: string,
  attachment: { href?: string; title?: string; params?: unknown },
): MessageMedia {
  const kind = kindOf(msgType);
  const fileName = attachment.title || fileNameFromUrl(attachment.href) || `${msgType}_${Date.now()}`;
  const size = sizeFromParams(attachment.params);
  return {
    kind,
    name: fileName,
    mimeType: mimeFromName(fileName),
    size,
  };
}

function mediaFromFile(filePath: string): MessageMedia {
  const name = path.basename(filePath);
  return {
    kind: kindOf(mimeFromName(name)),
    name,
    mimeType: mimeFromName(name),
    size: fs.statSync(filePath).size,
  };
}

function kindOf(value: string): MediaKind {
  const lower = value.toLowerCase();
  if (lower.includes("photo") || lower.includes("image")) return "image";
  if (lower.includes("video")) return "video";
  if (lower.includes("voice") || lower.includes("audio")) return "audio";
  if (lower.includes("sticker")) return "sticker";
  return "file";
}

function fileNameFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return name.includes(".") ? name : null;
  } catch {
    return null;
  }
}

function sizeFromParams(params: unknown): number {
  if (typeof params === "string") {
    try {
      return Number((JSON.parse(params) as Record<string, unknown>).fileSize ?? 0) || 0;
    } catch {
      return 0;
    }
  }
  if (params && typeof params === "object") {
    return Number((params as Record<string, unknown>).fileSize ?? 0) || 0;
  }
  return 0;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

import fs from "node:fs";
import path from "node:path";
import type { ConfigStore } from "./config.ts";
import type { LocalStore } from "./store.ts";
import type { TelegramBridge } from "./telegram.ts";
import type { ChatMessage } from "./types.ts";

type Emit = (event: string, data?: unknown) => void;

export interface VaultJob {
  chatId: string;
  messageId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Durable upload queue that pushes Zalo attachments into the Telegram vault.
 *
 * A job only leaves `vault_queue` after Telegram returns a message id and the
 * mapping is committed to SQLite. Only then is the temporary file removed, so
 * a crash or network drop never loses the original attachment.
 */
export class VaultService {
  private pumping = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: {
      dataDir: string;
      store: LocalStore;
      config: ConfigStore;
      telegram: TelegramBridge;
      emit: Emit;
    },
  ) {}

  start(): void {
    this.prune();
    this.timer = setInterval(() => void this.pump(), 30_000);
    void this.pump();
    this.emitStatus();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  kick(): void {
    void this.pump();
  }

  enqueue(job: VaultJob): void {
    this.deps.store.queueVault({
      zaloMsgId: job.messageId,
      chatId: job.chatId,
      filePath: job.filePath,
      fileName: job.fileName,
      mime: job.mimeType,
      size: job.size,
    });
    this.emitStatus();
    void this.pump();
  }

  status() {
    return this.deps.store.vaultStatus();
  }

  /** Fetches a vaulted attachment back from Telegram on demand. */
  async fetch(messageId: string): Promise<string> {
    const mapping = this.deps.store.getVaultMap(messageId);
    if (!mapping) throw new Error("Tệp này chưa có trong kho Telegram");
    const localPath = await this.deps.telegram.downloadVault(
      mapping.tg_peer,
      mapping.tg_message_id,
      mapping.file_name,
    );
    this.updateMessage(messageId, (message) => {
      if (!message.media) return message;
      message.media = { ...message.media, localPath, vaulted: true };
      return message;
    });
    return localPath;
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.deps.telegram.isConnected()) return;
    this.pumping = true;
    try {
      const pending = this.deps.store.pendingVault();
      for (const job of pending) {
        if (!fs.existsSync(job.filePath)) {
          this.deps.store.dropVaultQueue(job.zaloMsgId);
          continue;
        }
        try {
          const chat = this.deps.store.getChat(job.chatId);
          const caption = `Zalo · ${chat?.title ?? "chat"} · ${job.fileName} #tello`;
          const tgMessageId = await this.deps.telegram.uploadToVault(job.filePath, caption);
          this.deps.store.saveVaultMap({
            zalo_msg_id: job.zaloMsgId,
            chat_id: job.chatId,
            tg_peer: this.deps.config.get().vaultPeer,
            tg_message_id: tgMessageId,
            file_name: job.fileName,
            mime: job.mime,
            size: job.size,
          });
          this.updateMessage(job.zaloMsgId, (message) => {
            if (!message.media) return message;
            message.media = { ...message.media, vaulted: true };
            return message;
          });
          fs.rmSync(job.filePath, { force: true });
          this.deps.store.dropVaultQueue(job.zaloMsgId);
          this.emitStatus();
        } catch (error) {
          const attempts = this.deps.store.bumpVaultAttempt(job.zaloMsgId);
          console.error(`[vault] upload failed (${attempts}/3):`, error);
          if (attempts >= 3) {
            this.deps.emit("notice", {
              kind: "error",
              text: `Không đẩy được ${job.fileName} lên Telegram sau 3 lần thử`,
            });
          }
          break;
        }
      }
    } finally {
      this.pumping = false;
      this.emitStatus();
    }
  }

  private updateMessage(messageId: string, change: (message: ChatMessage) => ChatMessage): void {
    const message = this.deps.store.getMessage(messageId);
    if (!message) return;
    const next = change(message);
    this.deps.store.saveMessage(next);
    this.deps.emit("message:update", { message: next });
  }

  private emitStatus(): void {
    this.deps.emit("vault:status", this.deps.store.vaultStatus());
  }

  /** Drops stale temporary files from interrupted uploads. */
  private prune(): void {
    const mediaDir = path.join(this.deps.dataDir, "media");
    if (!fs.existsSync(mediaDir)) return;
    const keep = new Set(this.deps.store.pendingVault().map((job) => path.resolve(job.filePath)));
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(mediaDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const full = path.join(mediaDir, entry.name);
      if (keep.has(path.resolve(full))) continue;
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

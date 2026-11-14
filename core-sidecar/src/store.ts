import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import type { ChatMessage, ChatSummary, MessageMedia, Network, VaultStatus } from "./types.ts";

interface ChatRow {
  id: string;
  network: Network;
  title: string;
  is_group: number;
  unread: number;
  last_at: number;
  last_text: string;
  avatar: string | null;
}

interface MessageRow {
  id: string;
  chat_id: string;
  network: Network;
  text: string;
  at: number;
  outgoing: number;
  sender_name: string | null;
  media_json: string | null;
}

interface VaultMapRow {
  zalo_msg_id: string;
  chat_id: string;
  tg_peer: string;
  tg_message_id: number;
  file_name: string;
  mime: string | null;
  size: number | null;
}

export interface VaultQueueItem {
  zaloMsgId: string;
  chatId: string;
  filePath: string;
  fileName: string;
  mime: string | null;
  size: number;
  attempts: number;
}

export class LocalStore {
  private readonly db: Database;
  readonly filePath: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "tello.db");
    this.db = new Database(this.filePath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        network TEXT NOT NULL,
        title TEXT NOT NULL,
        is_group INTEGER NOT NULL DEFAULT 0,
        unread INTEGER NOT NULL DEFAULT 0,
        last_at INTEGER NOT NULL DEFAULT 0,
        last_text TEXT NOT NULL DEFAULT '',
        avatar TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        network TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        at INTEGER NOT NULL,
        outgoing INTEGER NOT NULL DEFAULT 0,
        sender_name TEXT,
        media_json TEXT
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, at);");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vault_map (
        zalo_msg_id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        tg_peer TEXT NOT NULL,
        tg_message_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        mime TEXT,
        size INTEGER,
        created_at INTEGER NOT NULL
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vault_queue (
        zalo_msg_id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
  }

  upsertChat(chat: ChatSummary): void {
    this.db
      .query<unknown, any[]>(
        `INSERT INTO chats (id, network, title, is_group, unread, last_at, last_text, avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           is_group = excluded.is_group,
           avatar = COALESCE(NULLIF(excluded.avatar, ''), chats.avatar),
           unread = CASE WHEN excluded.last_at > 0 OR excluded.unread > 0 THEN excluded.unread ELSE chats.unread END,
           last_at = CASE WHEN excluded.last_at >= chats.last_at THEN excluded.last_at ELSE chats.last_at END,
           last_text = CASE WHEN excluded.last_at >= chats.last_at THEN excluded.last_text ELSE chats.last_text END`,
      )
      .run(
        chat.id,
        chat.network,
        chat.title,
        chat.isGroup ? 1 : 0,
        chat.unread,
        chat.lastAt,
        chat.lastText,
        chat.avatar ?? "",
      );
  }

  touchChat(chatId: string, lastAt: number, lastText: string, incrementUnread: boolean): void {
    const unread = incrementUnread ? 1 : 0;
    this.db
      .query<unknown, any[]>(
        `UPDATE chats
         SET last_at = ?, last_text = ?, unread = unread + ?
         WHERE id = ? AND ? >= last_at`,
      )
      .run(lastAt, lastText, unread, chatId, lastAt);
  }

  setUnread(chatId: string, unread: number): void {
    this.db.query<unknown, any[]>("UPDATE chats SET unread = ? WHERE id = ?").run(unread, chatId);
  }

  markRead(chatId: string): void {
    this.setUnread(chatId, 0);
  }

  listChats(): ChatSummary[] {
    const rows = this.db
      .query<ChatRow, any[]>("SELECT * FROM chats ORDER BY last_at DESC")
      .all();
    return rows.map((row) => ({
      id: row.id,
      network: row.network,
      title: row.title,
      isGroup: row.is_group === 1,
      unread: row.unread,
      lastAt: row.last_at,
      lastText: row.last_text,
      avatar: row.avatar || undefined,
    }));
  }

  getChat(chatId: string): ChatSummary | null {
    const row = this.db
      .query<ChatRow, any[]>("SELECT * FROM chats WHERE id = ?")
      .get(chatId);
    if (!row) return null;
    return {
      id: row.id,
      network: row.network,
      title: row.title,
      isGroup: row.is_group === 1,
      unread: row.unread,
      lastAt: row.last_at,
      lastText: row.last_text,
      avatar: row.avatar || undefined,
    };
  }

  saveMessage(message: ChatMessage): void {
    this.db
      .query<unknown, any[]>(
        `INSERT INTO messages (id, chat_id, network, text, at, outgoing, sender_name, media_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           text = excluded.text,
           sender_name = excluded.sender_name,
           media_json = excluded.media_json`,
      )
      .run(
        message.id,
        message.chatId,
        message.network,
        message.text,
        message.at,
        message.outgoing ? 1 : 0,
        message.senderName ?? null,
        message.media ? JSON.stringify(message.media) : null,
      );
  }

  syncHistory(chatId: string, limit = 200): void {
    const messages = this.listMessages(chatId, limit);
    for (const msg of messages) {
      this.deps.emit("message:new", { message: msg });
    }
    get().toast("info", `Đã đồng bộ ${messages.length} tin nhắn từ ${chatId}`);
  }

  listMessages(chatId: string, limit = 100): ChatMessage[] {
    const rows = this.db
      .query<MessageRow, any[]>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY at DESC LIMIT ?",
      )
      .all(chatId, limit);
    return rows.reverse().map((row) => this.toMessage(row));
  }

  getMessage(messageId: string): ChatMessage | null {
    const row = this.db
      .query<MessageRow, any[]>("SELECT * FROM messages WHERE id = ?")
      .get(messageId);
    return row ? this.toMessage(row) : null;
  }

  private toMessage(row: MessageRow): ChatMessage {
    let media: MessageMedia | undefined;
    if (row.media_json) {
      try {
        media = JSON.parse(row.media_json) as MessageMedia;
      } catch {
        media = undefined;
      }
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      network: row.network,
      text: row.text,
      at: row.at,
      outgoing: row.outgoing === 1,
      senderName: row.sender_name ?? undefined,
      media,
    };
  }

  queueVault(item: Omit<VaultQueueItem, "attempts">): void {
    this.db
      .query<unknown, any[]>(
        `INSERT INTO vault_queue (zalo_msg_id, chat_id, file_path, file_name, mime, size, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(zalo_msg_id) DO UPDATE SET file_path = excluded.file_path`,
      )
      .run(item.zaloMsgId, item.chatId, item.filePath, item.fileName, item.mime, item.size, Date.now());
  }

  pendingVault(): VaultQueueItem[] {
    const rows = this.db
      .query<
        {
          zalo_msg_id: string;
          chat_id: string;
          file_path: string;
          file_name: string;
          mime: string | null;
          size: number;
          attempts: number;
        },
        any[]
      >("SELECT * FROM vault_queue ORDER BY created_at ASC")
      .all();
    return rows.map((row) => ({
      zaloMsgId: row.zalo_msg_id,
      chatId: row.chat_id,
      filePath: row.file_path,
      fileName: row.file_name,
      mime: row.mime,
      size: row.size,
      attempts: row.attempts,
    }));
  }

  bumpVaultAttempt(zaloMsgId: string): number {
    this.db
      .query<unknown, any[]>("UPDATE vault_queue SET attempts = attempts + 1 WHERE zalo_msg_id = ?")
      .run(zaloMsgId);
    const row = this.db
      .query<{ attempts: number }, any[]>("SELECT attempts FROM vault_queue WHERE zalo_msg_id = ?")
      .get(zaloMsgId);
    return row?.attempts ?? 0;
  }

  dropVaultQueue(zaloMsgId: string): void {
    this.db.query<unknown, any[]>("DELETE FROM vault_queue WHERE zalo_msg_id = ?").run(zaloMsgId);
  }

  saveVaultMap(row: VaultMapRow): void {
    this.db
      .query<unknown, any[]>(
        `INSERT OR REPLACE INTO vault_map
         (zalo_msg_id, chat_id, tg_peer, tg_message_id, file_name, mime, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.zalo_msg_id, row.chat_id, row.tg_peer, row.tg_message_id, row.file_name, row.mime, row.size, Date.now());
  }

  getVaultMap(zaloMsgId: string): VaultMapRow | null {
    const row = this.db
      .query<VaultMapRow, any[]>("SELECT * FROM vault_map WHERE zalo_msg_id = ?")
      .get(zaloMsgId);
    return row ?? null;
  }

  vaultStatus(): VaultStatus {
    const pending = this.db
      .query<{ n: number }, any[]>("SELECT COUNT(*) AS n FROM vault_queue")
      .get();
    const uploaded = this.db
      .query<{ n: number }, any[]>("SELECT COUNT(*) AS n FROM vault_map")
      .get();
    const failed = this.db
      .query<{ n: number }, any[]>("SELECT COUNT(*) AS n FROM vault_queue WHERE attempts >= 3")
      .get();
    return { pending: pending?.n ?? 0, uploaded: uploaded?.n ?? 0, failed: failed?.n ?? 0 };
  }

  stats(): { chats: number; messages: number; sizeBytes: number } {
    const chats = this.db.query<{ n: number }, any[]>("SELECT COUNT(*) AS n FROM chats").get();
    const messages = this.db.query<{ n: number }, any[]>("SELECT COUNT(*) AS n FROM messages").get();
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(this.filePath).size;
    } catch {
      sizeBytes = 0;
    }
    return { chats: chats?.n ?? 0, messages: messages?.n ?? 0, sizeBytes };
  }

  close(): void {
    this.db.close();
  }
}

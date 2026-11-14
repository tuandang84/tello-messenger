import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { ConfigStore } from "./config.ts";
import { SecretStore } from "./secrets.ts";
import { LocalStore } from "./store.ts";
import { TelegramBridge } from "./telegram.ts";
import { ZaloBridge, type ZaloMediaPayload } from "./zalo.ts";
import { VaultService } from "./vault.ts";
import type { AuthStatus, ChatMessage } from "./types.ts";

// Libraries occasionally write to stdout. The sidecar protocol owns stdout, so
// every diagnostic goes to stderr instead.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

const dataDir =
  process.env.TELLO_DATA_DIR && process.env.TELLO_DATA_DIR.trim().length > 0
    ? process.env.TELLO_DATA_DIR
    : path.join(os.homedir(), ".tello");

fs.mkdirSync(dataDir, { recursive: true });

const config = new ConfigStore(dataDir);
const secrets = new SecretStore(dataDir);
const store = new LocalStore(dataDir);

function emit(event: string, data?: unknown): void {
  process.stdout.write(`${JSON.stringify({ type: "event", event, data })}\n`);
}

function send(response: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

const telegram = new TelegramBridge({ dataDir, config, secrets, store, emit });
const zalo = new ZaloBridge({
  dataDir,
  secrets,
  store,
  emit,
  onMedia: handleZaloMedia,
});
const vault = new VaultService({ dataDir, store, config, telegram, emit });

function authStatus(): AuthStatus {
  return { telegram: telegram.getStatus(), zalo: zalo.getStatus() };
}

function notify(text: string, kind: "info" | "error" = "info"): void {
  emit("notice", { kind, text });
}

function emitMessages(chatId: string): ChatMessage[] {
  const messages = store.listMessages(chatId, 150);
  emit("messages", { chatId, messages });
  return messages;
}

async function handleZaloMedia(payload: ZaloMediaPayload): Promise<void> {
  try {
    const tempPath = await zalo.downloadAttachment(payload.href, payload.fileName);
    const size = fs.statSync(tempPath).size;
    const cacheDir = path.join(dataDir, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${payload.messageId}_${payload.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_")}`);
    fs.copyFileSync(tempPath, cachePath);

    const message = store.getMessage(payload.messageId);
    if (message?.media) {
      message.media = {
        ...message.media,
        localPath: cachePath,
        size: message.media.size || size,
      };
      store.saveMessage(message);
      emit("message:update", { message });
    }

    vault.enqueue({
      chatId: payload.chatId,
      messageId: payload.messageId,
      filePath: tempPath,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size,
    });
  } catch (error) {
    console.error("[media] zalo attachment:", error);
    notify(`Không tải được tệp Zalo: ${errorText(error)}`, "error");
  }
}

type Payload = Record<string, unknown>;

function stringField(payload: Payload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Thiếu trường ${key}`);
  return value.trim();
}

const handlers: Record<string, (payload: Payload) => Promise<unknown> | unknown> = {
  "app.info": () => ({
    dataDir,
    version: process.env.TELLO_APP_VERSION || "0.1.0",
    runtime: `bun ${process.versions.bun ?? ""}`.trim(),
    config: config.get(),
    auth: authStatus(),
    stats: store.stats(),
    vault: vault.status(),
  }),

  "config.get": () => config.get(),

  "config.set": (payload) => {
    const next = config.set({
      telegramApiId: payload.telegramApiId as number | undefined,
      telegramApiHash: payload.telegramApiHash as string | undefined,
      vaultPeer: payload.vaultPeer as string | undefined,
    });
    return next;
  },

  "auth.status": () => authStatus(),

  "auth.telegram.start": async (payload) => {
    await telegram.startLogin(stringField(payload, "phone"));
    return authStatus();
  },

  "auth.telegram.code": async (payload) => {
    await telegram.submitCode(stringField(payload, "code"));
    return authStatus();
  },

  "auth.telegram.password": async (payload) => {
    await telegram.submitPassword(stringField(payload, "password"));
    vault.kick();
    return authStatus();
  },

  "auth.telegram.logout": async () => {
    await telegram.logout();
    return authStatus();
  },

  "auth.zalo.start": async () => {
    await zalo.startLogin();
    return authStatus();
  },

  "auth.zalo.logout": async () => {
    await zalo.logout();
    return authStatus();
  },

  "chats.list": () => store.listChats(),

  "chats.refresh": async () => {
    await Promise.allSettled([telegram.refreshDialogs(), zalo.refreshContacts()]);
    const chats = store.listChats();
    emit("chats", { chats });
    return chats;
  },

  "messages.list": async (payload) => {
    const chatId = stringField(payload, "chatId");
    const limit = Number(payload.limit ?? 80) || 80;
    if (chatId.startsWith("tg_")) await telegram.loadHistory(chatId, limit);
    if (chatId.startsWith("zl_")) await zalo.loadHistory(chatId, limit);
    store.markRead(chatId);
    emit("chats", { chats: store.listChats() });
    const messages = emitMessages(chatId);
    return { messages };
  },

  "messages.send": async (payload) => {
    const chatId = stringField(payload, "chatId");
    const text = stringField(payload, "text");
    const message = chatId.startsWith("tg_")
      ? await telegram.sendText(chatId, text)
      : await zalo.sendText(chatId, text);
    emit("message:new", { message });
    emit("chats", { chats: store.listChats() });
    return { message };
  },

  "messages.sendMedia": async (payload) => {
    const chatId = stringField(payload, "chatId");
    const filePath = stringField(payload, "path");
    const caption = typeof payload.caption === "string" ? payload.caption : "";
    if (!fs.existsSync(filePath)) throw new Error("Tệp không tồn tại");
    const message = chatId.startsWith("tg_")
      ? await telegram.sendFile(chatId, filePath, caption)
      : await zalo.sendFile(chatId, filePath, caption);
    emit("message:new", { message });
    emit("chats", { chats: store.listChats() });
    return { message };
  },

  "messages.read": (payload) => {
    const chatId = stringField(payload, "chatId");
    store.markRead(chatId);
    emit("chats", { chats: store.listChats() });
    return { ok: true };
  },

  "messages.active": (payload) => {
    const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
    telegram.setActiveChat(chatId);
    zalo.setActiveChat(chatId);
    return { ok: true };
  },

  "media.get": async (payload) => {
    const messageId = stringField(payload, "messageId");
    if (store.getVaultMap(messageId)) {
      const localPath = await vault.fetch(messageId);
      return { path: localPath };
    }
    const message = store.getMessage(messageId);
    if (!message) throw new Error("Không tìm thấy tin nhắn");
    if (message.network !== "telegram") throw new Error("Tệp Zalo chưa được đẩy lên kho Telegram");
    const localPath = await telegram.downloadMedia(message.chatId, message.id);
    message.media = { ...(message.media ?? { kind: "file", name: "file" }), localPath };
    store.saveMessage(message);
    emit("message:update", { message });
    return { path: localPath };
  },

  "vault.status": () => vault.status(),

  "vault.flush": () => {
    vault.kick();
    return vault.status();
  },
};

async function boot(): Promise<void> {
  await Promise.allSettled([telegram.restore(), zalo.restore()]);
  vault.start();
  const chats = store.listChats();
  emit("core:ready", {
    dataDir,
    config: config.get(),
    auth: authStatus(),
    chats,
    vault: vault.status(),
  });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let chain: Promise<void> = Promise.resolve();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  chain = chain.then(async () => {
    let request: { id?: string; cmd?: string } & Payload;
    try {
      request = JSON.parse(trimmed) as typeof request;
    } catch {
      console.error("[core] invalid JSON from host:", trimmed.slice(0, 200));
      return;
    }
    const id = request.id;
    if (!id || !request.cmd) {
      if (id) send({ type: "res", id, ok: false, error: "Thiếu cmd" });
      return;
    }
    const handler = handlers[request.cmd];
    if (!handler) {
      send({ type: "res", id, ok: false, error: `Lệnh không hỗ trợ: ${request.cmd}` });
      return;
    }
    try {
      const data = await handler(request);
      send({ type: "res", id, ok: true, data });
    } catch (error) {
      console.error(`[core] ${request.cmd}:`, error);
      send({ type: "res", id, ok: false, error: errorText(error) });
    }
  });
});

rl.on("close", () => shutdown());

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown(): void {
  vault.stop();
  store.close();
  process.exit(0);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

void boot();

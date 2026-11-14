import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

interface Envelope {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

/**
 * Small encrypted JSON store for MTProto / Zalo credentials.
 *
 * The AES-256-GCM key lives beside the payload in a separate file, so this is
 * tamper protection plus at-rest obfuscation, not a substitute for OS-level
 * disk encryption. The key file is created with owner-only permissions.
 */
export class SecretStore {
  private readonly keyPath: string;
  private readonly filePath: string;
  private key: Buffer | null = null;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.keyPath = path.join(dir, "secret.key");
    this.filePath = path.join(dir, "sessions.enc");
  }

  read<T extends object = Record<string, unknown>>(): T {
    try {
      if (!fs.existsSync(this.filePath)) return {} as T;
      const envelope = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Envelope;
      const decipher = createDecipheriv("aes-256-gcm", this.getKey(), Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString("utf8")) as T;
    } catch (error) {
      console.error("[secrets] cannot read sessions:", error);
      return {} as T;
    }
  }

  write(value: Record<string, unknown>): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const envelope: Envelope = {
      v: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(envelope), { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }

  clear(): void {
    if (fs.existsSync(this.filePath)) fs.rmSync(this.filePath, { force: true });
  }

  private getKey(): Buffer {
    if (this.key) return this.key;
    if (fs.existsSync(this.keyPath)) {
      this.key = fs.readFileSync(this.keyPath);
      return this.key;
    }
    const key = randomBytes(32);
    fs.writeFileSync(this.keyPath, key, { mode: 0o600 });
    this.key = key;
    return key;
  }
}

import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./types.ts";

/**
 * Public Telegram Desktop credentials are used as a convenience default so the
 * app works out of the box. Users can replace them with their own api_id /
 * api_hash from https://my.telegram.org in Settings.
 */
const DEFAULTS: AppConfig = {
  telegramApiId: 2040,
  telegramApiHash: "b18441a1ff607e10a989891a5462e627",
  vaultPeer: "me",
};

export class ConfigStore {
  private readonly filePath: string;
  private value: AppConfig;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "config.json");
    this.value = { ...DEFAULTS };
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<AppConfig>;
        this.value = { ...DEFAULTS, ...parsed };
      }
    } catch (error) {
      console.error("[config] cannot read config:", error);
    }
  }

  get(): AppConfig {
    return { ...this.value };
  }

  set(patch: Partial<AppConfig>): AppConfig {
    this.value = {
      ...this.value,
      ...patch,
      telegramApiId: Number(patch.telegramApiId ?? this.value.telegramApiId) || DEFAULTS.telegramApiId,
      telegramApiHash: String(patch.telegramApiHash ?? this.value.telegramApiHash).trim() || DEFAULTS.telegramApiHash,
      vaultPeer: String(patch.vaultPeer ?? this.value.vaultPeer).trim() || DEFAULTS.vaultPeer,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(this.value, null, 2), "utf8");
    return this.get();
  }
}

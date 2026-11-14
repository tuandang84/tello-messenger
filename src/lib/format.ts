export function formatTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if (timestamp >= startOfToday) return formatTime(timestamp);
  if (timestamp >= startOfYesterday) return "Hôm qua";
  if (now.getTime() - timestamp < 7 * 86_400_000) {
    return date.toLocaleDateString("vi-VN", { weekday: "short" });
  }
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  if (timestamp >= startOfToday) return "Hôm nay";
  if (timestamp >= startOfYesterday) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function initials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return "?";
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #2f7bff, #33b2ff)",
  "linear-gradient(135deg, #7c5cff, #b06cff)",
  "linear-gradient(135deg, #ff7a59, #ffb26b)",
  "linear-gradient(135deg, #16b98a, #59d9a8)",
  "linear-gradient(135deg, #f15f79, #ff9a8b)",
  "linear-gradient(135deg, #3d6fe0, #62d0ff)",
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function networkLabel(network: "telegram" | "zalo"): string {
  return network === "telegram" ? "Telegram" : "Zalo";
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

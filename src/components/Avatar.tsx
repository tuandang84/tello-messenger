import { avatarGradient, initials } from "../lib/format";
import type { Network } from "../lib/types";
import { TelegramIcon, ZaloIcon } from "./Icons";

interface AvatarProps {
  id: string;
  title: string;
  network: Network;
  size?: number;
  className?: string;
}

export function Avatar({ id, title, network, size = 48, className }: AvatarProps) {
  return (
    <div
      className={`avatar ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: avatarGradient(id + title),
        fontSize: Math.max(12, size * 0.34),
      }}
      aria-hidden="true"
    >
      <span>{initials(title)}</span>
      <span className={`avatar-badge ${network}`}>
        {network === "telegram" ? <TelegramIcon size={Math.max(9, size * 0.2)} /> : <ZaloIcon size={Math.max(9, size * 0.2)} />}
      </span>
    </div>
  );
}

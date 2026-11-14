import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.03a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function PaperclipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.96A6 6 0 0 0 6.2 9.5 4 4 0 0 0 7 19Z" />
      <path d="M12 12v6" />
      <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

export function TelegramIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.9 3.3c-.3-.25-.75-.3-1.15-.15L2.9 10.3c-.55.2-.9.7-.9 1.28 0 .57.34 1.08.88 1.3l4.2 1.66 1.56 5.2c.14.47.52.8 1 .86h.13c.42 0 .82-.2 1.07-.55l2.3-2.9 3.92 2.9c.3.22.66.33 1.02.33.18 0 .35-.03.52-.1.5-.18.86-.6.96-1.12l3.03-14.3c.08-.38-.04-.77-.33-1.03-.12-.1-.25-.18-.36-.23ZM9.6 14.03l-.5 2.6-.86-2.9 8.4-5.5-7.04 5.8Z" />
    </svg>
  );
}

export function ZaloIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.6C6.34 2.6 1.8 6.4 1.8 11.1c0 2.66 1.53 5.04 3.92 6.6-.18 1.3-.69 2.5-1.5 3.55-.25.32.03.78.42.68 1.95-.46 3.6-1.4 4.78-2.52.83.16 1.7.24 2.58.24 5.66 0 10.2-3.8 10.2-8.55S17.66 2.6 12 2.6Zm-5.1 11.2H4.6a.78.78 0 0 1-.78-.78V9.1a.78.78 0 0 1 1.56 0v3.14h1.52a.78.78 0 0 1 0 1.56Zm2.42 0a.78.78 0 0 1-1.56 0V9.1a.78.78 0 0 1 1.56 0v4.7Zm5.66 0a.78.78 0 0 1-1.37.5l-2.5-3.1v2.6a.78.78 0 0 1-1.56 0V9.1a.78.78 0 0 1 1.37-.5l2.5 3.1V9.1a.78.78 0 0 1 1.56 0v4.7Zm3.72 0a2.35 2.35 0 1 1 0-4.7 2.35 2.35 0 0 1 0 4.7Zm0-1.56a.79.79 0 1 0 0-1.58.79.79 0 0 0 0 1.58Z" />
    </svg>
  );
}

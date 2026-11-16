/** Состояние VPN-туннеля. */
export type TunnelState = "disconnected" | "connecting" | "connected" | "disconnecting";

export interface ServerNode {
  id: string;
  /** Название из подписки, может начинаться с эмодзи-флага. */
  name: string;
  protocol: string;
  /** Подпись транспорта: «VLESS Reality», «Hysteria2». */
  transport: string;
  /** null — не мерили, -1 — нет связи. */
  pingMs: number | null;
}

export interface Subscription {
  url: string;
  title: string;
  nodes: ServerNode[];
  usedBytes: number;
  /** 0 — безлимит. */
  totalBytes: number;
  expireAt: number | null;
  announce: string | null;
  supportUrl: string | null;
  webPageUrl: string | null;
}

export interface Settings {
  russianSitesDirect: boolean;
  tlsFragment: boolean;
  blockAds: boolean;
  ipv6: boolean;
  dnsServer: string;
}

export interface Snapshot {
  state: TunnelState;
  connectedAt: number | null;
  subscriptions: Subscription[];
  /** null — автовыбор по пингу. */
  selected: { subUrl: string; nodeId: string } | null;
  current: { sub: Subscription; node: ServerNode } | null;
  settings: Settings;
  /** Скорость, байт/с; null — платформа не умеет. */
  downSpeed: number | null;
  upSpeed: number | null;
  error: string | null;
  pinging: boolean;
}

/**
 * Всё, что интерфейс просит у «бэкенда»: ядра Xray и VPN-туннеля.
 * В приложении это вызовы Tauri, в браузере — DemoBackend с тестовыми данными.
 */
export interface Backend {
  subscribe(listener: (s: Snapshot) => void): () => void;
  snapshot(): Snapshot;
  toggle(): Promise<void>;
  select(target: { subUrl: string; nodeId: string } | null): Promise<void>;
  addSubscription(url: string): Promise<void>;
  refreshSubscriptions(): Promise<void>;
  removeSubscription(url: string): Promise<void>;
  pingAll(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  clearError(): void;
}

/** Состояние VPN-туннеля. */
export type TunnelState = "disconnected" | "connecting" | "connected" | "disconnecting";

export interface ServerNode {
  id: string;
  /** Название из подписки, может начинаться с эмодзи-флага. */
  name: string;
  /** Метки транспорта: протокол, защита, сеть — ["VLESS", "REALITY", "GRPC"]. */
  tags: string[];
  /** null — не мерили, -1 — нет связи. */
  pingMs: number | null;
}

export interface Subscription {
  url: string;
  title: string;
  /** Название тарифа, если панель его передаёт. */
  plan: string | null;
  nodes: ServerNode[];
  usedBytes: number;
  /** 0 — безлимит. */
  totalBytes: number;
  expireAt: number | null;
  announce: string | null;
  supportUrl: string | null;
  webPageUrl: string | null;
  updatedAt: number;
}

/** Расширенные настройки ядра Xray. */
export interface CoreSettings {
  /** Мягкий лимит памяти Go в МБ (важно для iOS: расширению дают ~50 МБ). */
  memoryLimitMb: number;
  /** Агрессивная сборка мусора, чтобы ядро не выгружала система. */
  noLimitMode: boolean;
  /** Через сколько секунд закрывать простаивающее соединение. */
  idleTimeoutSec: number;
  /** Определять сайты по содержимому трафика (sniffing). */
  sniffing: boolean;
  /** Использовать найденный домен только для маршрутов, не подменяя адрес. */
  routeOnly: boolean;
  /** MTU туннеля, 0 — автоматически. */
  mtu: number;
  logLevel: "none" | "error" | "warning" | "info" | "debug";
}

export interface Settings {
  russianSitesDirect: boolean;
  tlsFragment: boolean;
  blockAds: boolean;
  ipv6: boolean;
  dnsServer: string;
  core: CoreSettings;
}

export interface Snapshot {
  state: TunnelState;
  connectedAt: number | null;
  subscriptions: Subscription[];
  /** null — автовыбор по пингу. */
  selected: { subUrl: string; nodeId: string } | null;
  current: { sub: Subscription; node: ServerNode } | null;
  favorites: string[];
  settings: Settings;
  /** Скорость, байт/с, и итог за сеанс; null — платформа не умеет. */
  downSpeed: number | null;
  upSpeed: number | null;
  downTotal: number;
  upTotal: number;
  /** Последние значения скорости загрузки для графика. */
  speedHistory: number[];
  error: string | null;
  pinging: boolean;
  toast: string | null;
  version: { app: string; xray: string };
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
  toggleFavorite(nodeKey: string): void;
  addSubscription(url: string): Promise<void>;
  refreshSubscriptions(): Promise<void>;
  removeSubscription(url: string): Promise<void>;
  pingAll(): Promise<void>;
  updateSettings(patch: Partial<Omit<Settings, "core">>): Promise<void>;
  updateCore(patch: Partial<CoreSettings>): Promise<void>;
  resetSettings(): Promise<void>;
  clearError(): void;
}

export const nodeKey = (subUrl: string, nodeId: string) => `${subUrl}|${nodeId}`;

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
  /**
   * Разделитель из подписки, а не сервер: панели вставляют строки вроде
   * «⬇️ Обходы глушилок | LTE ⬇️», чтобы разбить список на разделы.
   */
  divider?: boolean;
  /** Пользователь скрыл сервер: в списке только по «Показать скрытые», в автовыбор не идёт. */
  hidden?: boolean;
  /** Название из подписки, если пользователь переименовал сервер. */
  originalName?: string;
}

/** Свои настройки провайдера: хранятся на устройстве и переживают обновление подписки. */
export interface SubPrefs {
  /** Своё название вместо названия из подписки; null — как у провайдера. */
  title: string | null;
  /** Список серверов всегда раскрыт. */
  keepOpen: boolean;
  /** Серверы провайдера участвуют в автовыборе. */
  autoSelect: boolean;
  /** Интервал обновления; "global" — как в общих настройках. */
  interval: UpdateInterval | "global";
  /** Свой DNS для серверов провайдера; пусто — общий. */
  dns: string;
  /** Свои названия серверов: id → название. */
  renames: Record<string, string>;
  /** Скрытые серверы (id). */
  hidden: string[];
}

export const defaultSubPrefs: SubPrefs = {
  title: null,
  keepOpen: false,
  autoSelect: true,
  interval: "global",
  dns: "",
  renames: {},
  hidden: [],
};

/** Порядок серверов внутри провайдера. */
export type ServerSort = "provider" | "ping" | "name";

export interface Subscription {
  url: string;
  /** Название для показа: своё, если задано, иначе из подписки. */
  title: string;
  /** Название из подписки. */
  providerTitle: string;
  prefs: SubPrefs;
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

export type ThemeId = "amber" | "aqua" | "gold" | "emerald" | "mono";
export type BackgroundKind = "blobs" | "horizon" | "stars" | "solid" | "image";

/** «Оформление»: тема, свой цвет, фон, режим, стекло, анимации. */
export interface Appearance {
  theme: ThemeId;
  /** Свой акцентный цвет (#RRGGBB) поверх темы; null — цвет темы. */
  accent: string | null;
  background: BackgroundKind;
  /** Своя картинка фона (data: URL). */
  backgroundImage: string | null;
  /** Яркость фона, 0–100. */
  backgroundDim: number;
  mode: "dark" | "light" | "system";
  /** Размытие стекла, px. */
  glassBlur: number;
  motion: boolean;
}

/**
 * tcp — время соединения с адресом сервера (без ядра);
 * head / get — реальная задержка: HTTP-запрос через сервер к проверочному адресу.
 * HEAD — только заголовки, GET — ответ целиком (до 64 КБ).
 */
export type PingMethod = "tcp" | "head" | "get";

export interface PingSettings {
  method: PingMethod;
  timeoutSec: number;
  /** Адрес для реальной задержки. */
  url: string;
  /** Мерить пинг выбранного провайдера при запуске. */
  onStart: boolean;
}

/** Часы между обновлениями подписок; "provider" — как просит провайдер (обычно 12 ч), "off" — только вручную. */
export type UpdateInterval = "provider" | "off" | 1 | 3 | 6 | 12 | 24;

export interface UpdateSettings {
  interval: UpdateInterval;
  onStart: boolean;
  /** Мерить пинг провайдера сразу после обновления его подписки. */
  pingAfter: boolean;
}

/** Системные уведомления: общий выключатель и по типам. */
export interface NotificationSettings {
  enabled: boolean;
  /** VPN отключился сам: обрыв, сервер не отвечает, систему выключила. */
  disconnect: boolean;
  /** Подписка заканчивается (за 3 дня, за день) и закончилась. */
  expiry: boolean;
  /** Израсходовано 90% трафика (если есть лимит). */
  traffic: boolean;
  /** Новое объявление провайдера. */
  announce: boolean;
}

/** Только компьютер. */
export interface DesktopSettings {
  /** Крестик прячет окно в трей, а не закрывает приложение. */
  closeToTray: boolean;
}

export interface DeviceInfo {
  hwid: string;
  os: string;
  osVersion: string;
  model: string;
}

export interface Settings {
  russianSitesDirect: boolean;
  tlsFragment: boolean;
  blockAds: boolean;
  ipv6: boolean;
  dnsServer: string;
  /** Отправлять провайдеру HWID и сведения об устройстве (лимит устройств в панели). */
  sendHwid: boolean;
  /** Подключаться сразу после запуска приложения. */
  autoConnect: boolean;
  /** Порядок серверов в списке. */
  serverSort: ServerSort;
  ping: PingSettings;
  updates: UpdateSettings;
  notifications: NotificationSettings;
  desktop: DesktopSettings;
  core: CoreSettings;
  appearance: Appearance;
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
  /** Подписка, у которой сейчас меряется пинг. */
  pingingSub: string | null;
  /** Подписка, которая сейчас обновляется; "*" — все. */
  refreshingSub: string | null;
  toast: ToastMessage | null;
  version: { app: string; xray: string };
  /** Запуск при входе в систему: null — недоступно (телефон, демо в браузере). */
  autostart: boolean | null;
  /** HWID и устройство — то, что уходит провайдеру; null — ещё не узнали. */
  device: DeviceInfo | null;
  /** Журнал: сеансы VPN и события, новые сверху. Хранится только на устройстве. */
  activity: ActivityEntry[];
}

/** Чем закончился сеанс: кнопкой, ошибкой или его выключила система. */
export type SessionEnd = "manual" | "error" | "system";

export type ActivityEntry =
  | {
      kind: "session";
      id: string;
      server: string;
      subscription: string;
      startedAt: number;
      /** null — сеанс идёт сейчас. */
      endedAt: number | null;
      down: number;
      up: number;
      end: SessionEnd | null;
      error?: string;
    }
  | { kind: "error"; id: string; at: number; server: string | null; text: string }
  | { kind: "subscription"; id: string; at: number; text: string };

/** Действие в уведомлении: вернуть удалённое или применить настройки сразу. */
export type ToastActionId = "undo" | "reconnect";

export interface ToastMessage {
  text: string;
  action?: { id: ToastActionId; label: string };
}

/**
 * Всё, что интерфейс просит у «бэкенда»: ядра Xray и VPN-туннеля.
 * В приложении это вызовы Tauri, в браузере — DemoBackend с тестовыми данными.
 */
export interface Backend {
  subscribe(listener: (s: Snapshot) => void): () => void;
  snapshot(): Snapshot;
  /** Подключить, отключить или отменить подключение, которое ещё идёт. */
  toggle(): Promise<void>;
  select(target: { subUrl: string; nodeId: string } | null): Promise<void>;
  toggleFavorite(nodeKey: string): void;
  addSubscription(url: string): Promise<void>;
  refreshSubscriptions(): Promise<void>;
  /** Обновить одну подписку. */
  refreshSubscription(url: string): Promise<void>;
  removeSubscription(url: string): Promise<void>;
  /** Пинг серверов одного провайдера; без адреса — того, чей сервер выбран. */
  ping(subUrl?: string): Promise<void>;
  /** Пинг одного сервера. */
  pingNode(subUrl: string, nodeId: string): Promise<void>;
  /** Свои настройки провайдера (название, DNS, интервал…). */
  updateSubPrefs(subUrl: string, patch: Partial<SubPrefs>): void;
  /** Своё название сервера; null — вернуть название из подписки. */
  renameNode(subUrl: string, nodeId: string, name: string | null): void;
  setNodeHidden(subUrl: string, nodeId: string, hidden: boolean): void;
  updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>): Promise<void>;
  updateCore(patch: Partial<CoreSettings>): Promise<void>;
  updateAppearance(patch: Partial<Appearance>): void;
  resetSettings(): Promise<void>;
  clearError(): void;
  /** Технические журналы на диске: app — приложение, core — ядро Xray. Пустая строка — журнала нет. */
  readLog(which: "app" | "core"): Promise<string>;
  /** Открыть папку журналов (компьютер); false — на этой платформе нельзя. */
  openLogsFolder(): Promise<boolean>;
  /** Пример уведомления — проверить, что система их показывает. */
  testNotification(): Promise<void>;
  /** Включить или выключить запуск при входе в систему (компьютер). */
  setAutostart(on: boolean): Promise<void>;
  updateDesktop(patch: Partial<DesktopSettings>): void;
  /** Очистить журнал активности (с возможностью вернуть). */
  clearActivity(): void;
  /** Кнопка в уведомлении: «Вернуть», «Переподключить». */
  toastAction(): void;
  dismissToast(): void;
}

export const nodeKey = (subUrl: string, nodeId: string) => `${subUrl}|${nodeId}`;

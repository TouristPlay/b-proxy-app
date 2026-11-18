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
  /** Мультиплексирование: несколько соединений в одном канале до сервера. */
  mux: boolean;
  /** Сколько соединений в одном канале Mux. */
  muxConcurrency: number;
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
  /** Язык интерфейса; "system" — как в системе. Смена перезагружает интерфейс. */
  language: "system" | "ru" | "en";
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

/** Сеть: локальная сеть, исключения, IPv6. */
export interface NetworkSettings {
  /** Адреса локальной сети (роутер, принтер, NAS) — напрямую, мимо VPN. */
  lanDirect: boolean;
  /** Свои исключения: домены и IP/подсети, которые идут напрямую. */
  exclusions: string[];
  /** При включённом IPv6 сначала пробовать IPv6. */
  preferIpv6: boolean;
}

/** VPN по приложениям (Android и компьютер; в iOS недоступно без MDM). */
export interface PerAppSettings {
  /** off — все через VPN; only — только выбранные; except — все, кроме выбранных. */
  mode: "off" | "only" | "except";
  /** Android — пакеты, компьютер — имена программ (firefox, Telegram). */
  apps: string[];
}

/** Приложение в списке выбора. */
export interface AppEntry {
  id: string;
  name: string;
  icon?: string;
  path?: string;
}

/** Локальный прокси (компьютер): SOCKS5 и HTTP для программ, которым не нужен весь VPN. */
export interface LocalProxySettings {
  enabled: boolean;
  /** Порт SOCKS5; HTTP — на следующем. */
  port: number;
  /** Слушать все адреса, а не только 127.0.0.1: прокси доступен другим устройствам в сети. */
  lan: boolean;
}

/**
 * Профиль маршрутизации в формате Happ/INCY (например, RoscomVPN): какие сайты и адреса
 * идут напрямую, через VPN или блокируются, плюс DNS и ссылки на базы geoip/geosite.
 */
export interface RoutingProfile {
  id: string;
  name: string;
  /** Откуда взят: ссылка, если профиль добавлен по https — по ней же обновляется. */
  source: string | null;
  directSites: string[];
  directIp: string[];
  proxySites: string[];
  proxyIp: string[];
  blockSites: string[];
  blockIp: string[];
  /** true — всё остальное через VPN, false — всё остальное напрямую. */
  globalProxy: boolean;
  /** Порядок групп правил: "block-proxy-direct" и т. п. */
  routeOrder: string;
  domainStrategy: string;
  /** DNS для сайтов через VPN и для сайтов напрямую (адрес или https://…/dns-query). */
  remoteDns: string;
  domesticDns: string;
  dnsHosts: Record<string, string>;
  geoipUrl: string;
  geositeUrl: string;
  addedAt: number;
}

export interface RoutingSettings {
  enabled: boolean;
  activeId: string | null;
  profiles: RoutingProfile[];
}

export type PendingLink = { kind: "subscription"; url: string } | { kind: "routing"; input: string; name: string };

/** Базы geoip.dat и geosite.dat на устройстве. */
export interface GeoState {
  files: { name: string; size: number; updatedAt: number }[];
  downloading: boolean;
}

/** Только компьютер. */
export interface DesktopSettings {
  /** Крестик прячет окно в трей, а не закрывает приложение. */
  closeToTray: boolean;
  /** Сам проверять новые версии B-Proxy (при запуске и раз в 12 часов). */
  autoUpdate: boolean;
}

/** Проверка скорости через выбранный сервер. */
export interface SpeedTest {
  phase: "latency" | "download" | "upload" | "done" | "error";
  latencyMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  /** 0…1 внутри этапа. */
  progress: number;
  /** Сервер, через который мерили. */
  server: string;
  error?: string;
  at?: number;
}

/** Обновление самого приложения (компьютер). */
export interface AppUpdate {
  state: "idle" | "checking" | "none" | "available" | "downloading" | "error";
  /** Новая версия, когда она есть. */
  version?: string;
  notes?: string;
  /** Загрузка, 0…1; null — размер неизвестен. */
  progress?: number | null;
  error?: string;
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
  /** DNS внутри туннеля: один или несколько адресов через запятую, можно DoH (https://…). */
  dnsServer: string;
  network: NetworkSettings;
  routing: RoutingSettings;
  localProxy: LocalProxySettings;
  /** Свой User-Agent для загрузки подписок; пусто — стандартный. */
  userAgent: string;
  /** Отправлять провайдеру HWID и сведения об устройстве (лимит устройств в панели). */
  sendHwid: boolean;
  /** Подключаться сразу после запуска приложения. */
  autoConnect: boolean;
  /**
   * Kill switch: при обрыве VPN интернет закрыт, пока туннель не поднимется или его не выключат.
   * Linux — nftables, macOS — pf, Windows — фильтры WFP, iOS — includeAllNetworks,
   * Android — туннель остаётся поднятым без ядра (плюс системная «Блокировать без VPN»).
   */
  killSwitch: boolean;
  /** VPN по приложениям. */
  perApp: PerAppSettings;
  /** iOS: «Живая активность» — статус VPN на экране блокировки и в Dynamic Island. */
  liveActivity: boolean;
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
  /** «Рекомендуемые VPN»: null — раздела нет (адрес списка не задан) или ещё не загружен. */
  catalog: import("./catalog").CatalogItem[] | null;
  /** Знакомство при первом запуске пройдено (или подписки уже есть). */
  onboarded: boolean;
  /** Последняя проверка скорости в этом сеансе; null — не проверяли. */
  speedTest: SpeedTest | null;
  /** Обновление приложения; null — платформа не умеет (телефон, демо без компьютера). */
  appUpdate: AppUpdate | null;
  /** Ссылка bproxy:// ждёт подтверждения: добавить подписку или профиль маршрутизации. */
  pendingLink: PendingLink | null;
  /** Базы geoip/geosite; null — платформа не умеет (демо). */
  geo: GeoState | null;
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
export type ToastActionId = "undo" | "reconnect" | "app-update";

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
  /** Пинг всех провайдеров по очереди (только при выключенном VPN). */
  pingAll(): Promise<void>;
  /** Пинг одного сервера. */
  pingNode(subUrl: string, nodeId: string): Promise<void>;
  /** Свои настройки провайдера (название, DNS, интервал…). */
  updateSubPrefs(subUrl: string, patch: Partial<SubPrefs>): void;
  /** Своё название сервера; null — вернуть название из подписки. */
  renameNode(subUrl: string, nodeId: string, name: string | null): void;
  setNodeHidden(subUrl: string, nodeId: string, hidden: boolean): void;
  /** Профиль маршрутизации: ссылка https, диплинк happ:// incy:// bproxy:// или JSON. */
  addRoutingProfile(input: string): Promise<void>;
  removeRoutingProfile(id: string): void;
  setRouting(patch: Partial<Pick<RoutingSettings, "enabled" | "activeId">>): void;
  /** Ссылка bproxy://… — из системы (нажали в браузере, боте) или вставлена вручную. */
  openLink(url: string): Promise<void>;
  /** Ответ на «Добавить подписку из ссылки?». */
  confirmLink(accept: boolean): Promise<void>;
  /** Скачать базы geoip/geosite активного профиля заново. */
  updateGeo(): Promise<void>;
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
  /** Разрешение системы на VPN (Android, iOS); на компьютере всегда true. */
  requestVpnPermission(): Promise<boolean>;
  /** Разрешение на уведомления. */
  requestNotifications(): Promise<boolean>;
  /** Загрузить «Рекомендуемые VPN» (кэш на 6 часов, force — заново). */
  loadCatalog(force?: boolean): Promise<void>;
  /** Приложения для выбора в «VPN по приложениям». */
  listApps(): Promise<AppEntry[]>;
  /** Android: системные настройки VPN (там «Блокировать соединения без VPN»). */
  openVpnSettings(): Promise<void>;
  /** Знакомство пройдено — больше не показывать. */
  finishOnboarding(): void;
  /** Проверить скорость через выбранный сервер (только при включённом VPN). */
  runSpeedTest(): Promise<void>;
  /** Проверить, вышла ли новая версия B-Proxy (компьютер). */
  checkAppUpdate(manual?: boolean): Promise<void>;
  /** Скачать и установить новую версию, затем перезапустить приложение. */
  installAppUpdate(): Promise<void>;
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

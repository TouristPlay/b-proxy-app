import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrent as getDeepLinks, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { cancel, isPermissionGranted, requestPermission, Schedule, sendNotification } from "@tauri-apps/plugin-notification";
import { defaultAppearance, defaultSettings } from "./demo";
import { checkUrl, mainOutbound, parseSubscription, type FetchResult, type NodeConfig, type Outbound, type StoredSubscription } from "./subscription";
import {
  type ActivityEntry,
  type DesktopSettings,
  type DeviceInfo,
  type SubPrefs,
  type GeoState,
  type Appearance,
  type Backend,
  type CoreSettings,
  type SessionEnd,
  type Settings,
  type Snapshot,
  nodeKey,
  type SpeedTest,
  type AppEntry,
  type Subscription,
  type TunnelState,
} from "./types";
import { plural, splitFlag } from "@/lib/format";
import { accentOf } from "@/lib/theme";
import { loadActivity, newId, saveActivity } from "./activity";
import { applyPrefs, mergePrefs, pickCurrent } from "./prefs";
import { parseLink } from "./links";
import { decodeProfile, needsGeo } from "./routing";
import { Toaster } from "./toaster";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isNewer } from "./version";
import { exclusionFor, parseAccessLog, siteOf } from "./connections";
import { inWindow } from "./schedule";
import { haptic, setHapticsEnabled } from "@/lib/haptics";
import { CRASH_DSN, setCrashReports } from "@/lib/crash";
import { CATALOG_URL, parseCatalog } from "./catalog";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { activeProfile, buildConfig, buildPingConfig, detectPlatform, isMobile } from "./xray";
import { t } from "@/lib/i18n";

// Настоящая версия приходит из сборки (getVersion в init) — версия из тега релиза.
let APP_VERSION = "0.2.4";
/** Remnawave отдаёт список серверов только приложениям; с этим заголовком приходят ссылки. */
const USER_AGENT = "v2rayNG/1.9.30";
/** libXray меряет не больше 5 серверов за вызов. */
const PING_BATCH = 5;
/** Настройки самого приложения: их смена не требует переподключения VPN. */
/** Флаг-эмодзи из начала названия сервера: «🇳🇱 Амстердам» → «🇳🇱». */
const flagOf = (name: string) => (splitFlag(name).code ? Array.from(name.trim()).slice(0, 2).join("") : "");

const APP_ONLY = new Set(["haptics", "schedule", "liveActivity", "autoConnect", "serverSort", "sendHwid", "updates", "ping", "notifications", "desktop", "crashReports"]);

const STATE_KEY = "b-proxy.state";
/** Какие уведомления о подписках уже показаны. */
const ALERTS_KEY = "b-proxy.alerts";
/** id уведомлений о сроке, которые B-Proxy поставил в расписание телефона. */
const PLANNED_KEY = "b-proxy.planned";

interface AlertMarks {
  expireAt?: number | null;
  /** Последний порог срока, о котором предупредили: 3, 1 или 0 дней. */
  expiry?: number;
  /** Телефон: пороги срока, поставленные в расписание системы, и когда они сработают. */
  planned?: Record<string, number>;
  traffic?: boolean;
  announce?: string;
}
const APPEARANCE_KEY = "b-proxy.appearance";
const ONBOARDED_KEY = "b-proxy.onboarded";
const RELEASES_API = "https://api.github.com/repos/TouristPlay/b-proxy-app/releases/latest";
const RELEASES_PAGE = "https://github.com/TouristPlay/b-proxy-app/releases/latest";
const CATALOG_KEY = "b-proxy.catalog";

function readCatalogCache() {
  if (!CATALOG_URL) return null;
  const cached = readJson<{ at: number; raw: string }>(CATALOG_KEY);
  return cached ? parseCatalog(cached.raw) : [];
}

interface Persisted {
  subscriptions: StoredSubscription[];
  selected: Snapshot["selected"];
  favorites: string[];
  settings: Omit<Settings, "appearance">;
}

interface CoreResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Понятный текст ошибки из того, что вернул Rust или нативный код. */
function message(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  // Неизвестный ответ: показываем, что пришло, и куда смотреть — пустая «что-то пошло не так» не помогает.
  try {
    const text = JSON.stringify(e);
    if (text && text !== "{}") return t("Неожиданный ответ приложения: {0}. Подробности — в «Технических журналах»", [text.slice(0, 160)]);
  } catch {
    // Не сериализуется — общий текст ниже.
  }
  return t("Неизвестная ошибка. Повторите действие, а если не поможет — отправьте «Технические журналы» в поддержку");
}

/**
 * Настоящий бэкенд в приложении Tauri: подписки, ядро Xray и VPN
 * через плагин bproxy (ui/src-tauri/plugins/bproxy).
 */
export class TauriBackend implements Backend {
  private listeners = new Set<(s: Snapshot) => void>();
  private toaster = new Toaster((toast) => this.emit({ toast }));
  private statsTimer: number | undefined;
  private platform = detectPlatform();
  private subs: StoredSubscription[];
  private s: Snapshot;
  /** Счётчики интерфейса при подключении и на прошлом шаге. */
  private base: { rx: number; tx: number } | null = null;
  private last: { rx: number; tx: number; at: number } | null = null;
  private busy = false;
  /** Пользователь отменил подключение, пока оно шло. */
  private cancelled = false;
  /** Запись текущего сеанса в журнале активности. */
  private sessionId: string | null = null;
  private lastSave = 0;
  /** Сколько секунд подряд нет счётчиков туннеля. */
  private missedStats = 0;
  /** Пути журналов на диске; null — плагин не ответил. */
  private logPaths: { dir: string; appLog: string; coreLog: string } | null = null;

  constructor() {
    const saved = readJson<Persisted>(STATE_KEY);
    const appearance = { ...defaultAppearance, ...(readJson<Partial<Appearance>>(APPEARANCE_KEY) ?? {}) };
    this.subs = saved?.subscriptions ?? [];
    this.s = {
      state: "disconnected",
      connectedAt: null,
      subscriptions: this.subs.map(publicSub),
      selected: saved?.selected ?? null,
      current: null,
      favorites: saved?.favorites ?? [],
      settings: {
        ...defaultSettings,
        ...(saved?.settings ?? {}),
        core: { ...defaultSettings.core, ...(saved?.settings?.core ?? {}) },
        ping: migratePing({ ...defaultSettings.ping, ...(saved?.settings?.ping ?? {}) }),
        updates: { ...defaultSettings.updates, ...(saved?.settings?.updates ?? {}) },
        serverSort: saved?.settings?.serverSort ?? defaultSettings.serverSort,
        notifications: { ...defaultSettings.notifications, ...(saved?.settings?.notifications ?? {}) },
        desktop: { ...defaultSettings.desktop, ...(saved?.settings?.desktop ?? {}) },
        network: { ...defaultSettings.network, ...(saved?.settings?.network ?? {}) },
        routing: { ...defaultSettings.routing, ...(saved?.settings?.routing ?? {}) },
        schedule: { ...defaultSettings.schedule, ...(saved?.settings?.schedule ?? {}) },
        localProxy: { ...defaultSettings.localProxy, ...(saved?.settings?.localProxy ?? {}) },
        appearance,
      },
      downSpeed: null,
      upSpeed: null,
      downTotal: 0,
      upTotal: 0,
      speedHistory: [],
      error: null,
      pinging: false,
      pingingSub: null,
      refreshingSub: null,
      toast: null,
      version: { app: APP_VERSION, xray: "—" },
      autostart: null,
      appUpdate: null,
      speedTest: null,
      catalog: readCatalogCache(),
      onboarded: localStorage.getItem(ONBOARDED_KEY) === "1" || this.subs.length > 0,
      device: null,
      geo: null,
      pendingLink: null,
      activity: loadActivity(),
    };
    this.recompute();
    void this.init();
  }

  /** Строка в logs/bproxy.log. Ошибки записи не мешают работе. */
  private writeLog(level: "info" | "warn" | "error", message: string) {
    void invoke("plugin:bproxy|log", { level, message }).catch(() => undefined);
  }

  async readLog(which: "app" | "core") {
    try {
      return await invoke<string>("plugin:bproxy|read_log", { which, maxBytes: 128 * 1024 });
    } catch {
      return "";
    }
  }

  async readConnections() {
    if (!this.s.settings.connectionLog) return [];
    try {
      return parseAccessLog(await invoke<string>("plugin:bproxy|read_access", { maxBytes: 512 * 1024 }));
    } catch (e) {
      this.logError(`Журнал соединений: ${message(e)}`);
      return [];
    }
  }

  async clearConnections() {
    await invoke("plugin:bproxy|read_access", { clear: true }).catch((e) => this.logError(message(e)));
  }

  async setDirect(host: string, direct: boolean) {
    const list = this.s.settings.network.exclusions;
    const found = exclusionFor(host, list);
    const site = siteOf(host);
    const exclusions = direct ? (found ? list : [...list, site]) : list.filter((x) => x !== found);
    if (exclusions === list) return;
    this.emit({ settings: { ...this.s.settings, network: { ...this.s.settings.network, exclusions } } });
    this.persist();
    this.toaster.show(direct ? t("{0} — напрямую", [site]) : t("{0} — снова через VPN", [found ?? site]), {
      id: "undo",
      label: t("Отменить"),
      run: () => void this.setDirect(host, !direct),
    });
    // Новые правила работают только в новом конфиге — переподключаемся сами.
    if (this.s.state === "connected") await this.reconnect();
  }

  async openLogsFolder() {
    if (isMobile(this.platform)) return false;
    try {
      await invoke("plugin:bproxy|open_logs_dir");
      return true;
    } catch {
      return false;
    }
  }

  private async init() {
    APP_VERSION = await getVersion().catch(() => APP_VERSION);
    if (!isMobile(this.platform)) {
      void listen<string>("tray-action", (e) => this.onTrayAction(e.payload));
      this.scheduleTray();
    } else {
      // Телефон сам не обновляется — только сообщаем о новой версии (через минуту и раз в 12 часов).
      this.emit({ appUpdate: { state: "idle" } });
      const auto = () => this.s.settings.desktop.autoUpdate !== false && void this.checkAppUpdate();
      window.setTimeout(auto, 60_000);
      window.setInterval(auto, 12 * 3600_000);
    }
    this.emit({ version: { ...this.s.version, app: APP_VERSION } });
    this.syncCrashReports();
    setHapticsEnabled(this.s.settings.haptics);
    this.logPaths = await invoke<{ dir: string; appLog: string; coreLog: string } | null>("plugin:bproxy|log_info").catch(() => null);
    const sub = this.subs.map((x) => `«${x.title}» (${x.nodes.filter((n) => !n.divider).length})`).join(", ");
    this.writeLog("info", `Интерфейс ${APP_VERSION}, ${this.platform}; подписки: ${sub || "нет"}`);
    void this.loadCatalog();
    // Состояние туннеля приходит из Rust (компьютеры) или из нативного кода (телефоны).
    const onState = (p: { state: string; error?: string | null }) => this.onTunnelState(p.state, p.error ?? null);
    if (isMobile(this.platform)) {
      await addPluginListener("bproxy", "state", onState).catch(() => undefined);
    } else {
      await listen<{ state: string; error: string | null }>("bproxy://state", (e) => onState(e.payload));
    }

    // HWID — показать в настройках и записать в журнал (для поддержки провайдера).
    const device = await invoke<DeviceInfo>("plugin:bproxy|device_info").catch((e) => {
      this.writeLog("warn", `HWID не определён: ${message(e)}`);
      return null;
    });
    if (device) {
      this.emit({ device });
      this.writeLog("info", `Устройство: ${device.os} ${device.osVersion}, ${device.model}, HWID ${device.hwid}`);
    }

    // «Живая активность» могла остаться от прошлого запуска — приводим к текущему состоянию.
    this.syncLiveActivity();

    // Ссылки bproxy://: та, с которой приложение запустили, и все следующие.
    void onOpenUrl((urls) => urls.forEach((u) => void this.openLink(u))).catch(() => undefined);
    void getDeepLinks()
      .then((urls) => urls?.forEach((u) => void this.openLink(u)))
      .catch(() => undefined);

    // Базы geoip/geosite: что уже скачано; у активного профиля — обновляем раз в неделю.
    await this.loadGeoInfo();
    const profile = activeProfile(this.s.settings);
    if (profile && this.s.geo) {
      const oldest = Math.min(...this.s.geo.files.map((f) => f.updatedAt), Date.now());
      const need = needsGeo(profile);
      const missing = (need.geoip && !this.geoFile("geoip.dat")) || (need.geosite && !this.geoFile("geosite.dat"));
      if (missing || Date.now() - oldest > 7 * 86_400_000) void this.updateGeo(true);
    }

    // Компьютер: крестик в трей (настройка) и состояние автозапуска из системы.
    if (!isMobile(this.platform)) {
      void invoke("set_close_to_tray", { enabled: this.s.settings.desktop.closeToTray }).catch(() => undefined);
      const auto = await invoke<boolean>("plugin:autostart|is_enabled").catch(() => null);
      this.emit({ autostart: auto, appUpdate: { state: "idle" } });
      // Новая версия приложения: через минуту после запуска (не мешать подключению) и раз в 12 часов.
      const auto12 = () => this.s.settings.desktop.autoUpdate && void this.checkAppUpdate();
      window.setTimeout(auto12, 60_000);
      window.setInterval(auto12, 12 * 3600_000);
    }

    // Туннель мог остаться включённым с прошлого запуска (телефон, «Постоянная VPN»).
    const stats = await this.stats();
    if (stats) {
      this.base = stats;
      this.emit({ state: "connected", connectedAt: Date.now(), downSpeed: 0, upSpeed: 0 });
      this.startStats();
      this.openSession();
    }

    try {
      const v = await this.core<{ version: string }>("xrayVersion");
      this.emit({ version: { app: APP_VERSION, xray: v.version.replace(/^v/, "") } });
    } catch {
      // Ядро не загрузилось — покажем ошибку при подключении.
    }

    // Подписки при запуске — по настройке «Обновлять при запуске», иначе только просроченные.
    const { updates, ping } = this.s.settings;
    if (updates.onStart && this.subs.length) await this.refreshSubscriptions(true);
    else await this.refreshDue();
    // Пинг выбранного провайдера: автовыбор берёт лучший сервер, а не первый в списке.
    if (ping.onStart && this.s.state === "disconnected" && this.subs.length) void this.ping(undefined, true);
    // Раз в 15 минут проверяем, не пора ли обновить какую-то подписку.
    window.setInterval(() => void this.refreshDue(), 15 * 60_000);

    // Расписание: раз в 20 секунд смотрим, не пересекли ли границу окна.
    window.setInterval(() => void this.checkSchedule(), 20_000);
    void this.checkSchedule();

    // «Подключаться при запуске»: после обновления и пинга, чтобы автовыбор взял лучший сервер.
    if (this.s.settings.autoConnect && this.s.state === "disconnected" && this.subs.length) {
      while (this.s.pinging) await new Promise((r) => setTimeout(r, 300));
      if (this.s.state === "disconnected") {
        this.writeLog("info", "Автоподключение при запуске");
        void this.toggle();
      }
    }
  }

  /** Было ли «сейчас по расписанию» при прошлой проверке (null — ещё не проверяли). */
  private scheduleInside: boolean | null = null;

  /**
   * Расписание действует только на границах окна, чтобы не спорить с ручным
   * включением и выключением. При запуске внутри окна — подключаемся.
   */
  private async checkSchedule() {
    const plan = this.s.settings.schedule;
    const inside = inWindow(plan);
    const before = this.scheduleInside;
    this.scheduleInside = inside;
    if (!plan.enabled || inside === before || this.busy) return;
    if (inside && this.s.state === "disconnected" && this.s.current) {
      this.writeLog("info", "Подключение по расписанию");
      await this.toggle();
      if ((this.s.state as string) === "connected") this.toaster.show(t("VPN включён по расписанию"));
    } else if (!inside && before !== null && this.s.state === "connected") {
      this.writeLog("info", "Отключение по расписанию");
      await this.toggle();
      this.toaster.show(t("VPN выключен по расписанию"));
    }
  }

  // ---------- Хранилище и снимок ----------

  subscribe(listener: (s: Snapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot() {
    return this.s;
  }

  private emit(patch: Partial<Snapshot> = {}) {
    const before = this.s.state;
    const errorBefore = this.s.error;
    this.s = { ...this.s, ...patch };
    if (patch.state && patch.state !== before) {
      this.syncLiveActivity();
      // Отклик на смену состояния: подключились — «успех», отключились — мягкий щелчок.
      if (patch.state === "connected") haptic("success");
      else if (patch.state === "disconnected" && before === "connected") haptic("toggle-off");
    }
    if (patch.error && patch.error !== errorBefore) haptic("error");
    this.recompute();
    this.syncWidget();
    for (const l of this.listeners) l(this.s);
    if ("state" in patch || "subscriptions" in patch || "selected" in patch || "favorites" in patch || "current" in patch) this.scheduleTray();
  }

  // ---------- Меню в трее (компьютер) ----------

  private trayServers: { subUrl: string; nodeId: string }[] = [];
  private trayTimer: number | null = null;
  private trayKey = "";

  private scheduleTray() {
    if (isMobile(this.platform) || this.trayTimer != null) return;
    this.trayTimer = window.setTimeout(() => {
      this.trayTimer = null;
      void this.updateTray();
    }, 150);
  }

  private async updateTray() {
    const s = this.s;
    const node = s.current?.node;
    const name = (n: string) => n.replace(/^\p{RI}{2}\s*/u, "");
    const on = s.state === "connected";
    const busy = s.state === "connecting" || s.state === "disconnecting";
    const status =
      s.state === "connected"
        ? t("Подключено · {0}", [name(node?.name ?? "")])
        : s.state === "connecting"
          ? t("Подключаемся…")
          : s.state === "disconnecting"
            ? t("Отключаемся…")
            : t("Не подключено");
    // В меню — избранные серверы, а без них — серверы текущего провайдера (до 15).
    const all = s.subscriptions.flatMap((sub) => sub.nodes.filter((n) => !n.divider && !n.hidden).map((n) => ({ sub, n })));
    const favs = all.filter(({ sub, n }) => s.favorites.includes(nodeKey(sub.url, n.id)));
    const currentSub = s.current?.sub.url ?? s.subscriptions[0]?.url;
    const list = (favs.length ? favs : all.filter(({ sub }) => sub.url === currentSub)).slice(0, 15);
    this.trayServers = list.map(({ sub, n }) => ({ subUrl: sub.url, nodeId: n.id }));
    const model = {
      status,
      connected: on,
      toggle: on || busy ? t("Отключить") : t("Подключить"),
      tooltip: `B-Proxy — ${status}`,
      serversTitle: favs.length ? t("Избранные серверы") : t("Серверы"),
      auto: list.length ? { label: t("Автовыбор по пингу"), checked: s.selected === null } : null,
      servers: list.map(({ sub, n }) => ({
        label: n.pingMs ? `${n.name}  ·  ${n.pingMs} ${t("мс")}` : n.name,
        checked: s.selected !== null && s.current?.sub.url === sub.url && s.current.node.id === n.id,
      })),
      ping: t("Проверить пинг"),
      refresh: t("Обновить подписки"),
      open: t("Открыть B-Proxy"),
      quit: t("Выйти"),
    };
    const key = JSON.stringify(model);
    if (key === this.trayKey) return;
    this.trayKey = key;
    await invoke("update_tray", { model }).catch(() => {});
  }

  private onTrayAction(id: string) {
    if (id === "toggle") void this.toggle();
    else if (id === "ping") void this.pingAll();
    else if (id === "refresh") void this.refreshSubscriptions();
    else if (id === "auto") void this.select(null);
    else if (id.startsWith("server:")) {
      const target = this.trayServers[Number(id.slice(7))];
      if (target) void this.select(target);
    }
    // Флажки в меню система переключает сама — возвращаем их к настоящему состоянию.
    this.trayKey = "";
    this.scheduleTray();
  }

  private persist() {
    const { appearance: _ignored, ...settings } = this.s.settings;
    const data: Persisted = {
      subscriptions: this.subs,
      selected: this.s.selected,
      favorites: this.s.favorites,
      settings,
    };
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(data));
    } catch {
      // Не сохранилось — действует до перезапуска.
    }
  }

  private setSubs(subs: StoredSubscription[]) {
    this.subs = subs;
    this.emit({ subscriptions: subs.map(publicSub) });
    this.persist();
    this.checkAlerts();
  }

  // ---------- Уведомления ----------

  /** Системное уведомление, если включено в «Уведомлениях» и система разрешила. */
  private async notify(kind: Exclude<keyof Settings["notifications"], "enabled"> | "test", title: string, body: string) {
    const n = this.s.settings.notifications;
    if (kind !== "test" && (!n.enabled || !n[kind])) return;
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) {
        if (kind === "test") this.emit({ error: t("Система не разрешила уведомления. Включите их для B-Proxy в настройках системы") });
        return;
      }
      sendNotification({ title, body });
      this.writeLog("info", `Уведомление: ${title}`);
    } catch (e) {
      this.writeLog("warn", `Уведомление не показано: ${message(e)}`);
    }
  }

  async setAutostart(on: boolean) {
    try {
      await invoke(on ? "plugin:autostart|enable" : "plugin:autostart|disable");
      this.emit({ autostart: await invoke<boolean>("plugin:autostart|is_enabled") });
      this.writeLog("info", `Автозапуск ${on ? "включён" : "выключен"}`);
    } catch (e) {
      this.writeLog("warn", `Автозапуск: ${String(e)}`);
      this.toast(t("Не удалось изменить автозапуск — подробности в журнале"));
    }
  }

  updateDesktop(patch: Partial<DesktopSettings>) {
    const desktop = { ...this.s.settings.desktop, ...patch };
    this.emit({ settings: { ...this.s.settings, desktop } });
    this.persist();
    void invoke("set_close_to_tray", { enabled: desktop.closeToTray }).catch(() => undefined);
  }

  // ---------- Отчёты о сбоях ----------

  private syncCrashReports() {
    const on = !!CRASH_DSN && this.s.settings.crashReports !== false;
    void setCrashReports(on, APP_VERSION, this.platform);
    // Паники Rust: оболочка отправляет их, только если пользователь согласен.
    void invoke("set_crash_reports", { enabled: on }).catch(() => {});
  }

  // ---------- Первый запуск ----------

  async requestVpnPermission() {
    if (!isMobile(this.platform)) return true;
    try {
      return (await invoke<{ granted: boolean }>("plugin:bproxy|prepare")).granted;
    } catch (e) {
      this.writeLog("warn", `Разрешение на VPN: ${message(e)}`);
      return false;
    }
  }

  async requestNotifications() {
    return this.ensureNotifyPermission(true);
  }

  async loadCatalog(force = false) {
    if (!CATALOG_URL) return;
    const cached = readJson<{ at: number; raw: string }>(CATALOG_KEY);
    if (!force && cached && Date.now() - cached.at < 6 * 3600_000) return;
    try {
      // Без HWID и данных устройства: это просто список, не подписка.
      const res = await invoke<FetchResult>("plugin:bproxy|fetch_subscription", { url: CATALOG_URL, userAgent: "B-Proxy", hwid: false });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), raw: res.body }));
      this.emit({ catalog: parseCatalog(res.body) });
    } catch (e) {
      this.writeLog("warn", `Рекомендуемые VPN: ${message(e)}`);
    }
  }

  async listApps() {
    return invoke<AppEntry[]>("plugin:bproxy|list_apps");
  }

  async openVpnSettings() {
    try {
      await invoke("plugin:bproxy|open_vpn_settings");
    } catch (e) {
      this.toast(t("Не удалось открыть настройки VPN: {0}", [message(e)]));
    }
  }

  finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    this.emit({ onboarded: true });
  }

  // ---------- Проверка скорости ----------

  private probePort: number | null = null;

  async runSpeedTest() {
    const st = this.s.speedTest;
    if (st && st.phase !== "done" && st.phase !== "error") return;
    const server = this.s.current?.node.name ?? "";
    if (this.s.state !== "connected" || !this.probePort) {
      this.emit({ speedTest: { phase: "error", latencyMs: null, downloadMbps: null, uploadMbps: null, progress: 0, server, error: t("Подключитесь, чтобы проверить скорость сервера") } });
      return;
    }
    const base = { latencyMs: null, downloadMbps: null, uploadMbps: null, progress: 0, server };
    this.emit({ speedTest: { phase: "latency", ...base } });
    type P = { phase: SpeedTest["phase"]; latencyMs: number | null; downloadMbps: number | null; uploadMbps: number | null; progress: number };
    const unlisten = await listen<P>("bproxy://speed", (e) => this.emit({ speedTest: { ...e.payload, server } }));
    try {
      const r = await invoke<P>("plugin:bproxy|speed_test", { port: this.probePort });
      this.emit({ speedTest: { ...r, phase: "done", server, at: Date.now() } });
      this.writeLog("info", `Скорость через ${server}: ${r.latencyMs ?? "—"} мс, ↓ ${r.downloadMbps ?? "—"} ↑ ${r.uploadMbps ?? "—"} Мбит/с`);
    } catch (e) {
      this.emit({ speedTest: { ...(this.s.speedTest ?? base), phase: "error", server, error: t("Не удалось проверить скорость: {0}", [message(e)]) } });
    } finally {
      unlisten();
    }
  }

  // ---------- Обновление приложения (компьютер) ----------

  private update: Update | null = null;

  async checkAppUpdate(manual = false) {
    if (this.s.appUpdate?.state === "checking" || this.s.appUpdate?.state === "downloading") return;
    if (isMobile(this.platform)) return this.checkMobileRelease(manual);
    this.emit({ appUpdate: { state: "checking" } });
    try {
      const update = await check({ timeout: 30_000 });
      this.update = update;
      if (!update) {
        this.emit({ appUpdate: { state: "none" } });
        if (manual) this.toast(t("У вас последняя версия B-Proxy"));
        return;
      }
      this.writeLog("info", `Доступна версия ${update.version} (сейчас ${update.currentVersion})`);
      this.emit({ appUpdate: { state: "available", version: update.version, notes: update.body ?? undefined } });
      this.toaster.show(t("Вышла версия B-Proxy {0}", [update.version]), {
        id: "app-update",
        label: t("Обновить"),
        run: () => void this.installAppUpdate(),
      });
    } catch (e) {
      // Релиза с файлом обновления ещё нет (404) — это «обновлений нет», а не ошибка сети.
      if (/404|not found|valid release json/i.test(message(e))) {
        this.emit({ appUpdate: { state: "none" } });
        if (manual) this.toast(t("У вас последняя версия B-Proxy"));
        return;
      }
      this.writeLog("warn", `Проверка обновлений: ${message(e)}`);
      this.emit({ appUpdate: { state: "error", error: t("Не удалось проверить обновления — проверьте интернет") } });
      if (manual) this.toast(t("Не удалось проверить обновления — проверьте интернет"));
    }
  }

  /** Телефон: последний релиз на GitHub; новее нашей версии — показываем, где скачать. */
  private async checkMobileRelease(manual: boolean) {
    this.emit({ appUpdate: { state: "checking" } });
    try {
      const res = await invoke<FetchResult>("plugin:bproxy|fetch_subscription", { url: RELEASES_API, userAgent: "B-Proxy", hwid: false });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      const rel = JSON.parse(res.body) as { tag_name?: string; html_url?: string; body?: string };
      const version = (rel.tag_name ?? "").replace(/^v/, "");
      if (!version || !isNewer(version, APP_VERSION)) {
        this.emit({ appUpdate: { state: "none" } });
        if (manual) this.toast(t("У вас последняя версия B-Proxy"));
        return;
      }
      const url = rel.html_url?.startsWith("https://") ? rel.html_url : RELEASES_PAGE;
      this.emit({ appUpdate: { state: "available", version, url } });
      this.toaster.show(t("Вышла версия B-Proxy {0}", [version]), { id: "app-update", label: t("Скачать"), run: () => void this.installAppUpdate() });
    } catch (e) {
      this.writeLog("warn", `Проверка новой версии: ${message(e)}`);
      this.emit({ appUpdate: { state: "error", error: t("Не удалось проверить обновления — проверьте интернет") } });
      if (manual) this.toast(t("Не удалось проверить обновления — проверьте интернет"));
    }
  }

  async installAppUpdate() {
    if (isMobile(this.platform)) {
      await openUrl(this.s.appUpdate?.url ?? RELEASES_PAGE).catch((e) => this.toast(message(e)));
      return;
    }
    const update = this.update;
    if (!update || this.s.appUpdate?.state === "downloading") return;
    const version = update.version;
    let total = 0;
    let done = 0;
    this.emit({ appUpdate: { state: "downloading", version, progress: null } });
    try {
      // Установщик заменит ядро — сначала выключаем VPN.
      if (this.s.state !== "disconnected") await this.disconnect();
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          this.emit({ appUpdate: { state: "downloading", version, progress: total ? Math.min(1, done / total) : null } });
        }
      });
      this.writeLog("info", `Установлена версия ${version}, перезапуск`);
      await relaunch();
    } catch (e) {
      this.writeLog("error", `Обновление до ${version}: ${message(e)}`);
      this.emit({ appUpdate: { state: "available", version, error: t("Не удалось установить обновление — подробности в журнале") } });
      this.toast(t("Не удалось установить обновление — подробности в журнале"));
    }
  }

  async testNotification() {
    await this.notify("test", "B-Proxy", t("Уведомления работают: так придёт сообщение, если VPN отключится или подписка закончится"));
  }

  /**
   * Срок, трафик и объявления подписок. Каждое уведомление — один раз: что уже показали,
   * помним в localStorage (по подписке). Новое объявление при первом знакомстве не шлём.
   */
  private checkAlerts() {
    const marks = readJson<Record<string, AlertMarks>>(ALERTS_KEY) ?? {};
    for (const sub of this.subs) {
      const m: AlertMarks = marks[sub.url] ?? {};
      // Продлили подписку — срок другой, предупреждения о нём снова актуальны.
      if (m.expireAt !== sub.expireAt) {
        m.expireAt = sub.expireAt;
        m.expiry = undefined;
        m.planned = undefined;
      }
      // Запланированное уведомление уже сработало без нас — второй раз не повторяем.
      for (const [level, at] of Object.entries(m.planned ?? {})) {
        if (at <= Date.now()) m.expiry = Math.min(m.expiry ?? 99, Number(level));
      }
      const days = sub.expireAt ? Math.ceil((sub.expireAt - Date.now()) / 86_400_000) : null;
      if (days != null && days <= 3) {
        const level = days <= 0 ? 0 : days <= 1 ? 1 : 3;
        if (m.expiry == null || level < m.expiry) {
          m.expiry = level;
          void this.notify(
            "expiry",
            level === 0 ? t("Подписка «{0}» закончилась", [sub.title]) : t("Подписка «{0}» заканчивается", [sub.title]),
            level === 0
              ? t("Серверы перестанут работать. Продлите подписку у провайдера")
              : t("Осталось {0} {1}. Продлите, чтобы VPN не отключился", [days, plural(days, t("день"), t("дня"), t("дней"))]),
          );
        }
      }
      if (sub.totalBytes > 0) {
        const used = sub.usedBytes / sub.totalBytes;
        if (used >= 0.9 && !m.traffic) {
          m.traffic = true;
          void this.notify("traffic", t("Трафик «{0}» почти закончился", [sub.title]), t("Израсходовано {0}% от лимита", [Math.round(used * 100)]));
        } else if (used < 0.5) m.traffic = false;
      }
      const announce = sub.announce ?? "";
      if (m.announce !== undefined && announce && announce !== m.announce) {
        void this.notify("announce", sub.title, announce.length > 180 ? `${announce.slice(0, 177)}…` : announce);
      }
      m.announce = announce;
      marks[sub.url] = m;
    }
    if (isMobile(this.platform)) void this.planExpiry(marks);
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(marks));
    } catch {
      // Хранилище недоступно — в худшем случае уведомление придёт ещё раз.
    }
  }

  /**
   * Телефон: напоминания о сроке ставим в расписание системы (за 3 дня, за день, в день окончания,
   * в 12:00). Их покажет сама система, даже если приложение выгружено. Прежнее расписание
   * B-Proxy снимаем и ставим заново: срок могли продлить, а уведомления — выключить.
   */
  private async planExpiry(marks: Record<string, AlertMarks>) {
    const n = this.s.settings.notifications;
    const ids = readJson<number[]>(PLANNED_KEY) ?? [];
    try {
      if (ids.length) await cancel(ids);
    } catch {
      // Нечего снимать.
    }
    const next: number[] = [];
    if (n.enabled && n.expiry && (await this.ensureNotifyPermission(false))) {
      this.subs.forEach((sub, i) => {
        const m = marks[sub.url];
        if (!sub.expireAt || !m) return;
        m.planned = {};
        for (const level of [3, 1, 0]) {
          // Уже предупредили об этом пороге (или более позднем) — не повторяем.
          if (m.expiry != null && m.expiry <= level) continue;
          const at = new Date(sub.expireAt - level * 86_400_000);
          at.setHours(12, 0, 0, 0);
          if (at.getTime() <= Date.now() + 60_000) continue;
          const id = 7000 + i * 10 + level;
          sendNotification({
            id,
            title: level === 0 ? t("Подписка «{0}» закончилась", [sub.title]) : t("Подписка «{0}» заканчивается", [sub.title]),
            body:
              level === 0
                ? t("Серверы перестанут работать. Продлите подписку у провайдера")
                : t("Осталось {0} {1}. Продлите, чтобы VPN не отключился", [level, plural(level, t("день"), t("дня"), t("дней"))]),
            schedule: Schedule.at(at, false, true),
          });
          m.planned[level] = at.getTime();
          next.push(id);
        }
      });
    }
    try {
      localStorage.setItem(PLANNED_KEY, JSON.stringify(next));
      localStorage.setItem(ALERTS_KEY, JSON.stringify(marks));
    } catch {
      // Не сохранилось — при следующем запуске расписание просто поставится заново.
    }
  }

  /** Разрешение на уведомления; ask=false — только проверить, не спрашивая. */
  private async ensureNotifyPermission(ask = true) {
    try {
      if (await isPermissionGranted()) return true;
      return ask ? (await requestPermission()) === "granted" : false;
    } catch {
      return false;
    }
  }

  private toast(text: string) {
    this.toaster.show(text);
  }

  toastAction() {
    this.toaster.act();
  }

  dismissToast() {
    this.toaster.dismiss();
  }

  private recompute() {
    this.s = { ...this.s, current: pickCurrent(this.s.subscriptions, this.s.selected) };
  }


  // ---------- Ядро ----------

  private async core<T>(method: string, payload?: unknown): Promise<T> {
    const request = JSON.stringify({ apiVersion: 3, method, ...(payload ? { payload } : {}) });
    const raw = await invoke<string>("plugin:bproxy|invoke_core", { request });
    const res = JSON.parse(raw) as CoreResponse<T>;
    if (!res.success) throw new Error(res.error || t("Ошибка ядра Xray"));
    return res.data;
  }

  private async convertLinks(text: string): Promise<Outbound[]> {
    const data = await this.core<{ outbounds?: Outbound[] }>("convertShareLinksToXrayJson", { text });
    return data.outbounds ?? [];
  }

  private async stats(): Promise<{ rx: number; tx: number } | null> {
    try {
      return await invoke<{ rx: number; tx: number } | null>("plugin:bproxy|stats");
    } catch {
      return null;
    }
  }

  // ---------- Журнал активности ----------

  private setActivity(list: ActivityEntry[], persist = true) {
    this.emit({ activity: list });
    if (persist) {
      saveActivity(list);
      this.lastSave = Date.now();
    }
  }

  private log(entry: ActivityEntry) {
    this.setActivity([entry, ...this.s.activity]);
  }

  private logError(text: string) {
    // Ссылка на подписку — это ключ доступа: в журнал (и в отчёт для поддержки) она не попадает.
    const clean = text.replace(/[a-z0-9+]+:\/\/\S+/gi, t("‹ссылка›"));
    this.writeLog("error", clean);
    this.log({ kind: "error", id: newId(), at: Date.now(), server: this.s.current?.node.name ?? null, text: clean });
  }

  private openSession() {
    const cur = this.s.current;
    if (!cur || this.sessionId) return;
    this.sessionId = newId();
    this.log({
      kind: "session",
      id: this.sessionId,
      server: cur.node.name,
      subscription: cur.sub.title,
      startedAt: Date.now(),
      endedAt: null,
      down: 0,
      up: 0,
      end: null,
    });
  }

  private patchSession(patch: Partial<Extract<ActivityEntry, { kind: "session" }>>, persist: boolean) {
    const id = this.sessionId;
    if (!id) return;
    this.setActivity(
      this.s.activity.map((e) => (e.kind === "session" && e.id === id ? { ...e, ...patch } : e)),
      persist,
    );
  }

  private closeSession(end: SessionEnd, error?: string) {
    if (!this.sessionId) return;
    this.patchSession({ endedAt: Date.now(), end, error, down: this.s.downTotal, up: this.s.upTotal }, true);
    this.sessionId = null;
  }

  clearActivity() {
    const before = this.s.activity;
    // Идущий сеанс оставляем: он ещё допишется.
    this.setActivity(before.filter((e) => e.kind === "session" && e.id === this.sessionId));
    this.toaster.show(t("Журнал очищен"), { id: "undo", label: t("Вернуть"), run: () => this.setActivity(before) });
  }

  // ---------- VPN ----------

  async toggle() {
    haptic(this.s.state === "disconnected" ? "heavy" : "tap");
    const state = this.s.state;
    // Подключение идёт (например, система ждёт пароль) — повторное нажатие его отменяет.
    if (state === "connecting") {
      await this.cancelConnect();
      return;
    }
    if (this.busy) return;
    if (state === "connected") {
      await this.disconnect();
      return;
    }
    await this.connect();
  }

  private async cancelConnect() {
    this.cancelled = true;
    this.writeLog("info", "Подключение отменено пользователем");
    this.emit({ state: "disconnecting" });
    await invoke("plugin:bproxy|stop").catch(() => undefined);
    this.stopStats();
    this.emit({ state: "disconnected", connectedAt: null, downSpeed: null, upSpeed: null, error: null });
  }

  /** Переподключение с новыми настройками или на другой сервер. */
  private async reconnect() {
    if (this.busy) return;
    if (this.s.state === "connected") await this.disconnect();
    await this.connect();
  }

  /** Настройки меняются при включённом VPN — предлагаем применить сразу. */
  private offerReconnect() {
    if (this.s.state !== "connected") return;
    this.toaster.show(t("Изменения вступят в силу после переподключения"), {
      id: "reconnect",
      label: t("Переподключить"),
      run: () => void this.reconnect(),
    });
  }

  private async connect() {
    if (!this.s.current) {
      this.emit({ error: t("Сначала добавьте подписку") });
      return;
    }
    this.busy = true;
    this.cancelled = false;
    this.emit({ state: "connecting", error: null });
    try {
      // Автовыбор без замеров: сначала находим самый быстрый сервер.
      if (!this.s.selected && !this.hasPings()) await this.ping(undefined, true);

      const target = this.s.current;
      if (!target) throw new Error(t("Сначала добавьте подписку"));
      const stored = this.subs.find((x) => x.url === target.sub.url);
      const node = stored?.outbounds[target.node.id];
      if (!stored || !node) throw new Error(t("Сервер не найден. Обновите подписку"));

      const permission = await invoke<{ granted: boolean }>("plugin:bproxy|prepare");
      if (!permission.granted) throw new Error(t("Разрешите B-Proxy создать VPN, чтобы подключиться"));

      const coreLog = this.platform === "ios" ? null : (this.logPaths?.coreLog ?? null);
      // Профиль маршрутизации с geosite/geoip не запустится без баз — докачиваем перед подключением.
      const profile = activeProfile(this.s.settings);
      if (profile) {
        const need = needsGeo(profile);
        if ((need.geoip && !this.geoFile("geoip.dat")) || (need.geosite && !this.geoFile("geosite.dat"))) await this.updateGeo(true);
        if ((need.geoip && !this.geoFile("geoip.dat")) || (need.geosite && !this.geoFile("geosite.dat"))) {
          throw new Error(t("Для профиля «{0}» нужны базы geoip и geosite, а скачать их не получилось. Проверьте интернет или выключите профиль в «Маршрутах и DNS»", [profile.name]));
        }
      }
      // Свой DNS провайдера (если задан) вместо общего.
      const set = { ...this.s.settings, dnsServer: stored.prefs?.dns?.trim() || this.s.settings.dnsServer };
      // Служебный вход для проверки скорости — свой порт на каждое подключение.
      this.probePort = 20000 + Math.floor(Math.random() * 40000);
      const accessFile = set.connectionLog
        ? await invoke<string | null>("plugin:bproxy|access_log_path").catch(() => null)
        : null;
      let config = buildConfig(node, set, this.platform, stored.fragment, coreLog, this.geoDir, this.probePort, accessFile);
      // Телефон: название сервера — для уведомления службы VPN и плитки в шторке.
      if (isMobile(this.platform)) {
        const cfg = JSON.parse(config) as { env?: Record<string, string> };
        cfg.env = { ...cfg.env, BPROXY_SERVER_NAME: target.node.name.replace(/^\p{RI}{2}\s*/u, "") };
        config = JSON.stringify(cfg);
      }
      this.writeLog(
        "info",
        `Подключение: ${target.node.name} [${target.node.tags.join("/")}], ` +
          `маршруты: РФ напрямую=${set.russianSitesDirect}, DPI=${set.tlsFragment || stored.fragment != null}, ` +
          `реклама=${set.blockAds}, IPv6=${set.ipv6}, DNS ${set.dnsServer}; ядро: память ${set.core.memoryLimitMb} МБ, ` +
          `MTU ${set.core.mtu || 1500}, Mux ${set.core.mux ? set.core.muxConcurrency : "нет"}, журнал ${set.core.logLevel}` +
          (profile ? `; профиль маршрутизации «${profile.name}»` : ""),
      );
      if (this.cancelled) return;
      const n = this.s.settings.notifications;
      const notifyDisconnect = isMobile(this.platform) && n.enabled && n.disconnect;
      // Служба VPN шлёт уведомление сама, поэтому разрешение спрашиваем заранее, при подключении.
      if (notifyDisconnect) await this.ensureNotifyPermission();
      await invoke("plugin:bproxy|start", { config, notifyDisconnect, killSwitch: this.s.settings.killSwitch });
      if (this.cancelled) {
        // Отменили, пока ядро запускалось: гасим то, что успело подняться.
        await invoke("plugin:bproxy|stop").catch(() => undefined);
        return;
      }
      this.onConnected();
    } catch (e) {
      if (this.cancelled) return;
      this.stopStats();
      this.emit({ state: "disconnected", connectedAt: null, error: message(e) });
      this.logError(message(e));
    } finally {
      this.busy = false;
    }
  }

  private async disconnect() {
    this.busy = true;
    this.emit({ state: "disconnecting" });
    try {
      await invoke("plugin:bproxy|stop");
    } catch (e) {
      this.emit({ error: message(e) });
    } finally {
      this.closeSession("manual");
      this.stopStats();
      this.emit({ state: "disconnected", connectedAt: null, downSpeed: null, upSpeed: null });
      this.busy = false;
    }
  }

  private onConnected() {
    if (this.s.state === "connected" && this.statsTimer) return;
    this.emit({
      state: "connected",
      connectedAt: Date.now(),
      downSpeed: 0,
      upSpeed: 0,
      downTotal: 0,
      upTotal: 0,
      speedHistory: [],
    });
    this.base = null;
    this.last = null;
    this.startStats();
    this.openSession();
    this.writeLog("info", `Подключено: ${this.s.current?.node.name ?? "?"}`);
  }

  private onTunnelState(state: string, error: string | null) {
    if (this.busy) return; // ход подключения ведёт connect()/disconnect()
    this.writeLog(error ? "error" : "info", `Состояние туннеля от системы: ${state}${error ? ` (${error})` : ""}`);
    if (state === "connected") this.onConnected();
    else if (state === "disconnected" && this.s.state !== "disconnected") {
      // Туннель выключила система или кнопка в уведомлении.
      const server = this.s.current?.node.name;
      // На телефоне об обрыве сообщает сама служба VPN (работает и при закрытом приложении).
      if (!isMobile(this.platform)) void this.notify(
        "disconnect",
        t("VPN отключился"),
        this.s.settings.killSwitch
          ? t("Kill switch закрыл интернет, пока VPN не подключится снова. Чтобы открыть без VPN — выключите kill switch")
          : error ?? t("Соединение{0} прервано. Откройте B-Proxy, чтобы подключиться снова", [server ? t(" с «{0}»", [server.replace(/^\p{RI}{2}\s*/u, "")]) : ""]),
      );
      this.closeSession(error ? "error" : "system", error ?? undefined);
      if (error) this.logError(error);
      this.stopStats();
      this.emit({ state: "disconnected", connectedAt: null, downSpeed: null, upSpeed: null, error });
    } else if (state === "connecting" || state === "disconnecting") {
      this.emit({ state: state as TunnelState });
    }
  }

  private startStats() {
    window.clearInterval(this.statsTimer);
    this.statsTimer = window.setInterval(() => void this.tick(), 1000);
  }

  private stopStats() {
    window.clearInterval(this.statsTimer);
    this.statsTimer = undefined;
    this.base = null;
    this.last = null;
  }

  private async tick() {
    const now = await this.stats();
    if (!now) {
      this.emit({ downSpeed: null, upSpeed: null });
      // Интерфейса туннеля нет 5 секунд подряд — ядро упало или его закрыли снаружи.
      if (++this.missedStats >= 5 && this.s.state === "connected" && !this.busy) {
        this.missedStats = 0;
        this.onTunnelState("disconnected", t("Ядро VPN перестало работать. Подключитесь снова"));
      }
      return;
    }
    this.missedStats = 0;
    const at = Date.now();
    if (!this.base) this.base = now;
    let down = 0;
    let up = 0;
    if (this.last) {
      const sec = Math.max((at - this.last.at) / 1000, 0.25);
      down = Math.max(0, (now.rx - this.last.rx) / sec);
      up = Math.max(0, (now.tx - this.last.tx) / sec);
    }
    this.last = { ...now, at };
    this.emit({
      downSpeed: Math.round(down),
      upSpeed: Math.round(up),
      downTotal: Math.max(0, now.rx - this.base.rx),
      upTotal: Math.max(0, now.tx - this.base.tx),
      speedHistory: [...this.s.speedHistory, Math.round(down)].slice(-40),
    });
    // Трафик сеанса в журнале; на диск — не чаще раза в 15 секунд.
    this.patchSession({ down: this.s.downTotal, up: this.s.upTotal }, Date.now() - this.lastSave > 15_000);
  }

  async select(target: { subUrl: string; nodeId: string } | null) {
    haptic("select");
    const before = this.s.current;
    this.emit({ selected: target });
    this.persist();
    // Подключены — сразу переключаемся на новый сервер.
    const after = this.s.current;
    if (this.s.state === "connected" && after && (after.node.id !== before?.node.id || after.sub.url !== before?.sub.url)) {
      this.toast(t("Переключаемся: {0}", [after.node.name]));
      await this.reconnect();
    }
  }

  toggleFavorite(key: string) {
    const has = this.s.favorites.includes(key);
    this.emit({ favorites: has ? this.s.favorites.filter((k) => k !== key) : [...this.s.favorites, key] });
    this.persist();
  }

  // ---------- Подписки ----------

  private async load(url: string, previous?: StoredSubscription): Promise<StoredSubscription> {
    const res = await invoke<FetchResult>("plugin:bproxy|fetch_subscription", {
      url,
      userAgent: this.s.settings.userAgent.trim() || USER_AGENT,
      hwid: this.s.settings.sendHwid,
    });
    const fresh = await parseSubscription(url, res, (text) => this.convertLinks(text), previous);
    // Свои настройки провайдера переживают обновление подписки.
    return previous?.prefs ? { ...fresh, prefs: previous.prefs } : fresh;
  }

  async addSubscription(raw: string) {
    // Вставили не подписку, а ссылку bproxy:// или профиль маршрутизации — разбираем как их.
    if (/^bproxy:\/\//i.test(raw.trim())) {
      const action = parseLink(raw);
      if (action.kind !== "pending") return this.openLink(raw);
      if (action.link.kind === "routing") return this.addRoutingProfile(action.link.input);
      raw = action.link.url;
    } else if (/^[a-z]+:\/\/routing\//i.test(raw.trim())) {
      return this.addRoutingProfile(raw);
    }
    const url = checkUrl(raw);
    const sub = await this.load(url).catch((e) => {
      throw new Error(message(e));
    });
    this.setSubs([sub, ...this.subs.filter((x) => x.url !== sub.url && x.url !== url)]);
    const count = sub.nodes.filter((n) => !n.divider).length;
    this.log({ kind: "subscription", id: newId(), at: Date.now(), text: t("Добавлена подписка «{0}»", [sub.title]) });
    this.toast(t("Подписка «{0}» добавлена: {1} {2}", [sub.title, count, plural(count, t("сервер"), t("сервера"), t("серверов"))]));
    // Сразу меряем пинг новой подписки, чтобы автовыбор знал лучший сервер.
    if (this.s.state === "disconnected") void this.ping(sub.url, true);
  }

  /** Часы между обновлениями подписки по настройке; null — только вручную. */
  private intervalHours(sub: StoredSubscription): number | null {
    const own = sub.prefs?.interval ?? "global";
    const interval = own === "global" ? this.s.settings.updates.interval : own;
    if (interval === "off") return null;
    if (interval === "provider") return sub.updateIntervalHours ?? 12;
    return interval;
  }

  /** Обновляет подписки, у которых истёк интервал. */
  private async refreshDue() {
    const due = this.subs.filter((sub) => {
      const hours = this.intervalHours(sub);
      return hours != null && Date.now() - sub.updatedAt >= hours * 3600_000;
    });
    for (const sub of due) await this.refreshSubscription(sub.url, true);
  }

  async refreshSubscription(url: string, silent = false) {
    const sub = this.subs.find((x) => x.url === url);
    if (!sub || this.s.refreshingSub) return;
    this.emit({ refreshingSub: url });
    try {
      const fresh = await this.load(sub.url, sub);
      this.setSubs(this.subs.map((x) => (x.url === url ? fresh : x)));
      this.writeLog("info", `Подписка «${fresh.title}» обновлена${silent ? " (авто)" : ""}: ${fresh.nodes.filter((n) => !n.divider).length} серв.`);
      if (!silent) this.toast(t("Подписка «{0}» обновлена", [fresh.title]));
      this.pingAfterUpdate([url]);
    } catch (e) {
      this.logError(t("Подписка не обновилась — {0}: {1}", [sub.title, message(e)]));
      if (!silent) this.emit({ error: t("Не удалось обновить «{0}»: {1}", [sub.title, message(e)]) });
    } finally {
      this.emit({ refreshingSub: null });
    }
  }

  async refreshSubscriptions(silent = false) {
    if (this.subs.length === 0 || this.s.refreshingSub) return;
    this.emit({ refreshingSub: "*" });
    const errors: string[] = [];
    const next = await Promise.all(
      this.subs.map(async (sub) => {
        try {
          return await this.load(sub.url, sub);
        } catch (e) {
          errors.push(`${sub.title}: ${message(e)}`);
          return sub;
        }
      }),
    );
    this.setSubs(next);
    for (const e of errors) this.logError(t("Подписка не обновилась — {0}", [e]));
    this.writeLog(
      "info",
      `Обновление подписок${silent ? " (авто)" : ""}: ` +
        next.map((x) => t("«{0}» {1} серв.", [x.title, x.nodes.filter((n) => !n.divider).length])).join(", "),
    );
    if (errors.length < this.subs.length) {
      this.log({ kind: "subscription", id: newId(), at: Date.now(), text: silent ? t("Подписки обновлены автоматически") : t("Подписки обновлены") });
    }
    this.emit({ refreshingSub: null });
    this.pingAfterUpdate(next.map((x) => x.url));
    if (errors.length && !silent) this.emit({ error: errors.join("\n") });
    else if (!silent) this.toast(t("Подписки обновлены"));
  }

  async removeSubscription(url: string) {
    const index = this.subs.findIndex((x) => x.url === url);
    if (index < 0) return;
    const removed = this.subs[index];
    const selectedBefore = this.s.selected;
    this.emit({ selected: selectedBefore?.subUrl === url ? null : selectedBefore });
    this.setSubs(this.subs.filter((x) => x.url !== url));
    this.toaster.show(t("Подписка «{0}» удалена", [removed.title]), {
      id: "undo",
      label: t("Вернуть"),
      run: () => {
        const subs = [...this.subs];
        subs.splice(Math.min(index, subs.length), 0, removed);
        this.emit({ selected: selectedBefore });
        this.setSubs(subs);
      },
    });
  }

  // ---------- Пинг ----------

  private hasPings() {
    return this.subs.some((sub) => sub.nodes.some((n) => n.pingMs != null && n.pingMs > 0));
  }

  /**
   * Пинг серверов одного провайдера (по умолчанию — того, чей сервер выбран).
   * TCP — время соединения с адресом сервера (быстро, без ядра);
   * «реальная задержка» — запрос через ядро к проверочному адресу (pingBatch, по 5 за вызов).
   */
  /** «Пинг после обновления»: по очереди меряем обновлённых провайдеров (без VPN). */
  private pingAfterUpdate(urls: string[]) {
    if (!this.s.settings.updates.pingAfter || this.s.state !== "disconnected") return;
    void (async () => {
      for (const url of urls) {
        while (this.s.pinging) await new Promise((r) => setTimeout(r, 300));
        if (this.s.state !== "disconnected") return;
        await this.ping(url, true);
      }
    })();
  }

  async pingNode(subUrl: string, nodeId: string) {
    if (this.s.state !== "disconnected") {
      this.toast(t("Пинг проверяется при выключенном VPN"));
      return;
    }
    await this.ping(subUrl, true, [nodeId]);
    const node = this.s.subscriptions.find((x) => x.url === subUrl)?.nodes.find((n) => n.id === nodeId);
    if (node) this.toast(node.pingMs && node.pingMs > 0 ? t("{0}: {1} мс", [node.name, node.pingMs]) : t("{0}: нет связи", [node.name]));
  }

  async openLink(url: string) {
    const action = parseLink(url);
    this.writeLog("info", `Ссылка: ${url.split("/").slice(0, 3).join("/")}… → ${action.kind}`);
    if (action.kind === "pending") this.emit({ pendingLink: action.link });
    else if (action.kind === "connect" && this.s.state === "disconnected") await this.toggle();
    else if (action.kind === "disconnect" && this.s.state === "connected") await this.toggle();
    else if (action.kind === "toggle") await this.toggle();
    else if (action.kind === "unknown") this.toast(t("Ссылка bproxy:// не распознана — проверьте её у провайдера"));
  }

  async confirmLink(accept: boolean) {
    const link = this.s.pendingLink;
    this.emit({ pendingLink: null });
    if (!accept || !link) return;
    try {
      if (link.kind === "subscription") await this.addSubscription(link.url);
      else await this.addRoutingProfile(link.input);
    } catch (e) {
      this.emit({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ---------- «Живая активность» (iOS) ----------

  /** Статус VPN на экране блокировки: показываем при подключении, убираем при отключении. */
  private syncLiveActivity() {
    if (this.platform !== "ios") return;
    const { state, current, connectedAt, settings } = this.s;
    const show = settings.liveActivity && (state === "connecting" || state === "connected");
    const args = show
      ? {
          action: "update",
          status: state,
          server: current ? splitFlag(current.node.name).name : "",
          label: state === "connected" ? t("Защищено") : t("Подключаемся"),
          since: connectedAt ?? Date.now(),
          flag: current ? flagOf(current.node.name) : "",
          proto: current ? current.node.tags.slice(0, 2).join(" · ") : "",
          accent: accentOf(this.s.settings.appearance),
          stopLabel: t("Отключить"),
        }
      : { action: "end" };
    void invoke("plugin:bproxy|live_activity", { args }).catch((e) => this.writeLog("warn", `Живая активность: ${message(e)}`));
  }

  /** Виджет на рабочем столе (Android, iOS): сервер, флаг, цвет темы, подписи. */
  private widgetKey = "";
  private syncWidget() {
    if (!isMobile(this.platform)) return;
    const node = this.s.current?.node;
    const args = {
      server: node ? splitFlag(node.name).name : "",
      flag: node ? flagOf(node.name) : "",
      accent: accentOf(this.s.settings.appearance),
      labels: {
        connected: t("Защищено"),
        connecting: t("Подключаемся"),
        disconnected: t("Не защищено"),
        hint: t("Нажмите, чтобы подключить"),
      },
    };
    const key = JSON.stringify(args);
    if (key === this.widgetKey) return;
    this.widgetKey = key;
    void invoke("plugin:bproxy|widget_state", { args }).catch((e) => this.writeLog("warn", `Виджет: ${message(e)}`));
  }

  // ---------- Профили маршрутизации ----------

  private geoDir: string | null = null;

  private geoFile(name: string) {
    return this.s.geo?.files.find((f) => f.name === name && f.size > 0) ?? null;
  }

  private async loadGeoInfo() {
    const info = await invoke<{ dir: string; files: GeoState["files"] }>("plugin:bproxy|geo_info").catch(() => null);
    if (!info) return;
    this.geoDir = info.dir;
    this.emit({ geo: { files: info.files, downloading: this.s.geo?.downloading ?? false } });
  }

  private setRoutingSettings(routing: Settings["routing"]) {
    void this.updateSettings({ routing });
  }

  async addRoutingProfile(input: string) {
    const text = input.trim();
    let body = text;
    let source: string | null = null;
    if (/^https:\/\//i.test(text)) {
      const res = await invoke<FetchResult>("plugin:bproxy|fetch_subscription", { url: text, userAgent: "B-Proxy", hwid: false });
      if (res.status !== 200) throw new Error(t("Не удалось загрузить профиль: сервер ответил {0}", [res.status]));
      body = res.body;
      source = text;
    }
    const profile = decodeProfile(body, source);
    const r = this.s.settings.routing;
    // Тот же профиль добавили ещё раз — заменяем, а не плодим копии.
    const same = r.profiles.find((p) => (source && p.source === source) || p.name === profile.name);
    const next = same ? { ...profile, id: same.id } : profile;
    this.setRoutingSettings({
      enabled: true,
      activeId: next.id,
      profiles: same ? r.profiles.map((p) => (p.id === same.id ? next : p)) : [...r.profiles, next],
    });
    this.writeLog("info", `Профиль маршрутизации «${next.name}» ${same ? "обновлён" : "добавлен"}`);
    this.toast(t("Профиль «{0}» включён", [next.name]));
    const need = needsGeo(next);
    if (need.geoip || need.geosite) await this.updateGeo();
  }

  removeRoutingProfile(id: string) {
    const r = this.s.settings.routing;
    const removed = r.profiles.find((p) => p.id === id);
    if (!removed) return;
    const before = r;
    const profiles = r.profiles.filter((p) => p.id !== id);
    this.setRoutingSettings({ ...r, profiles, activeId: r.activeId === id ? (profiles[0]?.id ?? null) : r.activeId, enabled: r.enabled && profiles.length > 0 });
    this.toaster.show(t("Профиль «{0}» удалён", [removed.name]), { id: "undo", label: t("Вернуть"), run: () => this.setRoutingSettings(before) });
  }

  setRouting(patch: Partial<Pick<Settings["routing"], "enabled" | "activeId">>) {
    this.setRoutingSettings({ ...this.s.settings.routing, ...patch });
    const p = activeProfile(this.s.settings);
    if (p) {
      const need = needsGeo(p);
      if ((need.geoip && !this.geoFile("geoip.dat")) || (need.geosite && !this.geoFile("geosite.dat"))) void this.updateGeo(true);
    }
  }

  /** Скачать базы активного профиля (и сам профиль, если он добавлен по ссылке). */
  async updateGeo(quiet = false) {
    const profile = activeProfile(this.s.settings) ?? this.s.settings.routing.profiles[0];
    if (!profile || this.s.geo?.downloading) return;
    this.emit({ geo: { files: this.s.geo?.files ?? [], downloading: true } });
    const errors: string[] = [];
    try {
      let p = profile;
      if (p.source) {
        try {
          const res = await invoke<FetchResult>("plugin:bproxy|fetch_subscription", { url: p.source, userAgent: "B-Proxy", hwid: false });
          if (res.status === 200) {
            p = { ...decodeProfile(res.body, p.source), id: p.id, addedAt: p.addedAt };
            const r = this.s.settings.routing;
            this.emit({ settings: { ...this.s.settings, routing: { ...r, profiles: r.profiles.map((x) => (x.id === p.id ? p : x)) } } });
            this.persist();
          }
        } catch {
          // Профиль не обновился — работаем со старым.
        }
      }
      const need = needsGeo(p);
      const jobs: [string, string][] = [];
      if (need.geoip || p.geoipUrl) jobs.push(["geoip.dat", p.geoipUrl]);
      if (need.geosite || p.geositeUrl) jobs.push(["geosite.dat", p.geositeUrl]);
      for (const [name, url] of jobs) {
        if (!url) {
          errors.push(t("в профиле нет ссылки на {0}", [name]));
          continue;
        }
        try {
          await invoke("plugin:bproxy|download_geo", { name, url });
        } catch (e) {
          errors.push(message(e));
        }
      }
    } finally {
      await this.loadGeoInfo();
      this.emit({ geo: { files: this.s.geo?.files ?? [], downloading: false } });
    }
    if (errors.length) {
      this.writeLog("warn", `Базы маршрутизации: ${errors.join("; ")}`);
      if (!quiet) this.emit({ error: t("Базы маршрутизации не обновились: {0}", [errors.join("; ")]) });
    } else if (!quiet) {
      this.toast(t("Базы маршрутизации обновлены"));
      this.offerReconnect();
    }
  }

  // ---------- Свои настройки провайдера ----------

  private patchPrefs(subUrl: string, fn: (p: SubPrefs) => Partial<SubPrefs>) {
    this.setSubs(
      this.subs.map((x) => (x.url === subUrl ? { ...x, prefs: mergePrefs(x.prefs, fn(mergePrefs(x.prefs, {}))) } : x)),
    );
  }

  updateSubPrefs(subUrl: string, patch: Partial<SubPrefs>) {
    const before = this.subs.find((x) => x.url === subUrl)?.prefs?.dns ?? "";
    this.patchPrefs(subUrl, () => patch);
    // Сменили DNS провайдера, к чьему серверу подключены, — предложим переподключиться.
    if (patch.dns !== undefined && patch.dns !== before && this.s.current?.sub.url === subUrl) this.offerReconnect();
  }

  renameNode(subUrl: string, nodeId: string, name: string | null) {
    this.patchPrefs(subUrl, (p) => {
      const renames = { ...p.renames };
      if (name?.trim()) renames[nodeId] = name.trim();
      else delete renames[nodeId];
      return { renames };
    });
  }

  setNodeHidden(subUrl: string, nodeId: string, hidden: boolean) {
    this.patchPrefs(subUrl, (p) => ({
      hidden: hidden ? [...new Set([...p.hidden, nodeId])] : p.hidden.filter((x) => x !== nodeId),
    }));
  }

  async pingAll() {
    if (this.s.state !== "disconnected" || this.s.pinging) return;
    for (const url of this.subs.map((x) => x.url)) await this.ping(url);
  }

  async ping(subUrl?: string, quiet = false, only?: string[]) {
    const sub = this.subs.find((x) => x.url === (subUrl ?? this.s.current?.sub.url)) ?? this.subs[0];
    // Под VPN замер пошёл бы через туннель и показал неправду.
    if (!sub || this.s.pinging || (!quiet && this.s.state !== "disconnected")) return;
    const { method, timeoutSec, url } = this.s.settings.ping;
    this.emit({ pinging: true, pingingSub: sub.url });
    try {
      const nodes = sub.nodes.filter((n) => !n.divider && sub.outbounds[n.id] && (!only || only.includes(n.id)));
      const results = new Map<string, number>();

      if (method === "tcp") {
        const targets = nodes.flatMap((n) => {
          const t = serverEndpoint(sub.outbounds[n.id]);
          if (!t) {
            results.set(n.id, -1);
            return [];
          }
          return [{ id: n.id, ...t }];
        });
        const res = await invoke<{ id: string; ms: number | null }[]>("plugin:bproxy|tcp_ping", {
          targets,
          timeoutMs: timeoutSec * 1000,
        });
        for (const r of res) results.set(r.id, r.ms ?? -1);
      } else {
        const chunks: (typeof nodes)[] = [];
        for (let i = 0; i < nodes.length; i += PING_BATCH) chunks.push(nodes.slice(i, i + PING_BATCH));
        // Три пачки одновременно: быстрее, но не забивает канал.
        let next = 0;
        const worker = async () => {
          while (next < chunks.length) {
            const chunk = chunks[next++];
            try {
              const data = await this.core<{ results?: { success: boolean; delay: number }[] }>("pingBatch", {
                configs: chunk.map((n) => ({ xrayJson: buildPingConfig(sub.outbounds[n.id]), outboundTag: "proxy" })),
                timeout: timeoutSec,
                // Способ запроса передаём во фрагменте: его разбирает core/nodep/measure.go.
                url: `${url.split("#")[0]}#bproxy-method=${method === "get" ? "GET" : "HEAD"}`,
              });
              chunk.forEach((n, i) => {
                const r = data.results?.[i];
                results.set(n.id, r?.success ? Math.max(1, Math.round(r.delay)) : -1);
              });
            } catch {
              chunk.forEach((n) => results.set(n.id, -1));
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      }

      const ok = [...results.values()].filter((v) => v > 0);
      this.writeLog(
        ok.length ? "info" : "warn",
        `Пинг (${method.toUpperCase()}) «${sub.title}»${only ? ` (${only.length} серв.)` : ""}: ответили ${ok.length} из ${results.size}` +
          (ok.length ? `, лучший ${Math.min(...ok)} мс` : ""),
      );
      this.setSubs(
        this.subs.map((x) =>
          x.url !== sub.url ? x : { ...x, nodes: x.nodes.map((n) => (n.divider ? n : { ...n, pingMs: results.get(n.id) ?? n.pingMs })) },
        ),
      );
      if (!quiet) this.toast(t("Пинг «{0}» обновлён", [sub.title]));
    } finally {
      this.emit({ pinging: false, pingingSub: null });
    }
  }

  // ---------- Настройки ----------

  private settingsChanged() {
    this.persist();
    this.offerReconnect();
  }

  async updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
    // Переподключение нужно, только если настройка меняет конфиг ядра.
    if (Object.keys(patch).some((k) => !APP_ONLY.has(k))) this.settingsChanged();
    else this.persist();
    if (patch.liveActivity !== undefined) this.syncLiveActivity();
    if (patch.crashReports !== undefined) this.syncCrashReports();
    if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics);
    // Поменяли расписание — проверим заново, как при запуске.
    if (patch.schedule) {
      this.scheduleInside = null;
      void this.checkSchedule();
    }
    // Журнал соединений выключили — стираем записанное.
    if (patch.connectionLog === false) void this.clearConnections();
    // Kill switch выключили после аварии — открываем интернет (ядро снимет оставшиеся правила).
    if (patch.killSwitch === false && this.s.state === "disconnected" && !isMobile(this.platform)) {
      void invoke("plugin:bproxy|stop").catch((e) => this.logError(message(e)));
    }
    // Включили или выключили уведомления о сроке — переставим расписание на телефоне.
    if (patch.notifications && isMobile(this.platform)) this.checkAlerts();
  }

  async updateCore(patch: Partial<CoreSettings>) {
    this.emit({ settings: { ...this.s.settings, core: { ...this.s.settings.core, ...patch } } });
    this.settingsChanged();
  }

  updateAppearance(patch: Partial<Appearance>) {
    const appearance = { ...this.s.settings.appearance, ...patch };
    this.emit({ settings: { ...this.s.settings, appearance } });
    try {
      // Своё фото храним, только если влезает в хранилище.
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      try {
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...appearance, backgroundImage: null }));
      } catch {
        // Хранилище недоступно.
      }
    }
  }

  async resetSettings() {
    const before = this.s.settings;
    this.emit({ settings: structuredClone(defaultSettings) });
    if (!isMobile(this.platform)) void invoke("set_close_to_tray", { enabled: defaultSettings.desktop.closeToTray }).catch(() => undefined);
    this.updateAppearance({});
    this.persist();
    this.toaster.show(t("Настройки сброшены"), {
      id: "undo",
      label: t("Вернуть"),
      run: () => {
        this.emit({ settings: before });
        this.updateAppearance({});
        this.persist();
      },
    });
  }

  clearError() {
    this.emit({ error: null });
  }
}

/** Интерфейсу не нужны outbound'ы с ключами — отдаём только поля Subscription. */
function publicSub(s: StoredSubscription): Subscription {
  const { outbounds: _o, fragment: _f, updateIntervalHours: _u, ...rest } = s;
  return applyPrefs({ ...rest, providerTitle: rest.title });
}

/** Адрес и порт сервера из outbound'а — для TCP-пинга. */
function serverEndpoint(node: NodeConfig): { host: string; port: number } | null {
  const o = mainOutbound(node);
  const s = (o.settings ?? {}) as Record<string, unknown>;
  const first = ((s.vnext ?? s.servers) as { address?: string; port?: number }[] | undefined)?.[0];
  const host = (first?.address ?? s.address) as string | undefined;
  const port = Number(first?.port ?? s.port);
  return host && port > 0 && port < 65536 ? { host, port } : null;
}

/** Старое значение «real» — это нынешний HEAD. */
function migratePing(p: Settings["ping"]): Settings["ping"] {
  const method = (p.method as string) === "real" ? "head" : p.method;
  return { ...p, method: ["tcp", "head", "get"].includes(method) ? method : "tcp" };
}

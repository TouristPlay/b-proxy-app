import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { defaultAppearance, defaultSettings } from "./demo";
import { checkUrl, parseSubscription, type FetchResult, type Outbound, type StoredSubscription } from "./subscription";
import {
  nodeKey,
  type ActivityEntry,
  type Appearance,
  type Backend,
  type CoreSettings,
  type SessionEnd,
  type Settings,
  type Snapshot,
  type Subscription,
  type TunnelState,
} from "./types";
import { plural } from "@/lib/format";
import { loadActivity, newId, saveActivity } from "./activity";
import { Toaster } from "./toaster";
import { buildConfig, buildPingConfig, detectPlatform, isMobile } from "./xray";

const APP_VERSION = "0.1.0";
/** Remnawave отдаёт список серверов только приложениям; с этим заголовком приходят ссылки. */
const USER_AGENT = "v2rayNG/1.9.30";
const PING_URL = "https://www.gstatic.com/generate_204";
/** libXray меряет не больше 5 серверов за вызов. */
const PING_BATCH = 5;

const STATE_KEY = "b-proxy.state";
const APPEARANCE_KEY = "b-proxy.appearance";

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
  return "Что-то пошло не так. Попробуйте ещё раз";
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
        appearance,
      },
      downSpeed: null,
      upSpeed: null,
      downTotal: 0,
      upTotal: 0,
      speedHistory: [],
      error: null,
      pinging: false,
      toast: null,
      version: { app: APP_VERSION, xray: "—" },
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
    this.logPaths = await invoke<{ dir: string; appLog: string; coreLog: string } | null>("plugin:bproxy|log_info").catch(() => null);
    const sub = this.subs.map((x) => `«${x.title}» (${x.nodes.filter((n) => !n.divider).length})`).join(", ");
    this.writeLog("info", `Интерфейс ${APP_VERSION}, ${this.platform}; подписки: ${sub || "нет"}`);
    // Состояние туннеля приходит из Rust (компьютеры) или из нативного кода (телефоны).
    const onState = (p: { state: string; error?: string | null }) => this.onTunnelState(p.state, p.error ?? null);
    if (isMobile(this.platform)) {
      await addPluginListener("bproxy", "state", onState).catch(() => undefined);
    } else {
      await listen<{ state: string; error: string | null }>("bproxy://state", (e) => onState(e.payload));
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

    // Обновляем подписки при запуске, если прошло больше их интервала (по умолчанию 12 ч).
    const stale = this.subs.some(
      (sub) => Date.now() - sub.updatedAt > (sub.updateIntervalHours ?? 12) * 3600_000,
    );
    if (stale) await this.refreshSubscriptions(true);
    // Свежий пинг при запуске: автовыбор берёт лучший сервер, а не первый в списке.
    if (this.s.state === "disconnected" && this.subs.length) void this.pingAll(true);
    window.setInterval(() => void this.refreshSubscriptions(true), 6 * 3600_000);
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
    this.s = { ...this.s, ...patch };
    this.recompute();
    for (const l of this.listeners) l(this.s);
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
    const all = this.s.subscriptions.flatMap((sub) =>
      sub.nodes.filter((node) => !node.divider).map((node) => ({ sub, node })),
    );
    const sel = this.s.selected;
    let current: Snapshot["current"] = sel
      ? (all.find((p) => p.sub.url === sel.subUrl && p.node.id === sel.nodeId) ?? null)
      : null;
    if (!current) {
      const measured = all
        .filter((p) => p.node.pingMs != null && p.node.pingMs > 0)
        .sort((a, b) => a.node.pingMs! - b.node.pingMs!);
      current = measured[0] ?? all[0] ?? null;
    }
    this.s = { ...this.s, current };
  }

  // ---------- Ядро ----------

  private async core<T>(method: string, payload?: unknown): Promise<T> {
    const request = JSON.stringify({ apiVersion: 3, method, ...(payload ? { payload } : {}) });
    const raw = await invoke<string>("plugin:bproxy|invoke_core", { request });
    const res = JSON.parse(raw) as CoreResponse<T>;
    if (!res.success) throw new Error(res.error || "Ошибка ядра Xray");
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
    const clean = text.replace(/[a-z0-9+]+:\/\/\S+/gi, "‹ссылка›");
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
    this.toaster.show("Журнал очищен", { id: "undo", label: "Вернуть", run: () => this.setActivity(before) });
  }

  // ---------- VPN ----------

  async toggle() {
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
    this.toaster.show("Изменения вступят в силу после переподключения", {
      id: "reconnect",
      label: "Переподключить",
      run: () => void this.reconnect(),
    });
  }

  private async connect() {
    if (!this.s.current) {
      this.emit({ error: "Сначала добавьте подписку" });
      return;
    }
    this.busy = true;
    this.cancelled = false;
    this.emit({ state: "connecting", error: null });
    try {
      // Автовыбор без замеров: сначала находим самый быстрый сервер.
      if (!this.s.selected && !this.hasPings()) await this.pingAll(true);

      const target = this.s.current;
      if (!target) throw new Error("Сначала добавьте подписку");
      const stored = this.subs.find((x) => x.url === target.sub.url);
      const node = stored?.outbounds[target.node.id];
      if (!stored || !node) throw new Error("Сервер не найден. Обновите подписку");

      const permission = await invoke<{ granted: boolean }>("plugin:bproxy|prepare");
      if (!permission.granted) throw new Error("Разрешите B-Proxy создать VPN, чтобы подключиться");

      const coreLog = this.platform === "ios" ? null : (this.logPaths?.coreLog ?? null);
      const config = buildConfig(node, this.s.settings, this.platform, stored.fragment, coreLog);
      const set = this.s.settings;
      this.writeLog(
        "info",
        `Подключение: ${target.node.name} [${target.node.tags.join("/")}], ` +
          `маршруты: РФ напрямую=${set.russianSitesDirect}, DPI=${set.tlsFragment || stored.fragment != null}, ` +
          `реклама=${set.blockAds}, IPv6=${set.ipv6}, DNS ${set.dnsServer}; ядро: память ${set.core.memoryLimitMb} МБ, ` +
          `MTU ${set.core.mtu || 1500}, журнал ${set.core.logLevel}`,
      );
      if (this.cancelled) return;
      await invoke("plugin:bproxy|start", { config });
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
      return;
    }
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
    const before = this.s.current;
    this.emit({ selected: target });
    this.persist();
    // Подключены — сразу переключаемся на новый сервер.
    const after = this.s.current;
    if (this.s.state === "connected" && after && (after.node.id !== before?.node.id || after.sub.url !== before?.sub.url)) {
      this.toast(`Переключаемся: ${after.node.name}`);
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
      userAgent: USER_AGENT,
    });
    return parseSubscription(url, res, (text) => this.convertLinks(text), previous);
  }

  async addSubscription(raw: string) {
    const url = checkUrl(raw);
    const sub = await this.load(url).catch((e) => {
      throw new Error(message(e));
    });
    this.setSubs([sub, ...this.subs.filter((x) => x.url !== sub.url && x.url !== url)]);
    const count = sub.nodes.filter((n) => !n.divider).length;
    this.log({ kind: "subscription", id: newId(), at: Date.now(), text: `Добавлена подписка «${sub.title}»` });
    this.toast(`Подписка «${sub.title}» добавлена: ${count} ${plural(count, "сервер", "сервера", "серверов")}`);
    // Сразу меряем пинг, чтобы автовыбор знал лучший сервер.
    if (this.s.state === "disconnected") void this.pingAll(true);
  }

  async refreshSubscriptions(silent = false) {
    if (this.subs.length === 0) return;
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
    for (const e of errors) this.logError(`Подписка не обновилась — ${e}`);
    this.writeLog(
      "info",
      `Обновление подписок${silent ? " (авто)" : ""}: ` +
        next.map((x) => `«${x.title}» ${x.nodes.filter((n) => !n.divider).length} серв.`).join(", "),
    );
    if (errors.length < this.subs.length) {
      this.log({ kind: "subscription", id: newId(), at: Date.now(), text: silent ? "Подписки обновлены автоматически" : "Подписки обновлены" });
    }
    if (errors.length && !silent) this.emit({ error: errors.join("\n") });
    else if (!silent) this.toast("Подписки обновлены");
  }

  async removeSubscription(url: string) {
    const index = this.subs.findIndex((x) => x.url === url);
    if (index < 0) return;
    const removed = this.subs[index];
    const selectedBefore = this.s.selected;
    this.emit({ selected: selectedBefore?.subUrl === url ? null : selectedBefore });
    this.setSubs(this.subs.filter((x) => x.url !== url));
    this.toaster.show(`Подписка «${removed.title}» удалена`, {
      id: "undo",
      label: "Вернуть",
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

  async pingAll(quiet = false) {
    // Под VPN замер пошёл бы через туннель и показал неправду.
    if (this.s.pinging || (!quiet && this.s.state !== "disconnected")) return;
    this.emit({ pinging: true });
    try {
      const jobs = this.subs.flatMap((sub) =>
        sub.nodes
          .filter((n) => !n.divider && sub.outbounds[n.id])
          .map((n) => ({ subUrl: sub.url, id: n.id, config: buildPingConfig(sub.outbounds[n.id]) })),
      );
      const results = new Map<string, number>();
      const chunks: (typeof jobs)[] = [];
      for (let i = 0; i < jobs.length; i += PING_BATCH) chunks.push(jobs.slice(i, i + PING_BATCH));

      // Три пачки одновременно: быстрее, но не забивает канал.
      let next = 0;
      const worker = async () => {
        while (next < chunks.length) {
          const chunk = chunks[next++];
          try {
            const data = await this.core<{ results?: { success: boolean; delay: number }[] }>("pingBatch", {
              configs: chunk.map((j) => ({ xrayJson: j.config, outboundTag: "proxy" })),
              timeout: 5,
              url: PING_URL,
            });
            chunk.forEach((j, i) => {
              const r = data.results?.[i];
              results.set(nodeKey(j.subUrl, j.id), r?.success ? Math.max(1, Math.round(r.delay)) : -1);
            });
          } catch {
            chunk.forEach((j) => results.set(nodeKey(j.subUrl, j.id), -1));
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const ok = [...results.values()].filter((v) => v > 0);
      this.writeLog(
        ok.length ? "info" : "warn",
        `Пинг: ответили ${ok.length} из ${results.size}` + (ok.length ? `, лучший ${Math.min(...ok)} мс` : ""),
      );

      this.setSubs(
        this.subs.map((sub) => ({
          ...sub,
          nodes: sub.nodes.map((n) => (n.divider ? n : { ...n, pingMs: results.get(nodeKey(sub.url, n.id)) ?? n.pingMs })),
        })),
      );
      if (!quiet) this.toast("Пинг обновлён");
    } finally {
      this.emit({ pinging: false });
    }
  }

  // ---------- Настройки ----------

  private settingsChanged() {
    this.persist();
    this.offerReconnect();
  }

  async updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
    this.settingsChanged();
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
    this.updateAppearance({});
    this.persist();
    this.toaster.show("Настройки сброшены", {
      id: "undo",
      label: "Вернуть",
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
  const { outbounds: _o, fragment: _f, hideUrl: _h, updateIntervalHours: _u, ...rest } = s;
  return rest;
}

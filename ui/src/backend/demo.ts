import { newId } from "./activity";
import { applyPrefs, mergePrefs, pickCurrent } from "./prefs";
import { parseLink } from "./links";
import { decodeProfile } from "./routing";
import { Toaster } from "./toaster";
import {
  nodeKey,
  type ActivityEntry,
  type DesktopSettings,
  type Appearance,
  type Backend,
  type CoreSettings,
  type ServerNode,
  type SubPrefs,
  type Settings,
  type Snapshot,
  type Subscription,
} from "./types";
import { t } from "@/lib/i18n";


/**
 * Вымышленная подписка для показа дизайна: нейтральный провайдер, обычные страны.
 * Ни адресов, ни ключей, ни связи с настоящими сервисами.
 */
const v = (id: string, name: string, net: string, sec = "REALITY"): ServerNode => ({
  id,
  name,
  tags: ["VLESS", sec, net],
  pingMs: null,
});

const demoNodes: ServerNode[] = [
  v("auto-all", t("🇪🇺 Auto | Все серверы"), "GRPC"),
  v("de", t("🇩🇪 Германия"), "TCP"),
  v("nl", t("🇳🇱 Нидерланды"), "TCP"),
  v("fi", t("🇫🇮 Финляндия"), "GRPC"),
  v("pl", t("🇵🇱 Польша"), "GRPC"),
  v("fr", t("🇫🇷 Франция"), "GRPC"),
  v("se", t("🇸🇪 Швеция"), "XHTTP", "TLS"),
  v("ch", t("🇨🇭 Швейцария"), "TCP"),
  v("us", t("🇺🇸 США"), "TCP"),
  v("jp", t("🇯🇵 Япония"), "XHTTP", "TLS"),
  { id: "div-mobile", name: t("⬇️ Для мобильного интернета ⬇️"), tags: [], pingMs: null, divider: true },
  v("m-auto", t("🌐 Auto | Мобильная сеть"), "GRPC"),
  v("m-de", t("🇩🇪 Германия | Мобильная сеть"), "TCP"),
  v("m-fi", t("🇫🇮 Финляндия | Мобильная сеть"), "XHTTP", "TLS"),
  v("m-nl", t("🇳🇱 Нидерланды | Мобильная сеть"), "XHTTP", "TLS"),
];

const demoSub: Subscription = applyPrefs({
  url: "https://example.com/sub/demo",
  providerTitle: "Demo VPN",
  plan: t("Безлимит"),
  nodes: demoNodes,
  usedBytes: 128_402_113_536,
  totalBytes: 0,
  expireAt: Date.now() + 184 * 86_400_000,
  announce:
    t("Добро пожаловать! Это пример объявления провайдера: новости, сроки подписки и советы.\n\nЕсли сервер не отвечает, обновите подписку или выберите другой."),
  supportUrl: "https://example.com/support",
  webPageUrl: "https://example.com/account",
  updatedAt: Date.now() - 3 * 3600_000,
});

export const defaultCore: CoreSettings = {
  memoryLimitMb: 30,
  noLimitMode: false,
  idleTimeoutSec: 300,
  sniffing: true,
  routeOnly: true,
  mtu: 0,
  mux: false,
  muxConcurrency: 8,
  logLevel: "warning",
};

export const defaultAppearance: Appearance = {
  theme: "amber",
  accent: null,
  background: "horizon",
  backgroundImage: null,
  backgroundDim: 60,
  mode: "dark",
  glassBlur: 22,
  motion: true,
  language: "system",
};

export const defaultSettings: Settings = {
  russianSitesDirect: true,
  tlsFragment: false,
  blockAds: false,
  ipv6: false,
  dnsServer: "1.1.1.1",
  sendHwid: true,
  network: { lanDirect: true, exclusions: [], preferIpv6: false },
  routing: { enabled: false, activeId: null, profiles: [] },
  localProxy: { enabled: false, port: 10808, lan: false },
  userAgent: "",
  ping: { method: "tcp", timeoutSec: 5, url: "https://www.gstatic.com/generate_204", onStart: true },
  updates: { interval: "provider", onStart: true, pingAfter: false },
  autoConnect: false,
  liveActivity: true,
  serverSort: "provider",
  notifications: { enabled: true, disconnect: true, expiry: true, traffic: true, announce: true },
  desktop: { closeToTray: true },
  core: defaultCore,
  appearance: defaultAppearance,
};

const APPEARANCE_KEY = "b-proxy.appearance";

/** Оформление переживает перезагрузку страницы, если браузер даёт localStorage. */
function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return { ...defaultAppearance, ...(JSON.parse(raw) as Partial<Appearance>) };
  } catch {
    // Хранилище недоступно — берём оформление по умолчанию.
  }
  return defaultAppearance;
}

/** Бэкенд для показа дизайна в браузере: ведёт себя как настоящий, но ничего не подключает. */
export class DemoBackend implements Backend {
  private listeners = new Set<(s: Snapshot) => void>();
  private ticker: number | undefined;
  private toaster = new Toaster((toast) => this.emit({ toast }));
  private sessionId: string | null = null;
  private s: Snapshot;

  constructor(empty = false) {
    this.s = {
      state: "disconnected",
      connectedAt: null,
      subscriptions: empty ? [] : [structuredClone(demoSub)],
      selected: null,
      current: null,
      favorites: [nodeKey(demoSub.url, "de")],
      settings: { ...structuredClone(defaultSettings), appearance: loadAppearance() },
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
      version: { app: "0.1.0", xray: "26.11.9" },
      autostart: false,
      geo: { files: [], downloading: false },
      pendingLink: null,
      device: { hwid: "3F2A9C1E-7B4D-4E8A-9C21-5D6E7F8A9B0C", os: "Linux", osVersion: "Ubuntu 24.04 LTS", model: "Demo PC" },
      activity: empty ? [] : demoActivity(),
    };
    this.recompute();
  }

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

  private toast(text: string) {
    this.toaster.show(text);
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

  private async reconnect() {
    await this.toggle();
    await this.toggle();
  }

  private recompute() {
    this.s = { ...this.s, current: pickCurrent(this.s.subscriptions, this.s.selected) };
  }


  async toggle() {
    if (this.s.state === "connected" || this.s.state === "connecting") {
      this.emit({ state: "disconnecting" });
      await wait(450);
      window.clearInterval(this.ticker);
      const id = this.sessionId;
      this.sessionId = null;
      this.emit({
        state: "disconnected",
        connectedAt: null,
        downSpeed: null,
        upSpeed: null,
        activity: this.s.activity.map((e) =>
          e.kind === "session" && e.id === id
            ? { ...e, endedAt: Date.now(), end: "manual", down: this.s.downTotal, up: this.s.upTotal }
            : e,
        ),
      });
      return;
    }
    if (!this.s.current) {
      this.emit({ error: t("Сначала добавьте подписку") });
      return;
    }
    this.emit({ state: "connecting", error: null });
    await wait(1400);
    const cur = this.s.current;
    this.sessionId = newId();
    this.emit({
      activity: [
        {
          kind: "session",
          id: this.sessionId,
          server: cur?.node.name ?? "",
          subscription: cur?.sub.title ?? "",
          startedAt: Date.now(),
          endedAt: null,
          down: 0,
          up: 0,
          end: null,
        },
        ...this.s.activity,
      ],
    });
    this.emit({
      state: "connected",
      connectedAt: Date.now(),
      downSpeed: 0,
      upSpeed: 0,
      downTotal: 0,
      upTotal: 0,
      speedHistory: [],
    });
    this.ticker = window.setInterval(() => {
      const burst = Math.random() < 0.25;
      const down = Math.round((burst ? 4e6 : 2e5) + Math.random() * (burst ? 6e6 : 8e5));
      const up = Math.round(4e4 + Math.random() * 2.5e5);
      this.emit({
        downSpeed: down,
        upSpeed: up,
        downTotal: this.s.downTotal + down,
        upTotal: this.s.upTotal + up,
        speedHistory: [...this.s.speedHistory, down].slice(-40),
      });
    }, 1000);
  }

  async select(target: { subUrl: string; nodeId: string } | null) {
    this.emit({ selected: target });
    if (this.s.state === "connected" && this.s.current) {
      this.toast(t("Переключаемся: {0}", [this.s.current.node.name]));
      await this.reconnect();
    }
  }

  toggleFavorite(key: string) {
    const has = this.s.favorites.includes(key);
    this.emit({ favorites: has ? this.s.favorites.filter((k) => k !== key) : [...this.s.favorites, key] });
  }

  async addSubscription(url: string) {
    // Вставили не подписку, а ссылку bproxy:// или профиль маршрутизации — разбираем как их.
    if (/^bproxy:\/\//i.test(url.trim())) {
      const action = parseLink(url);
      if (action.kind !== "pending") return this.openLink(url);
      if (action.link.kind === "routing") return this.addRoutingProfile(action.link.input);
      url = action.link.url;
    } else if (/^[a-z]+:\/\/routing\//i.test(url.trim())) {
      return this.addRoutingProfile(url);
    }
    if (!/^https?:\/\//.test(url.trim())) {
      throw new Error(t("Ссылка должна начинаться с https://"));
    }
    await wait(900);
    const sub = { ...structuredClone(demoSub), url: url.trim(), updatedAt: Date.now() };
    this.emit({ subscriptions: [sub, ...this.s.subscriptions.filter((x) => x.url !== sub.url)] });
    this.toast(t("Подписка добавлена"));
    // Сразу меряем пинг, чтобы автовыбор знал лучший сервер.
    void this.ping(sub.url, true);
  }

  async refreshSubscriptions() {
    this.emit({ refreshingSub: "*" });
    await wait(700);
    this.emit({ subscriptions: this.s.subscriptions.map((x) => ({ ...x, updatedAt: Date.now() })), refreshingSub: null });
    this.toast(t("Подписки обновлены"));
  }

  async refreshSubscription(url: string) {
    this.emit({ refreshingSub: url });
    await wait(700);
    const sub = this.s.subscriptions.find((x) => x.url === url);
    this.emit({
      subscriptions: this.s.subscriptions.map((x) => (x.url === url ? { ...x, updatedAt: Date.now() } : x)),
      refreshingSub: null,
    });
    this.toast(t("Подписка «{0}» обновлена", [sub?.title ?? ""]));
  }

  async removeSubscription(url: string) {
    const before = { subscriptions: this.s.subscriptions, selected: this.s.selected };
    const sub = before.subscriptions.find((x) => x.url === url);
    this.emit({
      subscriptions: before.subscriptions.filter((x) => x.url !== url),
      selected: before.selected?.subUrl === url ? null : before.selected,
    });
    this.toaster.show(t("Подписка «{0}» удалена", [sub?.title ?? t("без названия")]), {
      id: "undo",
      label: t("Вернуть"),
      run: () => this.emit(before),
    });
  }

  /** Пинг одного провайдера (по умолчанию — того, чей сервер выбран). */
  async openLink(url: string) {
    const action = parseLink(url);
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

  // В демо профиль разбирается по-настоящему, а базы «скачиваются» понарошку.
  async addRoutingProfile(input: string) {
    const text = input.trim();
    if (/^https:\/\//i.test(text)) throw new Error(t("В демо профиль по ссылке не загрузить — вставьте диплинк или JSON"));
    const profile = decodeProfile(text);
    const r = this.s.settings.routing;
    this.emit({ settings: { ...this.s.settings, routing: { enabled: true, activeId: profile.id, profiles: [...r.profiles, profile] } } });
    this.toast(t("Профиль «{0}» включён", [profile.name]));
    await this.updateGeo();
  }

  removeRoutingProfile(id: string) {
    const r = this.s.settings.routing;
    const profiles = r.profiles.filter((p) => p.id !== id);
    this.emit({
      settings: { ...this.s.settings, routing: { ...r, profiles, activeId: r.activeId === id ? (profiles[0]?.id ?? null) : r.activeId, enabled: r.enabled && profiles.length > 0 } },
    });
  }

  setRouting(patch: Partial<Pick<Settings["routing"], "enabled" | "activeId">>) {
    this.emit({ settings: { ...this.s.settings, routing: { ...this.s.settings.routing, ...patch } } });
    this.offerReconnect();
  }

  async updateGeo() {
    this.emit({ geo: { files: this.s.geo?.files ?? [], downloading: true } });
    await wait(1200);
    const now = Date.now();
    this.emit({
      geo: {
        downloading: false,
        files: [
          { name: "geoip.dat", size: 1_248_512, updatedAt: now },
          { name: "geosite.dat", size: 3_655_210, updatedAt: now },
        ],
      },
    });
    this.toast(t("Базы маршрутизации обновлены"));
  }

  async pingNode(subUrl: string, nodeId: string) {
    await this.ping(subUrl, true, [nodeId]);
    const node = this.s.subscriptions.find((x) => x.url === subUrl)?.nodes.find((n) => n.id === nodeId);
    if (node) this.toast(node.pingMs && node.pingMs > 0 ? t("{0}: {1} мс", [node.name, node.pingMs]) : t("{0}: нет связи", [node.name]));
  }

  private patchPrefs(subUrl: string, fn: (p: SubPrefs) => Partial<SubPrefs>) {
    this.emit({
      subscriptions: this.s.subscriptions.map((x) => (x.url === subUrl ? applyPrefs({ ...x, prefs: mergePrefs(x.prefs, fn(x.prefs)) }) : x)),
    });
  }

  updateSubPrefs(subUrl: string, patch: Partial<SubPrefs>) {
    this.patchPrefs(subUrl, () => patch);
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
    for (const url of this.s.subscriptions.map((x) => x.url)) await this.ping(url);
  }

  async ping(subUrl?: string, quiet = false, only?: string[]) {
    const url = subUrl ?? this.s.current?.sub.url ?? this.s.subscriptions[0]?.url;
    if (!url || this.s.state !== "disconnected" || this.s.pinging) return;
    this.emit({ pinging: true, pingingSub: url });
    await wait(this.s.settings.ping.method === "tcp" ? 600 : 1200);
    const tcp = this.s.settings.ping.method === "tcp";
    const get = this.s.settings.ping.method === "get";
    const subscriptions = this.s.subscriptions.map((sub) =>
      sub.url !== url
        ? sub
        : {
            ...sub,
            nodes: sub.nodes.map((n) =>
              n.divider || (only && !only.includes(n.id)) ? n : { ...n, pingMs: n.id === "jp" ? -1 : Math.round((tcp ? 8 : get ? 40 : 15) + Math.random() * (tcp ? 90 : get ? 260 : 180)) },
            ),
          },
    );
    this.emit({ subscriptions, pinging: false, pingingSub: null });
    if (!quiet) this.toast(t("Пинг обновлён"));
  }

  async updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
    const appOnly = ["autoConnect", "serverSort", "sendHwid", "updates", "ping", "notifications", "desktop"];
    if (Object.keys(patch).some((k) => !appOnly.includes(k))) this.offerReconnect();
  }

  async updateCore(patch: Partial<CoreSettings>) {
    this.emit({ settings: { ...this.s.settings, core: { ...this.s.settings.core, ...patch } } });
    this.offerReconnect();
  }

  /** persist = false — только на этот показ (страница ревью: #light). */
  updateAppearance(patch: Partial<Appearance>, persist = true) {
    const appearance = { ...this.s.settings.appearance, ...patch };
    this.emit({ settings: { ...this.s.settings, appearance } });
    if (!persist) return;
    try {
      // Картинку не сохраняем: она может быть больше лимита хранилища.
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...appearance, backgroundImage: null }));
    } catch {
      // Не сохранилось — ничего страшного, действует до перезагрузки.
    }
  }

  async resetSettings() {
    const before = this.s.settings;
    this.emit({ settings: structuredClone(defaultSettings) });
    this.updateAppearance({});
    this.toaster.show(t("Настройки сброшены"), {
      id: "undo",
      label: t("Вернуть"),
      run: () => {
        this.emit({ settings: before });
        this.updateAppearance({});
      },
    });
  }

  clearError() {
    this.emit({ error: null });
  }

  async readLog(which: "app" | "core") {
    // В демо журналов нет: показываем, как они выглядят в приложении.
    const at = new Date().toISOString().slice(0, 19).replace("T", " ");
    return which === "app"
      ? `${at}Z INFO  [plugin] B-Proxy 0.1.0 запущен: windows x86_64\n${at}Z INFO  [ui] Подключение: 🇩🇪 Германия [VLESS/REALITY/GRPC]\n${at}Z INFO  [vpn] VPN подключён за 1840 мс`
      : `${at} [Info] Xray 26.11.9 started\n${at} [Info] [tun] interface B-Proxy created`;
  }

  async openLogsFolder() {
    return false;
  }

  clearActivity() {
    const before = this.s.activity;
    this.emit({ activity: before.filter((e) => e.kind === "session" && e.id === this.sessionId) });
    this.toaster.show(t("Журнал очищен"), { id: "undo", label: t("Вернуть"), run: () => this.emit({ activity: before }) });
  }

  /** В демо системных уведомлений нет — показываем, как бы оно выглядело. */
  // В демо только меняем переключатель: в браузере автозапуска нет.
  async setAutostart(on: boolean) {
    this.emit({ autostart: on });
  }

  updateDesktop(patch: Partial<DesktopSettings>) {
    this.emit({ settings: { ...this.s.settings, desktop: { ...this.s.settings.desktop, ...patch } } });
  }

  async testNotification() {
    this.toast(t("Уведомление: «B-Proxy — уведомления работают»"));
  }

  toastAction() {
    this.toaster.act();
  }

  dismissToast() {
    this.toaster.dismiss();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Пример истории за неделю для показа вкладки «Активность» в демо. */
function demoActivity(): ActivityEntry[] {
  const H = 3_600_000;
  const now = Date.now();
  const list: ActivityEntry[] = [];
  const servers = [t("🇪🇺 Auto | Все серверы"), t("🇩🇪 Германия"), t("🇳🇱 Нидерланды"), t("🇫🇮 Финляндия")];
  // Детерминированно, чтобы скриншоты демо не прыгали.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let day = 0; day < 7; day++) {
    const sessions = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < sessions; k++) {
      const startedAt = now - day * 24 * H - (2 + k * 5 + rnd() * 3) * H;
      const length = (0.3 + rnd() * 3.5) * H;
      const down = Math.round((0.2 + rnd() * 2.5) * 1e9);
      list.push({
        kind: "session",
        id: newId(),
        server: servers[Math.floor(rnd() * (day < 2 ? 2 : servers.length))],
        subscription: "Demo VPN",
        startedAt,
        endedAt: startedAt + length,
        down,
        up: Math.round(down * (0.04 + rnd() * 0.08)),
        end: rnd() < 0.85 ? "manual" : "system",
      });
    }
  }
  list.push({ kind: "subscription", id: newId(), at: now - 26 * H, text: t("Подписки обновлены автоматически") });
  list.push({ kind: "error", id: newId(), at: now - 50 * H, server: t("🇯🇵 Япония"), text: t("Сервер не ответил за 8 секунд. Попробуйте другой сервер") });
  return list.sort((a, b) => (b.kind === "session" ? b.startedAt : b.at) - (a.kind === "session" ? a.startedAt : a.at));
}

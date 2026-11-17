import { newId } from "./activity";
import { Toaster } from "./toaster";
import {
  nodeKey,
  type ActivityEntry,
  type Appearance,
  type Backend,
  type CoreSettings,
  type ServerNode,
  type Settings,
  type Snapshot,
  type Subscription,
} from "./types";


/**
 * Серверы из настоящей подписки BaobabVpn владельца: только названия и транспорт,
 * без адресов и ключей. Пинги не известны, пока не нажать «Проверить пинг».
 */
const v = (id: string, name: string, net: string, sec = "REALITY"): ServerNode => ({
  id,
  name,
  tags: ["VLESS", sec, net],
  pingMs: null,
});

const demoNodes: ServerNode[] = [
  v("auto-all", "🇪🇺 Auto | Все сервера", "GRPC"),
  v("auto-eu", "🇪🇺 Auto | Европа | Азия", "GRPC"),
  v("ru-yt", "🇷🇺 Россия | YouTube без рекламы", "TCP"),
  v("pl", "🇵🇱 Польша", "GRPC"),
  v("fr", "🇫🇷 Франция", "GRPC"),
  v("ee", "🇪🇪 Эстония", "GRPC"),
  v("nl", "🇳🇱 Нидерланды", "TCP"),
  v("de", "🇩🇪 Германия", "TCP"),
  v("us", "🇺🇸 США", "TCP"),
  v("fi", "🇫🇮 Финляндия", "TCP"),
  { id: "div-lte", name: "⬇️ Обходы глушилок | LTE ⬇️", tags: [], pingMs: null, divider: true },
  v("ws-auto", "🇷🇺 Auto | Белые списки | LTE", "GRPC"),
  v("ws-fi1", "🇫🇮 1. Финка | Белые списки | LTE", "TCP"),
  v("ws-fi2", "🇫🇮 2. Финка | Белые списки | LTE", "TCP"),
  v("ws-de1", "🇩🇪 1. Немцы | Белые списки | LTE", "TCP"),
  v("ws-de2", "🇩🇪 2. Немцы | Белые списки | LTE", "TCP"),
  v("ws-ee1", "🇪🇪 1. Эстония | Белые списки | LTE", "XHTTP", "TLS"),
  v("ws-ee2", "🇪🇪 2. Эстония | Белые списки | LTE", "XHTTP", "TLS"),
  v("ws-ee3", "🇪🇪 3. Эстония | Белые списки | LTE", "XHTTP", "TLS"),
  v("ws-ee4", "🇪🇪 4. Эстония | Белые списки | LTE", "XHTTP", "TLS"),
  v("ws-ee5", "🇪🇪 5. Эстония | Белые списки | LTE", "XHTTP", "TLS"),
];

// Заголовки как в настоящей подписке владельца (без ссылки и ключей).
const demoSub: Subscription = {
  url: "https://sub.baobabproxy.com/demo",
  title: "BoababVpn",
  plan: "Безлимит",
  nodes: demoNodes,
  usedBytes: 350_686_443_037,
  totalBytes: 0,
  expireAt: 1_855_050_020_000,
  announce:
    "BaobabVPN - корни свободы в интернете ❤️\nДней до окончания подписки - 696 📅\n\n❗️Если не работает, обновите подписку или попробуйте другие варианты ❗️",
  supportUrl: "https://t.me/baobabvpnsupport",
  webPageUrl: "https://baobabproxy.com",
  updatedAt: Date.now() - 3 * 3600_000,
};

export const defaultCore: CoreSettings = {
  memoryLimitMb: 30,
  noLimitMode: false,
  idleTimeoutSec: 300,
  sniffing: true,
  routeOnly: true,
  mtu: 0,
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
};

export const defaultSettings: Settings = {
  russianSitesDirect: true,
  tlsFragment: false,
  blockAds: false,
  ipv6: false,
  dnsServer: "1.1.1.1",
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
      toast: null,
      version: { app: "0.1.0", xray: "26.11.9" },
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
    this.toaster.show("Изменения вступят в силу после переподключения", {
      id: "reconnect",
      label: "Переподключить",
      run: () => void this.reconnect(),
    });
  }

  private async reconnect() {
    await this.toggle();
    await this.toggle();
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
      this.emit({ error: "Сначала добавьте подписку" });
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
      this.toast(`Переключаемся: ${this.s.current.node.name}`);
      await this.reconnect();
    }
  }

  toggleFavorite(key: string) {
    const has = this.s.favorites.includes(key);
    this.emit({ favorites: has ? this.s.favorites.filter((k) => k !== key) : [...this.s.favorites, key] });
  }

  async addSubscription(url: string) {
    if (!/^https?:\/\//.test(url.trim())) {
      throw new Error("Ссылка должна начинаться с https://");
    }
    await wait(900);
    const sub = { ...structuredClone(demoSub), url: url.trim(), updatedAt: Date.now() };
    this.emit({ subscriptions: [sub, ...this.s.subscriptions.filter((x) => x.url !== sub.url)] });
    this.toast("Подписка добавлена");
    // Сразу меряем пинг, чтобы автовыбор знал лучший сервер.
    void this.pingAll(true);
  }

  async refreshSubscriptions() {
    await wait(700);
    this.emit({ subscriptions: this.s.subscriptions.map((x) => ({ ...x, updatedAt: Date.now() })) });
    this.toast("Подписки обновлены");
  }

  async removeSubscription(url: string) {
    const before = { subscriptions: this.s.subscriptions, selected: this.s.selected };
    const sub = before.subscriptions.find((x) => x.url === url);
    this.emit({
      subscriptions: before.subscriptions.filter((x) => x.url !== url),
      selected: before.selected?.subUrl === url ? null : before.selected,
    });
    this.toaster.show(`Подписка «${sub?.title ?? "без названия"}» удалена`, {
      id: "undo",
      label: "Вернуть",
      run: () => this.emit(before),
    });
  }

  async pingAll(quiet = false) {
    if (this.s.state !== "disconnected" || this.s.pinging) return;
    this.emit({ pinging: true });
    await wait(1200);
    const subscriptions = this.s.subscriptions.map((sub) => ({
      ...sub,
      nodes: sub.nodes.map((n) =>
        n.divider ? n : { ...n, pingMs: n.id === "us" ? -1 : Math.round(15 + Math.random() * 180) },
      ),
    }));
    this.emit({ subscriptions, pinging: false });
    if (!quiet) this.toast("Пинг обновлён");
  }

  async updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
    this.offerReconnect();
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
    this.toaster.show("Настройки сброшены", {
      id: "undo",
      label: "Вернуть",
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
    const t = new Date().toISOString().slice(0, 19).replace("T", " ");
    return which === "app"
      ? `${t}Z INFO  [plugin] B-Proxy 0.1.0 запущен: windows x86_64\n${t}Z INFO  [ui] Подключение: 🇵🇱 Польша [VLESS/REALITY/GRPC]\n${t}Z INFO  [vpn] VPN подключён за 1840 мс`
      : `${t} [Info] Xray 26.11.9 started\n${t} [Info] [tun] interface B-Proxy created`;
  }

  async openLogsFolder() {
    return false;
  }

  clearActivity() {
    const before = this.s.activity;
    this.emit({ activity: before.filter((e) => e.kind === "session" && e.id === this.sessionId) });
    this.toaster.show("Журнал очищен", { id: "undo", label: "Вернуть", run: () => this.emit({ activity: before }) });
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
  const servers = ["🇪🇺 Auto | Все сервера", "🇵🇱 Польша", "🇫🇷 Франция", "🇷🇺 Россия | YouTube без рекламы"];
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
        subscription: "BaobabVPN",
        startedAt,
        endedAt: startedAt + length,
        down,
        up: Math.round(down * (0.04 + rnd() * 0.08)),
        end: rnd() < 0.85 ? "manual" : "system",
      });
    }
  }
  list.push({ kind: "subscription", id: newId(), at: now - 26 * H, text: "Подписки обновлены автоматически" });
  list.push({ kind: "error", id: newId(), at: now - 50 * H, server: "🇫🇷 Франция", text: "Сервер не ответил за 8 секунд. Попробуйте другой сервер" });
  return list.sort((a, b) => (b.kind === "session" ? b.startedAt : b.at) - (a.kind === "session" ? a.startedAt : a.at));
}

import {
  nodeKey,
  type Appearance,
  type Backend,
  type CoreSettings,
  type ServerNode,
  type Settings,
  type Snapshot,
  type Subscription,
} from "./types";

const GB = 1024 ** 3;

const demoNodes: ServerNode[] = [
  { id: "de", name: "🇩🇪 Германия · Франкфурт", tags: ["VLESS", "REALITY", "XHTTP"], pingMs: 42 },
  { id: "fi", name: "🇫🇮 Финляндия · Хельсинки", tags: ["VLESS", "TLS", "XHTTP"], pingMs: 31 },
  { id: "nl", name: "🇳🇱 Нидерланды · Амстердам", tags: ["VLESS", "REALITY", "TCP"], pingMs: 76 },
  { id: "ru", name: "🇷🇺 Белые списки · LTE", tags: ["VLESS", "REALITY", "GRPC"], pingMs: 18 },
  { id: "se", name: "🇸🇪 Швеция · Cloudflare", tags: ["VLESS", "TLS", "WS"], pingMs: 185 },
  { id: "lv", name: "🇱🇻 Латвия · Hysteria2", tags: ["HYSTERIA2", "TLS"], pingMs: 96 },
  { id: "us", name: "🇺🇸 США · 10 Гбит", tags: ["TROJAN", "TLS", "GRPC"], pingMs: -1 },
];

// Сроки и трафик — как в настоящей подписке BaobabVpn владельца (без ссылки и ключей);
// серверы пока тестовые: Remnawave не отдаёт их список браузеру.
const demoSub: Subscription = {
  url: "https://sub.baobabproxy.com/demo",
  title: "BaobabVpn",
  plan: "Безлимит",
  nodes: demoNodes,
  usedBytes: 326.41 * GB,
  totalBytes: 0,
  expireAt: Date.parse("2028-10-13T11:40:20Z"),
  announce: null,
  supportUrl: "https://t.me/baobabvpn_bot",
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
  private toastTimer: number | undefined;
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
    window.clearTimeout(this.toastTimer);
    this.emit({ toast: text });
    this.toastTimer = window.setTimeout(() => this.emit({ toast: null }), 2200);
  }

  private recompute() {
    const all = this.s.subscriptions.flatMap((sub) => sub.nodes.map((node) => ({ sub, node })));
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
      this.emit({ state: "disconnected", connectedAt: null, downSpeed: null, upSpeed: null });
      return;
    }
    if (!this.s.current) {
      this.emit({ error: "Сначала добавьте подписку" });
      return;
    }
    this.emit({ state: "connecting", error: null });
    await wait(1400);
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
  }

  async refreshSubscriptions() {
    await wait(700);
    this.emit({ subscriptions: this.s.subscriptions.map((x) => ({ ...x, updatedAt: Date.now() })) });
    this.toast("Подписки обновлены");
  }

  async removeSubscription(url: string) {
    this.emit({ subscriptions: this.s.subscriptions.filter((x) => x.url !== url), selected: null });
    this.toast("Подписка удалена");
  }

  async pingAll() {
    if (this.s.state !== "disconnected") return;
    this.emit({ pinging: true });
    await wait(1200);
    const subscriptions = this.s.subscriptions.map((sub) => ({
      ...sub,
      nodes: sub.nodes.map((n) => ({
        ...n,
        pingMs: n.id === "us" ? -1 : Math.round(15 + Math.random() * 180),
      })),
    }));
    this.emit({ subscriptions, pinging: false });
    this.toast("Пинг обновлён");
  }

  async updateSettings(patch: Partial<Omit<Settings, "core" | "appearance">>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
  }

  async updateCore(patch: Partial<CoreSettings>) {
    this.emit({ settings: { ...this.s.settings, core: { ...this.s.settings.core, ...patch } } });
  }

  updateAppearance(patch: Partial<Appearance>) {
    const appearance = { ...this.s.settings.appearance, ...patch };
    this.emit({ settings: { ...this.s.settings, appearance } });
    try {
      // Картинку не сохраняем: она может быть больше лимита хранилища.
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...appearance, backgroundImage: null }));
    } catch {
      // Не сохранилось — ничего страшного, действует до перезагрузки.
    }
  }

  async resetSettings() {
    try {
      localStorage.removeItem(APPEARANCE_KEY);
    } catch {
      // Хранилище недоступно.
    }
    this.emit({ settings: structuredClone(defaultSettings) });
    this.toast("Настройки сброшены");
  }

  clearError() {
    this.emit({ error: null });
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

import type { Backend, ServerNode, Settings, Snapshot, Subscription } from "./types";

const GB = 1024 ** 3;

const demoNodes: ServerNode[] = [
  { id: "nl", name: "🇳🇱 Нидерланды", protocol: "vless", transport: "VLESS Reality", pingMs: 42 },
  { id: "de", name: "🇩🇪 Германия", protocol: "vless", transport: "VLESS Reality", pingMs: 55 },
  { id: "fi", name: "🇫🇮 Финляндия", protocol: "hysteria", transport: "Hysteria2", pingMs: 96 },
  { id: "ru", name: "🇷🇺 Белые списки", protocol: "vless", transport: "Через балансировщик", pingMs: 18 },
  { id: "tr", name: "🇹🇷 Турция", protocol: "trojan", transport: "Trojan", pingMs: 171 },
  { id: "us", name: "🇺🇸 США", protocol: "vless", transport: "VLESS XHTTP", pingMs: -1 },
];

const demoSub: Subscription = {
  url: "https://sub.baobabproxy.com/demo",
  title: "BaobabVPN",
  nodes: demoNodes,
  usedBytes: 38 * GB,
  totalBytes: 100 * GB,
  expireAt: Date.now() + 29 * 24 * 3600 * 1000,
  announce: null,
  supportUrl: "https://t.me/baobabvpn_bot",
  webPageUrl: "https://baobabproxy.com",
};

/** Бэкенд для показа дизайна в браузере: ведёт себя как настоящий, но ничего не подключает. */
export class DemoBackend implements Backend {
  private listeners = new Set<(s: Snapshot) => void>();
  private ticker: number | undefined;
  private s: Snapshot;

  constructor(empty = false) {
    const subs = empty ? [] : [structuredClone(demoSub)];
    this.s = {
      state: "disconnected",
      connectedAt: null,
      subscriptions: subs,
      selected: null,
      current: null,
      settings: {
        russianSitesDirect: true,
        tlsFragment: false,
        blockAds: false,
        ipv6: false,
        dnsServer: "1.1.1.1",
      },
      downSpeed: null,
      upSpeed: null,
      error: null,
      pinging: false,
    };
    this.recompute();
  }

  subscribe(listener: (s: Snapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return this.s;
  }

  private emit(patch: Partial<Snapshot> = {}) {
    this.s = { ...this.s, ...patch };
    this.recompute();
    for (const l of this.listeners) l(this.s);
  }

  private recompute() {
    const all = this.s.subscriptions.flatMap((sub) => sub.nodes.map((node) => ({ sub, node })));
    let current = null as Snapshot["current"];
    if (this.s.selected) {
      current =
        all.find((p) => p.sub.url === this.s.selected!.subUrl && p.node.id === this.s.selected!.nodeId) ??
        null;
    }
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
      await wait(500);
      window.clearInterval(this.ticker);
      this.emit({ state: "disconnected", connectedAt: null, downSpeed: null, upSpeed: null });
      return;
    }
    if (!this.s.current) {
      this.emit({ error: "Сначала добавьте подписку" });
      return;
    }
    this.emit({ state: "connecting", error: null });
    await wait(1600);
    this.emit({ state: "connected", connectedAt: Date.now(), downSpeed: 0, upSpeed: 0 });
    this.ticker = window.setInterval(() => {
      this.emit({
        downSpeed: Math.round(1.5e6 + Math.random() * 4e6),
        upSpeed: Math.round(1e5 + Math.random() * 3e5),
      });
    }, 1000);
  }

  async select(target: { subUrl: string; nodeId: string } | null) {
    this.emit({ selected: target });
  }

  async addSubscription(url: string) {
    if (!/^https?:\/\//.test(url.trim())) {
      throw new Error("Ссылка должна начинаться с https://");
    }
    await wait(900);
    const sub = { ...structuredClone(demoSub), url: url.trim() };
    this.emit({ subscriptions: [sub, ...this.s.subscriptions.filter((x) => x.url !== sub.url)] });
  }

  async refreshSubscriptions() {
    await wait(700);
    this.emit({});
  }

  async removeSubscription(url: string) {
    this.emit({ subscriptions: this.s.subscriptions.filter((x) => x.url !== url), selected: null });
  }

  async pingAll() {
    if (this.s.state !== "disconnected") return;
    this.emit({ pinging: true });
    await wait(1200);
    const subscriptions = this.s.subscriptions.map((sub) => ({
      ...sub,
      nodes: sub.nodes.map((n) => ({
        ...n,
        pingMs: n.id === "us" ? -1 : Math.round(15 + Math.random() * 160),
      })),
    }));
    this.emit({ subscriptions, pinging: false });
  }

  async updateSettings(patch: Partial<Settings>) {
    this.emit({ settings: { ...this.s.settings, ...patch } });
  }

  clearError() {
    this.emit({ error: null });
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

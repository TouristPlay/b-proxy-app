import type { Settings } from "./types";
import { profileDns, profileRules } from "./routing";
import { mainOutbound, type NodeConfig, type Outbound, type ProviderFragment, type Rule } from "./subscription";

/** Платформа, на которой работает приложение. */
export type Platform = "android" | "ios" | "windows" | "macos" | "linux";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPad с «версией для компьютера» притворяется Mac, но у него есть сенсорный экран.
  if (/Macintosh|Mac OS X/i.test(ua)) return navigator.maxTouchPoints > 1 ? "ios" : "macos";
  if (/Windows/i.test(ua)) return "windows";
  return "linux";
}

export const isMobile = (p: Platform) => p === "android" || p === "ios";

/**
 * Адреса внутри туннеля. DNS 172.19.0.2 отвечает сам Xray.
 * Те же адреса заданы в BProxyVpnService.kt и PacketTunnelProvider.swift.
 */
const TUN_GATEWAY4 = "172.19.0.1/30";
const TUN_GATEWAY6 = "fdfe:dcba:9876::1/126";
const TUN_DNS = "172.19.0.2";

/** Имя интерфейса на компьютерах — его же ищет счётчик трафика в desktop.rs. */
const TUN_NAME: Record<Platform, string> = {
  windows: "B-Proxy",
  linux: "bproxy0",
  macos: "utun199",
  android: "xray0",
  ios: "xray0",
};

const PRIVATE_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "127.0.0.0/8",
  "100.64.0.0/10",
  "fc00::/7",
  "fe80::/10",
  "::1/128",
];

const AD_DOMAINS = [
  "domain:doubleclick.net",
  "domain:googlesyndication.com",
  "domain:googleadservices.com",
  "domain:adservice.google.com",
  "domain:an.yandex.ru",
  "domain:adfox.ru",
  "domain:mc.yandex.ru",
];

/**
 * Конфиг для pingBatch: outbound «proxy» и всё, через что он соединяется.
 * У «Auto» меряем главный сервер.
 */
export function buildPingConfig(node: NodeConfig): string {
  const main = mainOutbound(node);
  const others = node.outbounds.filter((o) => o !== main && o.tag !== "proxy");
  return JSON.stringify({ outbounds: [{ ...main, tag: "proxy" }, ...others] });
}

/** Строка DNS из настроек → список серверов Xray: адреса, DoH (https://), tcp://, quic://. */
export function dnsServers(raw: string): string[] {
  const list = raw
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (list.length === 0) return ["1.1.1.1", "8.8.8.8"];
  // Один простой адрес — добавим запасной, чтобы DNS не пропал вместе с ним.
  return list.length === 1 && !list[0].includes("://") ? [...new Set([list[0], "8.8.8.8"])] : list;
}

/**
 * Исключения пользователя → правило «напрямую»: IP и подсети — в ip, остальное — домены.
 * Можно писать с префиксами Xray (domain:, full:, regexp:, keyword:) или просто example.com.
 */
export function exclusionRules(list: string[]): Rule[] {
  const ip: string[] = [];
  const domain: string[] = [];
  for (const raw of list) {
    const x = raw.trim();
    if (!x || x.startsWith("#")) continue;
    if (/^[0-9.]+(\/\d+)?$/.test(x) || (/^[0-9a-f:]+(\/\d+)?$/i.test(x) && x.includes(":"))) ip.push(x);
    else if (/^(domain|full|regexp|keyword|geosite|ext):/.test(x)) domain.push(x);
    else domain.push(`domain:${x.replace(/^\*\./, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`);
  }
  return [
    ...(domain.length ? [{ type: "field", domain, outboundTag: "direct" }] : []),
    ...(ip.length ? [{ type: "field", ip, outboundTag: "direct" }] : []),
  ];
}

/**
 * Mux: только там, где он совместим. С XTLS Vision (flow) и XHTTP (у него своё
 * мультиплексирование) Mux ломает соединение — такие серверы не трогаем.
 */
function withMux(o: Outbound, concurrency: number): Outbound {
  if (!["vless", "vmess", "trojan", "shadowsocks"].includes(String(o.protocol))) return o;
  const settings = (o.settings ?? {}) as { vnext?: { users?: { flow?: string }[] }[] };
  const flow = settings.vnext?.some((v) => v.users?.some((u) => u.flow));
  const network = (o.streamSettings as { network?: string } | undefined)?.network;
  if (flow || network === "xhttp" || network === "splithttp") return o;
  return { ...o, mux: { enabled: true, concurrency, xudpConcurrency: 16, xudpProxyUDP443: "reject" } };
}

/** Протоколы серверов: к ним применяется фрагментация. */
const SERVER_PROTOCOLS = new Set(["vless", "vmess", "trojan", "shadowsocks", "socks", "http", "hysteria2", "hysteria"]);

/**
 * Правила провайдера без ссылок на geosite/geoip: у нас нет его файлов баз,
 * и без них ядро не запустится. Списки доменов и адресов остаются.
 */
function providerRules(rules: Rule[] | undefined): Rule[] {
  const result: Rule[] = [];
  for (const rule of rules ?? []) {
    const r = { ...rule };
    let empty = false;
    for (const key of ["domain", "ip"]) {
      const list = r[key];
      if (!Array.isArray(list)) continue;
      const kept = list.filter((x) => typeof x === "string" && !/^(geosite|geoip|ext|ext-domain|ext-ip):/.test(x));
      if (kept.length === 0) empty = true;
      r[key] = kept;
    }
    if (!empty) result.push(r);
  }
  return result;
}

/** Правило «всё остальное» провайдера: network tcp,udp без других условий. */
function isCatchAll(rule: Rule): boolean {
  const keys = Object.keys(rule).filter((k) => k !== "type" && k !== "outboundTag" && k !== "balancerTag" && k !== "ruleTag");
  return keys.length === 1 && keys[0] === "network";
}

/** Полный конфиг Xray для режима VPN: весь трафик системы через TUN. */
export function buildConfig(
  node: NodeConfig,
  s: Settings,
  platform: Platform,
  providerFragment: ProviderFragment | null,
  /** Файл журнала ядра (logs/xray.log). На iOS ядро в расширении, туда пути нет — пишет в системный журнал. */
  logFile?: string | null,
  /** Папка с geoip.dat / geosite.dat для профиля маршрутизации. */
  geoDir?: string | null,
  /** Порт служебного SOCKS-входа для проверки скорости (только 127.0.0.1). */
  probePort?: number | null,
): string {
  const core = s.core;
  const profile = activeProfile(s);
  const useFragment = s.tlsFragment || providerFragment != null;
  const fragment = {
    packets: providerFragment?.packets ?? "tlshello",
    length: providerFragment?.length ?? "100-200",
    interval: providerFragment?.interval ?? "10-20",
  };

  // Настройки «Ядро Xray» → переменные окружения ядра (core/memory/memory.go).
  // Лимит памяти нужен там, где систему ограничивает память VPN, то есть на телефонах.
  const env: Record<string, string> = {};
  if (isMobile(platform)) env.BPROXY_MEMORY_LIMIT_MB = String(core.memoryLimitMb);
  if (core.noLimitMode) env.BPROXY_AGGRESSIVE_GC = "1";
  // Базы geoip/geosite профиля маршрутизации ядро ищет в этой папке.
  if (profile && geoDir) env["xray.location.asset"] = geoDir;

  // Outbound'ы провайдера плюс наши служебные, если их нет.
  const outbounds: Outbound[] = node.outbounds.map((raw) => {
    const o = core.mux ? withMux(raw, core.muxConcurrency) : raw;
    if (!useFragment || !SERVER_PROTOCOLS.has(String(o.protocol))) return o;
    // Соединение до сервера идёт через outbound «fragment».
    const stream = { ...((o.streamSettings as Record<string, unknown>) ?? {}) };
    const sockopt = (stream.sockopt as Record<string, unknown>) ?? {};
    if (sockopt.dialerProxy) return o;
    stream.sockopt = { ...sockopt, dialerProxy: "fragment" };
    return { ...o, streamSettings: stream };
  });
  const has = (tag: string) => outbounds.some((o) => o.tag === tag);
  if (!has("direct")) outbounds.push({ tag: "direct", protocol: "freedom" });
  // С IPv6: какой адрес пробовать первым для сайтов, которые идут напрямую.
  if (s.ipv6) {
    const i = outbounds.findIndex((o) => o.tag === "direct" && o.protocol === "freedom");
    const direct = outbounds[i];
    const stream = (direct.streamSettings as Record<string, unknown>) ?? {};
    outbounds[i] = {
      ...direct,
      streamSettings: {
        ...stream,
        sockopt: { ...((stream.sockopt as object) ?? {}), domainStrategy: s.network.preferIpv6 ? "UseIPv6v4" : "UseIPv4v6" },
      },
    };
  }
  if (!has("block")) outbounds.push({ tag: "block", protocol: "blackhole" });
  outbounds.push({ tag: "dns-out", protocol: "dns" });
  if (useFragment) outbounds.push({ tag: "fragment", protocol: "freedom", settings: { fragment } });

  // Куда идёт всё остальное: балансировщик «Auto» или сервер «proxy».
  const theirs = providerRules(node.rules);
  const catchAll = theirs.find(isCatchAll) ?? { type: "field", network: "tcp,udp", outboundTag: "proxy" };
  const middle = theirs.filter((r) => !isCatchAll(r));
  // Профиль маршрутизации заменяет «РФ напрямую», «Блокировать рекламу» и DNS из настроек.
  const fromProfile = profile ? profileRules(profile, catchAll) : null;
  const profileDnsConfig = profile ? profileDns(profile) : null;

  const config = {
    // Журнал доступа (какие сайты открывались) не ведём никогда — только ошибки и события ядра.
    log: { loglevel: core.logLevel, access: "none", ...(logFile && core.logLevel !== "none" ? { error: logFile } : {}) },
    env,
    policy: {
      levels: { "0": { connIdle: core.idleTimeoutSec, handshake: 8, uplinkOnly: 2, downlinkOnly: 5 } },
    },
    dns: {
      ...(profileDnsConfig ?? { servers: dnsServers(s.dnsServer) }),
      queryStrategy: s.ipv6 ? "UseIP" : "UseIPv4",
    },
    inbounds: [
      tunInbound(s, platform),
      ...proxyInbounds(s, platform),
      ...(probePort ? [{ tag: "probe-in", listen: "127.0.0.1", port: probePort, protocol: "socks", settings: { udp: false, auth: "noauth" } }] : []),
    ],
    outbounds,
    ...(node.observatory ? { observatory: node.observatory } : {}),
    ...(node.burstObservatory ? { burstObservatory: node.burstObservatory } : {}),
    routing: {
      domainStrategy: profile?.domainStrategy ?? "IPIfNonMatch",
      ...(node.balancers?.length ? { balancers: node.balancers } : {}),
      rules: [
        // Проверка скорости всегда идёт через сервер, мимо правил «напрямую».
        ...(probePort ? [probeRule(catchAll)] : []),
        { type: "field", inboundTag: ["tun-in"], port: "53", outboundTag: "dns-out" },
        ...(s.blockAds && !profile ? [{ type: "field", domain: AD_DOMAINS, outboundTag: "block" }] : []),
        ...(s.network.lanDirect ? [{ type: "field", ip: PRIVATE_CIDRS, outboundTag: "direct" }] : []),
        ...exclusionRules(s.network.exclusions),
        ...(fromProfile?.rules ?? []),
        ...(s.russianSitesDirect && !profile
          ? [
              {
                type: "field",
                domain: ["regexp:\\.ru$", "regexp:\\.su$", "regexp:\\.xn--p1ai$"],
                outboundTag: "direct",
              },
            ]
          : []),
        ...middle,
        fromProfile?.final ?? catchAll,
      ],
    },
  };
  return JSON.stringify(config);
}

function probeRule(catchAll: Record<string, unknown>) {
  const target = catchAll.balancerTag ? { balancerTag: catchAll.balancerTag } : { outboundTag: catchAll.outboundTag ?? "proxy" };
  return { type: "field", inboundTag: ["probe-in"], ...target };
}

/**
 * Локальный прокси на компьютере: SOCKS5 на порту из настроек, HTTP — на следующем.
 * Трафик через них идёт по тем же правилам, что и через туннель.
 */
function proxyInbounds(s: Settings, platform: Platform) {
  const p = s.localProxy;
  if (!p.enabled || isMobile(platform)) return [];
  const listen = p.lan ? "0.0.0.0" : "127.0.0.1";
  const sniffing = { enabled: s.core.sniffing, destOverride: ["http", "tls", "quic"], routeOnly: s.core.routeOnly };
  return [
    { tag: "socks-in", listen, port: p.port, protocol: "socks", settings: { udp: true, auth: "noauth" }, sniffing },
    { tag: "http-in", listen, port: p.port + 1, protocol: "http", settings: {}, sniffing },
  ];
}

function tunInbound(s: Settings, platform: Platform) {
  const core = s.core;
  const settings: Record<string, unknown> = {
    name: TUN_NAME[platform],
    mtu: core.mtu > 0 ? core.mtu : 1500,
  };
  if (!isMobile(platform)) {
    // На телефонах туннель и маршруты создаёт система (VpnService / Network Extension),
    // а нативный код кладёт дескриптор в env "xray.tun.fd". На компьютерах — сам Xray.
    settings.gateway = [TUN_GATEWAY4, ...(s.ipv6 ? [TUN_GATEWAY6] : [])];
    settings.dns = [TUN_DNS];
    settings.autoSystemRoutingTable = ["0.0.0.0/0", ...(s.ipv6 ? ["::/0"] : [])];
    if (platform === "windows") settings.autoSystemWfpBlockLeak = ["dns", "misconfigtun"];
  }
  return {
    tag: "tun-in",
    port: 0,
    protocol: "tun",
    settings,
    sniffing: {
      enabled: core.sniffing,
      destOverride: ["http", "tls", "quic"],
      routeOnly: core.routeOnly,
    },
  };
}

/** Профиль маршрутизации, если он включён и выбран. */
export function activeProfile(s: Settings) {
  const r = s.routing;
  return r.enabled ? (r.profiles.find((p) => p.id === r.activeId) ?? null) : null;
}

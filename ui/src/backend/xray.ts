import type { Settings } from "./types";
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
): string {
  const core = s.core;
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

  // Outbound'ы провайдера плюс наши служебные, если их нет.
  const outbounds: Outbound[] = node.outbounds.map((o) => {
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
  if (!has("block")) outbounds.push({ tag: "block", protocol: "blackhole" });
  outbounds.push({ tag: "dns-out", protocol: "dns" });
  if (useFragment) outbounds.push({ tag: "fragment", protocol: "freedom", settings: { fragment } });

  // Куда идёт всё остальное: балансировщик «Auto» или сервер «proxy».
  const theirs = providerRules(node.rules);
  const catchAll = theirs.find(isCatchAll) ?? { type: "field", network: "tcp,udp", outboundTag: "proxy" };
  const middle = theirs.filter((r) => !isCatchAll(r));

  const config = {
    log: { loglevel: core.logLevel },
    env,
    policy: {
      levels: { "0": { connIdle: core.idleTimeoutSec, handshake: 8, uplinkOnly: 2, downlinkOnly: 5 } },
    },
    dns: {
      servers: [s.dnsServer || "1.1.1.1", "8.8.8.8"],
      queryStrategy: s.ipv6 ? "UseIP" : "UseIPv4",
    },
    inbounds: [tunInbound(s, platform)],
    outbounds,
    ...(node.observatory ? { observatory: node.observatory } : {}),
    ...(node.burstObservatory ? { burstObservatory: node.burstObservatory } : {}),
    routing: {
      domainStrategy: "IPIfNonMatch",
      ...(node.balancers?.length ? { balancers: node.balancers } : {}),
      rules: [
        { type: "field", inboundTag: ["tun-in"], port: "53", outboundTag: "dns-out" },
        ...(s.blockAds ? [{ type: "field", domain: AD_DOMAINS, outboundTag: "block" }] : []),
        { type: "field", ip: PRIVATE_CIDRS, outboundTag: "direct" },
        ...(s.russianSitesDirect
          ? [
              {
                type: "field",
                domain: ["regexp:\\.ru$", "regexp:\\.su$", "regexp:\\.xn--p1ai$"],
                outboundTag: "direct",
              },
            ]
          : []),
        ...middle,
        catchAll,
      ],
    },
  };
  return JSON.stringify(config);
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

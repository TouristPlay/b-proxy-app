import type { RoutingProfile } from "./types";
import type { Rule } from "./subscription";

/**
 * Профили маршрутизации в формате Happ/INCY (RoscomVPN и подобные).
 * Принимаем диплинк happ://routing/onadd/<base64>, incy://…, bproxy://…, JSON или base64 JSON.
 */
export function decodeProfile(input: string, source: string | null = null): RoutingProfile {
  const text = input.trim();
  let json: unknown;
  const deep = /^[a-z][a-z0-9+.-]*:\/\/routing\/(?:on)?add\/(.+)$/i.exec(text);
  try {
    if (deep) json = JSON.parse(fromBase64(decodeURIComponent(deep[1])));
    else if (text.startsWith("{")) json = JSON.parse(text);
    else json = JSON.parse(fromBase64(text));
  } catch {
    throw new Error("Это не профиль маршрутизации. Вставьте ссылку happ://routing/…, incy://routing/… или JSON профиля");
  }
  if (!json || typeof json !== "object") throw new Error("Профиль пустой");
  const p = json as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : "");
  const dns = (kind: string, domain: string, ip: string) => (/doh/i.test(kind) && domain ? domain : ip || domain);
  const profile: RoutingProfile = {
    id: `rp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: str("Name") || "Профиль маршрутизации",
    source,
    directSites: list("DirectSites"),
    directIp: list("DirectIp"),
    proxySites: list("ProxySites"),
    proxyIp: list("ProxyIp"),
    blockSites: list("BlockSites"),
    blockIp: list("BlockIp"),
    globalProxy: String(p.GlobalProxy ?? "true") !== "false",
    routeOrder: str("RouteOrder") || "block-proxy-direct",
    domainStrategy: ["AsIs", "IPIfNonMatch", "IPOnDemand"].includes(str("DomainStrategy")) ? str("DomainStrategy") : "IPIfNonMatch",
    remoteDns: dns(str("RemoteDNSType"), str("RemoteDNSDomain"), str("RemoteDNSIP") || str("RemoteDns")),
    domesticDns: dns(str("DomesticDNSType"), str("DomesticDNSDomain"), str("DomesticDNSIP") || str("DomesticDns")),
    dnsHosts: p.DnsHosts && typeof p.DnsHosts === "object" ? (p.DnsHosts as Record<string, string>) : {},
    geoipUrl: str("Geoipurl"),
    geositeUrl: str("Geositeurl"),
    addedAt: Date.now(),
  };
  const rules = profile.directSites.length + profile.directIp.length + profile.proxySites.length + profile.proxyIp.length + profile.blockSites.length + profile.blockIp.length;
  if (rules === 0 && profile.globalProxy) throw new Error("В профиле нет ни одного правила");
  return profile;
}

function fromBase64(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Профилю нужны базы, если в нём есть geosite:/geoip:. */
export function needsGeo(p: RoutingProfile) {
  const all = [...p.directSites, ...p.directIp, ...p.proxySites, ...p.proxyIp, ...p.blockSites, ...p.blockIp];
  return { geosite: all.some((x) => x.startsWith("geosite:")), geoip: all.some((x) => x.startsWith("geoip:")) };
}

/** Записи сайтов: geosite:, domain:, full:, regexp:, keyword: — как есть, просто «example.com» — domain:. */
const site = (x: string) => (/^(geosite|domain|full|regexp|keyword|ext):/.test(x) ? x : `domain:${x}`);

/**
 * Правила профиля для routing.rules. target — куда идёт «через VPN»: тот же выход,
 * что у правила провайдера «всё остальное» (сервер или балансировщик «Auto»).
 */
export function profileRules(p: RoutingProfile, target: Rule): { rules: Rule[]; final: Rule } {
  const via = { ...(target.balancerTag ? { balancerTag: target.balancerTag } : { outboundTag: target.outboundTag ?? "proxy" }) };
  const group = (sites: string[], ips: string[], to: Record<string, unknown>): Rule[] => [
    ...(sites.length ? [{ type: "field", domain: sites.map(site), ...to }] : []),
    ...(ips.length ? [{ type: "field", ip: ips, ...to }] : []),
  ];
  const groups: Record<string, Rule[]> = {
    block: group(p.blockSites, p.blockIp, { outboundTag: "block" }),
    proxy: group(p.proxySites, p.proxyIp, via),
    direct: group(p.directSites, p.directIp, { outboundTag: "direct" }),
  };
  const order = p.routeOrder.split("-").filter((x) => x in groups);
  for (const k of ["block", "proxy", "direct"]) if (!order.includes(k)) order.push(k);
  return {
    rules: order.flatMap((k) => groups[k]),
    final: p.globalProxy ? { type: "field", network: "tcp,udp", ...via } : { type: "field", network: "tcp,udp", outboundTag: "direct" },
  };
}

/**
 * DNS профиля: сайты «напрямую» спрашиваем у домашнего DNS в обход туннеля (https+local),
 * остальное — у удалённого через VPN.
 */
export function profileDns(p: RoutingProfile): { servers: unknown[]; hosts?: Record<string, string> } | null {
  if (!p.remoteDns && !p.domesticDns) return null;
  const local = (a: string) => a.replace(/^https:\/\//, "https+local://");
  const directDomains = p.directSites.filter((x) => /^(geosite|domain|full):/.test(x) || !x.includes(":")).map(site);
  const servers: unknown[] = [];
  if (p.domesticDns && directDomains.length) servers.push({ address: local(p.domesticDns), domains: directDomains, skipFallback: true });
  servers.push(p.remoteDns || "1.1.1.1");
  return { servers, ...(Object.keys(p.dnsHosts).length ? { hosts: p.dnsHosts } : {}) };
}

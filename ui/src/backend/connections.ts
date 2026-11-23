/**
 * Журнал соединений: разбор журнала доступа Xray (access + dnsLog).
 *
 * Ядро пишет две строки разных видов:
 *   2026/11/20 10:00:00.123456 from 172.19.0.1:50000 accepted tcp:142.250.1.1:443 [tun-in >> proxy]
 *   2026/11/20 10:00:00.120000 localhost got answer: www.google.com. -> [142.250.1.1, 142.250.1.2] 12ms
 * TUN видит только IP, поэтому имя сайта находим по ответам DNS, которые прошли через ядро.
 */

export type ConnectionRoute = "vpn" | "direct" | "block";

export interface Connection {
  /** Сайт (домен) или IP, если имени не нашлось. */
  host: string;
  /** IP, если сайт узнали по DNS. */
  ip: string | null;
  port: number;
  network: "tcp" | "udp";
  route: ConnectionRoute;
  /** Тег выхода Xray: proxy, direct, block, балансировщик провайдера. */
  outbound: string;
  count: number;
  /** Время последнего соединения, мс. */
  last: number;
}

const LINE = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))? (.*)$/;
const ACCESS = /^from (\S+) (accepted|rejected) (?:(tcp|udp):)?(\S+):(\d+)(?: \[([^\]]+)\])?/;
const DNS = /(?:got answer:|cache HIT:|cache OPTIMISTE:) (\S+?)\.? -> \[([^\]]*)\]/;

function routeOf(outbound: string): ConnectionRoute {
  const tag = outbound.toLowerCase();
  if (/^(direct|freedom|bypass)/.test(tag)) return "direct";
  if (/^(block|reject|blackhole)/.test(tag)) return "block";
  return "vpn";
}

/** Выход из «tun-in >> proxy», «tun-in -> auto», «tun-in ==> proxy» или просто «proxy». */
function outboundOf(detour: string | undefined) {
  if (!detour) return "";
  const parts = detour.split(/\s+(?:>>|->|==>)\s+/);
  return parts[parts.length - 1].trim();
}

const isMulticast = (ip: string) =>
  /^(22[4-9]|23\d)\./.test(ip) || ip === "255.255.255.255" || ip.toLowerCase().startsWith("ff");

const bare = (host: string) => host.replace(/^\[|\]$/g, "").toLowerCase();
const isIp = (host: string) => /^[\d.]+$/.test(host) || host.includes(":");

/**
 * Разбор журнала: соединения по сайтам, последние сверху. DNS-запросы самого туннеля
 * (на 172.19.0.2:53 и через dns-out) не показываем.
 */
export function parseAccessLog(text: string, limit = 300): Connection[] {
  const names = new Map<string, string>();
  const byHost = new Map<string, Connection>();
  for (const raw of text.split("\n")) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [, y, mo, d, h, mi, sec, frac, rest] = m;
    const at = new Date(+y, +mo - 1, +d, +h, +mi, +sec, frac ? Math.floor(+`0.${frac}` * 1000) : 0).getTime();

    const dns = DNS.exec(rest);
    if (dns) {
      const domain = dns[1].toLowerCase();
      for (const ip of dns[2].split(/[,\s]+/).filter(Boolean)) names.set(bare(ip), domain);
      continue;
    }

    const a = ACCESS.exec(rest);
    if (!a || a[2] !== "accepted") continue;
    const outbound = outboundOf(a[6]);
    const port = Number(a[5]);
    const target = bare(a[4]);
    if (outbound === "dns-out" || (port === 53 && target === "172.19.0.2")) continue;
    // Служебная рассылка в локальной сети (mDNS 224.0.0.251, SSDP, broadcast) — не сайты.
    if (isMulticast(target)) continue;
    const known = isIp(target) ? names.get(target) : undefined;
    const host = known ?? target;
    const entry = byHost.get(host);
    if (entry) {
      entry.count += 1;
      if (at >= entry.last) {
        entry.last = at;
        entry.port = port;
        entry.outbound = outbound;
        entry.route = routeOf(outbound);
        entry.network = a[3] === "udp" ? "udp" : "tcp";
        if (known) entry.ip = target;
      }
    } else {
      byHost.set(host, {
        host,
        ip: known ? target : null,
        port,
        network: a[3] === "udp" ? "udp" : "tcp",
        route: routeOf(outbound),
        outbound,
        count: 1,
        last: at,
      });
    }
  }
  return [...byHost.values()].sort((x, y) => y.last - x.last).slice(0, limit);
}

/** Вторые уровни, под которыми регистрируют сайты: example.co.uk, example.com.ru. */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "msk", "spb"]);

/**
 * Что добавить в исключения: сайт целиком, а не один его сервер —
 * rr3---sn-abc.googlevideo.com → googlevideo.com. IP остаётся как есть.
 */
export function siteOf(host: string) {
  if (isIp(host)) return host;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const take = labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Как сайт записан в исключениях (с префиксом domain: или без), если записан. */
export function exclusionFor(host: string, list: string[]) {
  const h = host.toLowerCase();
  return (
    list.find((raw) => {
      const x = raw.trim().toLowerCase();
      if (!x || x.startsWith("#")) return false;
      if (x === h) return true;
      const name = x.replace(/^(domain|full):/, "").replace(/^\*\./, "");
      if (x.startsWith("full:")) return name === h;
      if (/^(regexp|keyword|geosite|ext):/.test(x) || x.includes("/")) return false;
      return h === name || h.endsWith(`.${name}`);
    }) ?? null
  );
}

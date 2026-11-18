import type { ServerNode, SubPrefs, Subscription } from "./types";

/**
 * Разбор подписки Remnawave. Понимает те же заголовки, что INCY и Happ:
 * profile-title, subscription-userinfo, announce, support-url, profile-web-page-url,
 * hide-url, sort-order, new-url, fragmentation-*. Если заголовка нет, берутся
 * строки метаданных из тела: `#profile-title: …`.
 */

export type Outbound = Record<string, unknown>;
export type Rule = Record<string, unknown>;

/**
 * Всё, что нужно ядру для одного сервера. Из ссылки — один outbound «proxy».
 * Из Xray JSON (так Remnawave отвечает v2rayNG) — все outbound'ы провайдера,
 * балансировщики и правила: у «Auto» это несколько серверов и выбор лучшего.
 */
export interface NodeConfig {
  outbounds: Outbound[];
  balancers?: Rule[];
  rules?: Rule[];
  observatory?: Rule;
  burstObservatory?: Rule;
}

/** Фрагментация TLS ClientHello, если её включил провайдер. */
export interface ProviderFragment {
  packets: string;
  length: string;
  interval: string;
}

/** То, что приложение хранит о подписке сверх полей для интерфейса. */
export interface StoredSubscription extends Omit<Subscription, "prefs" | "providerTitle"> {
  /** Свои настройки провайдера; title здесь — всегда название из подписки. */
  prefs?: SubPrefs;
  /** Конфигурация ядра по id сервера (с ключами — интерфейсу не отдаётся). */
  outbounds: Record<string, NodeConfig>;
  fragment: ProviderFragment | null;
  hideUrl: boolean;
  updateIntervalHours: number | null;
}

export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Ответ разбора ссылок: libXray превращает vless://… в outbound'ы. */
export type ConvertLinks = (text: string) => Promise<Outbound[]>;

export function checkUrl(raw: string): string {
  const url = raw.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Ссылка должна начинаться с https://");
  return url;
}

export async function parseSubscription(
  url: string,
  res: FetchResult,
  convert: ConvertLinks,
  previous?: StoredSubscription,
): Promise<StoredSubscription> {
  // Лимит устройств (HWID): панель сообщает заголовками, тело при этом пустое или заглушка.
  const hw = res.headers;
  if (hw["x-hwid-max-devices-reached"] === "true" || hw["x-hwid-limit"] === "true") {
    throw new Error(
      "Достигнут лимит устройств подписки. Отвяжите старое устройство у провайдера (в боте или личном кабинете) и обновите подписку",
    );
  }
  if (hw["x-hwid-not-supported"] === "true" || (res.status === 404 && hw["x-hwid-active"] === "true")) {
    throw new Error("Провайдер привязывает подписку к устройству. Включите «Отправлять HWID» в настройках и обновите подписку");
  }
  if (res.status !== 200) {
    throw new Error(
      res.status === 404
        ? "Подписка не найдена. Проверьте ссылку в личном кабинете"
        : `Сервер подписки ответил кодом ${res.status}. Попробуйте позже`,
    );
  }
  const meta: Record<string, string> = {};
  const body = extractBodyMeta(res.body.trim(), meta);
  if (/^\s*<(!doctype|html)/i.test(body)) {
    throw new Error("По ссылке открылась страница, а не подписка. Скопируйте ссылку на подписку");
  }

  const h = (name: string): string | null => {
    const v = res.headers[name] ?? meta[name];
    return v && v.trim() ? v.trim() : null;
  };

  const parsed = await parseNodes(body, convert);
  if (parsed.length === 0) throw new Error("В подписке нет ни одного сервера");

  // Провайдер может перенести подписку на новый адрес.
  const newUrl = h("new-url");
  const effectiveUrl = newUrl && /^https:\/\//.test(newUrl) ? newUrl : url;

  const nodes: ServerNode[] = [];
  const outbounds: Record<string, NodeConfig> = {};
  const used = new Map<string, number>();
  const oldPings = new Map(previous?.nodes.map((n) => [n.id, n.pingMs]) ?? []);
  for (const { name, node } of parsed) {
    const outbound = mainOutbound(node);
    // id по названию: избранное и выбор переживают перестановку серверов.
    const count = (used.get(name) ?? 0) + 1;
    used.set(name, count);
    const id = count === 1 ? name : `${name}#${count}`;
    const divider = isDivider(name, outbound);
    nodes.push({
      id,
      name,
      tags: divider ? [] : tagsOf(outbound),
      pingMs: divider ? null : (oldPings.get(id) ?? null),
      divider: divider || undefined,
    });
    if (!divider) outbounds[id] = node;
  }
  if (h("sort-order") === "name") {
    // Разделители при сортировке теряют смысл.
    const servers = nodes.filter((n) => !n.divider);
    servers.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    nodes.splice(0, nodes.length, ...servers);
  }

  const info = parseUserInfo(h("subscription-userinfo"));
  const fragmentOn = flag(h("fragmentation-enable"));

  return {
    url: effectiveUrl,
    title:
      decodeText(h("profile-title")) ??
      decodeText(h("subscription-name")) ??
      titleFromDisposition(h("content-disposition")) ??
      previous?.title ??
      hostOf(effectiveUrl),
    plan: decodeText(h("plan-name")) ?? previous?.plan ?? null,
    nodes,
    outbounds,
    usedBytes: info.upload + info.download,
    totalBytes: info.total,
    expireAt: info.expire,
    announce: decodeText(h("announce")),
    supportUrl: safeLink(h("support-url")),
    webPageUrl: safeLink(h("profile-web-page-url") ?? h("homepage")),
    updatedAt: Date.now(),
    hideUrl: flag(h("hide-url")),
    updateIntervalHours: Number(h("profile-update-interval")) || null,
    fragment: fragmentOn
      ? {
          packets: h("fragmentation-packets") ?? "tlshello",
          length: h("fragmentation-length") ?? "100-200",
          interval: h("fragmentation-interval") ?? "10-20",
        }
      : null,
  };
}

/** Тело подписки: base64 со ссылками, просто ссылки или Xray JSON. */
async function parseNodes(body: string, convert: ConvertLinks) {
  const result: { name: string; node: NodeConfig }[] = [];

  if (body.startsWith("[") || body.startsWith("{")) {
    // Xray JSON: массив полных конфигов с "remarks" (формат Remnawave) или один конфиг.
    const decoded = JSON.parse(body) as unknown;
    const configs = Array.isArray(decoded) ? decoded : [decoded];
    for (const cfg of configs as Record<string, unknown>[]) {
      const list = ((cfg.outbounds as Outbound[] | undefined) ?? []).filter((o) => o && typeof o === "object");
      if (!list.some((o) => !SERVICE.has(String(o.protocol)))) continue;
      const routing = (cfg.routing ?? {}) as { balancers?: Rule[]; rules?: Rule[] };
      const node: NodeConfig = {
        outbounds: list,
        balancers: routing.balancers,
        rules: routing.rules,
        observatory: cfg.observatory as Rule | undefined,
        burstObservatory: cfg.burstObservatory as Rule | undefined,
      };
      const name = String(cfg.remarks ?? "").replace(/\s+/g, " ").trim();
      result.push({ name: name || `Сервер ${result.length + 1}`, node });
    }
    return result;
  }

  const outbounds = await convert(body);
  for (const o of outbounds) {
    if (SERVICE.has(String(o.protocol))) continue;
    const name = String(o.tag ?? "").replace(/\s+/g, " ").trim();
    result.push({ name: name || `Сервер ${result.length + 1}`, node: { outbounds: [{ ...o, tag: "proxy" }] } });
  }
  return result;
}

/** Служебные outbound'ы, а не серверы. */
const SERVICE = new Set(["freedom", "blackhole", "dns", "loopback"]);

/** Главный сервер узла: «proxy» или первый настоящий outbound. */
export function mainOutbound(node: NodeConfig): Outbound {
  return (
    node.outbounds.find((o) => o.tag === "proxy") ??
    node.outbounds.find((o) => !SERVICE.has(String(o.protocol))) ??
    node.outbounds[0]
  );
}

/** Вынимает из тела строки `#ключ: значение`. base64-тело сначала декодируется. */
function extractBodyMeta(body: string, meta: Record<string, string>): string {
  let text = body;
  if (!text.includes("://") && !text.startsWith("[") && !text.startsWith("{")) {
    const decoded = decodeBase64(text.replace(/\s/g, ""));
    if (decoded == null) return body;
    text = decoded.trim();
  }
  if (text.startsWith("[") || text.startsWith("{")) return text;
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^#([a-z-]+):\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1]] = m[2];
    else lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Разделитель из подписки, а не сервер: панели вставляют строки вроде
 * «⬇️ Обходы глушилок | LTE ⬇️» с адресом-заглушкой.
 */
function isDivider(name: string, outbound: Outbound): boolean {
  const address = serverAddress(outbound);
  // Заглушка вместо адреса: 0.0.0.0, localhost или просто слово («wifi»).
  const fakeAddress =
    address != null && (/^(0\.0\.0\.0|127\.0\.0\.1|localhost|::1?)$/i.test(address) || !/[.:]/.test(address));
  const arrows = /^[\s⬇⬆⬅➡↓↑▼▲─—=➖-]/u.test(name) && /[⬇⬆⬅➡↓↑▼▲─—=➖-]️?\s*$/u.test(name);
  return fakeAddress || arrows;
}

function serverAddress(o: Outbound): string | null {
  const s = o.settings as Record<string, unknown> | undefined;
  if (!s) return null;
  if (typeof s.address === "string") return s.address;
  const list = (s.vnext ?? s.servers) as { address?: string }[] | undefined;
  return list?.[0]?.address ?? null;
}

/** Метки транспорта: протокол, защита, сеть — ["VLESS", "REALITY", "GRPC"]. */
export function tagsOf(o: Outbound): string[] {
  const tags = [String(o.protocol ?? "").toUpperCase()];
  const stream = (o.streamSettings ?? {}) as Record<string, unknown>;
  const security = String(stream.security ?? "none");
  if (security !== "none" && security !== "") tags.push(security.toUpperCase());
  const network = String(stream.network ?? "tcp").replace("raw", "tcp").replace("splithttp", "xhttp");
  if (o.protocol !== "hysteria2" && o.protocol !== "hysteria") tags.push(network.toUpperCase());
  return tags.filter(Boolean);
}

function parseUserInfo(raw: string | null) {
  const info = { upload: 0, download: 0, total: 0, expire: null as number | null };
  if (!raw) return info;
  for (const part of raw.split(";")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    const n = Number(v) || 0;
    if (k === "upload") info.upload = n;
    else if (k === "download") info.download = n;
    else if (k === "total") info.total = n;
    // Больше 32 млрд — уже миллисекунды.
    else if (k === "expire") info.expire = n > 0 ? (n > 32_000_000_000 ? n : n * 1000) : null;
  }
  return info;
}

const flag = (v: string | null) => v === "1" || v?.toLowerCase() === "true";

/** Текст может прийти как "base64:..." — так Remnawave передаёт кириллицу. */
function decodeText(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("base64:")) return decodeBase64(raw.slice(7));
  return raw;
}

function decodeBase64(raw: string): string | null {
  try {
    let s = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function titleFromDisposition(raw: string | null): string | null {
  const m = raw && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(raw);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/\.(txt|yaml|json)$/i, "");
  } catch {
    return m[1];
  }
}

const safeLink = (v: string | null) => (v && /^(https?:\/\/|tg:\/\/)/i.test(v) ? v : null);

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "Подписка";
  }
}

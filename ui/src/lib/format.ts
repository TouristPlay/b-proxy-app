import { LANG, t } from "@/lib/i18n";

const units = [t("Б"), t("КБ"), t("МБ"), t("ГБ"), t("ТБ")];

export function formatBytes(bytes: number): string {
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1);
  return `${LANG === "ru" ? text.replace(".", ",") : text} ${units[i]}`;
}

export const formatSpeed = (bps: number) => t("{0}/с", [formatBytes(bps)]);

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

const months = [
  t("января"), t("февраля"), t("марта"), t("апреля"), t("мая"), t("июня"),
  t("июля"), t("августа"), t("сентября"), t("октября"), t("ноября"), t("декабря"),
];

/** «13 октября», а если год не текущий — «13 октября 2028». */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${months[d.getMonth()]}${year}`;
}

/** «🇳🇱 Нидерланды» → { code: "NL", name: "Нидерланды" }. */
export function splitFlag(raw: string): { code: string | null; name: string } {
  const chars = Array.from(raw.trim());
  const isRegional = (c: string | undefined) => {
    const cp = c?.codePointAt(0) ?? 0;
    return cp >= 0x1f1e6 && cp <= 0x1f1ff;
  };
  if (isRegional(chars[0]) && isRegional(chars[1])) {
    const code = String.fromCharCode(
      chars[0].codePointAt(0)! - 0x1f1e6 + 65,
      chars[1].codePointAt(0)! - 0x1f1e6 + 65,
    );
    return { code, name: chars.slice(2).join("").trim() };
  }
  return { code: null, name: raw.trim() };
}

/** Склонение: 1 сервер, 2 сервера, 5 серверов. */
export function plural(n: number, one: string, few: string, many: string): string {
  // В английском две формы: 1 server, 2 servers (вторая — в «few» и «many»).
  if (LANG === "en") return n === 1 ? one : many;
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «2,4 ГБ» → { value: "2,4", unit: "ГБ" } — для крупных цифр с мелкой единицей. */
export function splitBytes(bytes: number): { value: string; unit: string } {
  const [value, unit] = formatBytes(bytes).split(" ");
  return { value, unit };
}

export function daysLeft(ts: number | null): number | null {
  return ts == null ? null : Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));
}

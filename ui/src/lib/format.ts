const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];

export function formatBytes(bytes: number): string {
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1);
  return `${text.replace(".", ",")} ${units[i]}`;
}

export const formatSpeed = (bps: number) => `${formatBytes(bps)}/с`;

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

const months = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${months[d.getMonth()]}`;
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
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

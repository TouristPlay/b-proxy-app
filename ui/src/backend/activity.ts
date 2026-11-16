import type { ActivityEntry, SessionEnd } from "./types";

/**
 * Журнал активности: сеансы VPN, ошибки подключения, обновления подписок.
 * Хранится только на устройстве, в нём нет ссылок на подписку и адресов серверов.
 */

const KEY = "b-proxy.activity";
/** Не больше 500 записей и не старше 90 дней — хватает на статистику за месяц. */
const MAX_ENTRIES = 500;
const MAX_AGE = 90 * 86_400_000;

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function loadActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
    // Сеанс, который не успел закрыться (приложение закрыли или оно упало), считаем завершённым системой.
    return trim(
      list.map((e) =>
        e.kind === "session" && e.endedAt == null ? { ...e, endedAt: e.startedAt, end: "system" as SessionEnd } : e,
      ),
    );
  } catch {
    return [];
  }
}

export function saveActivity(list: ActivityEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(trim(list)));
  } catch {
    // Хранилище переполнено или недоступно — журнал живёт до перезапуска.
  }
}

export function trim(list: ActivityEntry[]): ActivityEntry[] {
  const since = Date.now() - MAX_AGE;
  return list.filter((e) => (e.kind === "session" ? e.startedAt : e.at) >= since).slice(0, MAX_ENTRIES);
}

export const entryTime = (e: ActivityEntry) => (e.kind === "session" ? e.startedAt : e.at);

/** Сеансы за период и итоги по ним. Идущий сейчас сеанс считается до текущего момента. */
export function summarize(list: ActivityEntry[], since: number, now = Date.now()) {
  const sessions = list.filter(
    (e): e is Extract<ActivityEntry, { kind: "session" }> => e.kind === "session" && (e.endedAt ?? now) >= since,
  );
  let protectedMs = 0;
  let down = 0;
  let up = 0;
  const byServer = new Map<string, number>();
  for (const s of sessions) {
    const ms = Math.max(0, (s.endedAt ?? now) - Math.max(s.startedAt, since));
    protectedMs += ms;
    down += s.down;
    up += s.up;
    byServer.set(s.server, (byServer.get(s.server) ?? 0) + ms);
  }
  const errors = list.filter((e) => e.kind === "error" && e.at >= since).length;
  const top = [...byServer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { sessions, protectedMs, down, up, errors, top };
}

/** Трафик и время под защитой по дням за последние n дней (старые слева). */
export function trafficByDay(list: ActivityEntry[], days: number, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const result = Array.from({ length: days }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() - (days - 1 - i));
    return { day: day.getTime(), bytes: 0, ms: 0, sessions: 0 };
  });
  for (const e of list) {
    if (e.kind !== "session") continue;
    const d = new Date(e.startedAt);
    d.setHours(0, 0, 0, 0);
    const slot = result.find((r) => r.day === d.getTime());
    if (slot) {
      slot.bytes += e.down + e.up;
      slot.ms += Math.max(0, (e.endedAt ?? now) - e.startedAt);
      slot.sessions += 1;
    }
  }
  return result;
}

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Текст журнала для поддержки: без ссылок, ключей и адресов. */
export function supportReport(list: ActivityEntry[], meta: { app: string; xray: string; platform: string }) {
  const fmt = (t: number) => new Date(t).toLocaleString("ru-RU");
  const lines = [`B-Proxy ${meta.app}, Xray ${meta.xray}, ${meta.platform}`, ""];
  for (const e of list.slice(0, 40)) {
    if (e.kind === "session") {
      const end = { manual: "отключено", error: `ошибка: ${e.error ?? ""}`, system: "прервано системой" }[e.end ?? "manual"];
      lines.push(`${fmt(e.startedAt)} — ${e.endedAt ? fmt(e.endedAt) : "идёт"} · ${e.server} · ${e.endedAt ? end : "подключено"}`);
    } else if (e.kind === "error") {
      lines.push(`${fmt(e.at)} · ошибка${e.server ? ` (${e.server})` : ""}: ${e.text}`);
    } else {
      lines.push(`${fmt(e.at)} · ${e.text}`);
    }
  }
  return lines.join("\n");
}

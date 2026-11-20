/**
 * Расписание VPN: в выбранные дни с «from» до «to» VPN включён, вне окна — выключен.
 * Окно через полночь (22:00–07:00) принадлежит дню, в который начинается.
 * Приложение действует только на границах окна: если включить или выключить VPN
 * вручную, расписание не спорит до следующей границы.
 */
import type { ScheduleSettings } from "./types";

/** Минуты от начала дня: «09:30» → 570. */
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Дни недели: 1 — понедельник … 7 — воскресенье. */
const weekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

export function inWindow(s: ScheduleSettings, at: Date | number = Date.now()): boolean {
  if (!s.enabled || s.days.length === 0) return false;
  const d = new Date(at);
  const now = d.getHours() * 60 + d.getMinutes();
  const from = minutes(s.from);
  const to = minutes(s.to);
  if (from === to) return s.days.includes(weekday(d));
  if (from < to) return s.days.includes(weekday(d)) && now >= from && now < to;
  // Через полночь: вечер этого дня или утро после выбранного дня.
  const yesterday = new Date(d);
  yesterday.setDate(d.getDate() - 1);
  return (s.days.includes(weekday(d)) && now >= from) || (s.days.includes(weekday(yesterday)) && now < to);
}

/** Когда расписание в следующий раз включит (on: true) или выключит VPN; null — никогда. */
export function nextChange(s: ScheduleSettings, at: number = Date.now()): { at: number; on: boolean } | null {
  if (!s.enabled || s.days.length === 0 || minutes(s.from) === minutes(s.to)) return null;
  const start = new Date(at);
  start.setSeconds(0, 0);
  const now = inWindow(s, start);
  // Шагаем по минутам до двух недель вперёд: просто и без ошибок на переходах времени.
  for (let i = 1; i <= 14 * 24 * 60; i++) {
    const t = start.getTime() + i * 60_000;
    if (inWindow(s, t) !== now) return { at: t, on: !now };
  }
  return null;
}

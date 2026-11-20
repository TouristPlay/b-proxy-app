import { CalendarClock } from "lucide-react";
import { backend, useSnapshot } from "@/backend";
import { nextChange } from "@/backend/schedule";
import { isMobile, detectPlatform } from "@/backend/xray";
import type { ScheduleSettings } from "@/backend/types";
import { IconTile } from "@/components/bits";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Короткие названия дней 1…7 (пн…вс) на языке интерфейса. */
const dayNames = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 10, 16 + i).toLocaleDateString(LOCALE, { weekday: "short" }).replace(".", ""),
);

/** «пн–пт», «сб, вс», «каждый день». */
export function daysLabel(days: number[]) {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return t("каждый день");
  if (d.length === 0) return t("дни не выбраны");
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (contiguous && d.length >= 3) return `${dayNames[d[0] - 1]}–${dayNames[d[d.length - 1] - 1]}`;
  return d.map((x) => dayNames[x - 1]).join(", ");
}

/** Когда расписание сработает в следующий раз: «включит сегодня в 09:00». */
export function nextLabel(s: ScheduleSettings, now = Date.now()) {
  const next = nextChange(s, now);
  if (!next) return null;
  const at = new Date(next.at);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  const day =
    at.toDateString() === today.toDateString()
      ? t("сегодня")
      : at.toDateString() === tomorrow.toDateString()
        ? t("завтра")
        : at.toLocaleDateString(LOCALE, { weekday: "long" });
  const time = at.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  return next.on ? t("Включится {0} в {1}", [day, time]) : t("Выключится {0} в {1}", [day, time]);
}

export function scheduleHint(s: ScheduleSettings) {
  if (!s.enabled) return t("Включать и выключать VPN в нужные дни и часы");
  const next = nextLabel(s);
  return `${daysLabel(s.days)}, ${s.from}–${s.to}${next ? ` · ${next.toLowerCase()}` : ""}`;
}

export function ScheduleSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSnapshot();
  const plan = s.settings.schedule;
  const set = (patch: Partial<ScheduleSettings>) => void backend.updateSettings({ schedule: { ...plan, ...patch } });
  const toggleDay = (d: number) => set({ days: plan.days.includes(d) ? plan.days.filter((x) => x !== d) : [...plan.days, d].sort() });
  const next = nextLabel(plan);
  const mobile = isMobile(detectPlatform());
  const overnight = plan.from > plan.to;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Расписание")}
      description={t("VPN сам включится в начале и выключится в конце. Включить или выключить вручную можно в любой момент")}
      icon={<IconTile icon={CalendarClock} tone="blue" />}
    >
      <label htmlFor="schedule-on" className="glass mb-4 flex cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3.5">
        <span className="min-w-0 flex-1 font-medium">{t("По расписанию")}</span>
        <Switch id="schedule-on" checked={plan.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </label>

      <fieldset disabled={!plan.enabled} className={cn("flex flex-col gap-4 transition-opacity", !plan.enabled && "opacity-50")}>
        <div>
          <legend className="mb-2 px-1 text-[13px] font-medium text-ink-2">{t("Дни")}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {dayNames.map((name, i) => {
              const day = i + 1;
              const on = plan.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-11 rounded-xl border text-[14px] font-medium capitalize transition-colors duration-[var(--dur)]",
                    on ? "border-transparent bg-ink text-base" : "border-edge text-ink-2 hover:text-ink",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["from", t("Включить в")],
              ["to", t("Выключить в")],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="glass flex flex-col gap-1 rounded-[18px] px-4 py-3" role="group" aria-label={label}>
              <span className="text-[13px] text-ink-2">{label}</span>
              {/* Свои списки часов и минут: системное поле времени в части браузеров показывает 12-часовой формат. */}
              <span className="flex items-center font-display text-[24px] font-semibold tabular-nums">
                <TimePart
                  label={t("Часы")}
                  value={plan[key].slice(0, 2)}
                  options={Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))}
                  onChange={(h) => set({ [key]: `${h}:${plan[key].slice(3, 5)}` })}
                />
                <span aria-hidden>:</span>
                <TimePart
                  label={t("Минуты")}
                  value={plan[key].slice(3, 5)}
                  options={["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]}
                  onChange={(m) => set({ [key]: `${plan[key].slice(0, 2)}:${m}` })}
                />
              </span>
            </div>
          ))}
        </div>
        {overnight && <p className="px-1 text-[13px] text-ink-2">{t("Через полночь: выключится на следующее утро")}</p>}
      </fieldset>

      <p aria-live="polite" className="mt-4 min-h-5 px-1 text-[14px] text-ink">
        {plan.enabled && (next ?? t("Выберите хотя бы один день"))}
      </p>
      <p className="mt-2 px-1 text-[13px] leading-snug text-ink-3">
        {mobile
          ? t("Расписание работает, пока B-Proxy открыт или свёрнут. Если система закроет приложение, VPN по расписанию не включится")
          : t("Расписание работает, пока B-Proxy запущен — в том числе свёрнутым в трей")}
      </p>
    </Sheet>
  );
}

function TimePart({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const list = options.includes(value) ? options : [...options, value].sort();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 cursor-pointer appearance-none rounded-lg bg-transparent px-1 text-center outline-none hover:bg-glass-2 focus-visible:ring-2 focus-visible:ring-amber [&>option]:bg-panel [&>option]:text-[16px]"
    >
      {list.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

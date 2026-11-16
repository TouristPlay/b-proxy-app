import { ArrowDown, ArrowUp, ClipboardCopy, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { backend, useSnapshot, type ActivityEntry } from "@/backend";
import { entryTime, summarize, supportReport, trafficByDay } from "@/backend/activity";
import { detectPlatform } from "@/backend/xray";
import { Flag } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { formatBytes, plural, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";

type Period = "today" | "week" | "month";

const periods: { id: Period; label: string; days: number }[] = [
  { id: "today", label: "Сегодня", days: 1 },
  { id: "week", label: "7 дней", days: 7 },
  { id: "month", label: "30 дней", days: 30 },
];

const platformName = { android: "Android", ios: "iOS", windows: "Windows", macos: "macOS", linux: "Linux" };

/**
 * Активность: сколько времени устройство было под защитой, сколько трафика прошло
 * через VPN, какими серверами пользуетесь чаще и журнал подключений.
 * Всё считается по записям на этом устройстве, никуда не отправляется.
 */
export function ActivityScreen({ embedded }: { embedded?: boolean }) {
  const s = useSnapshot();
  const [period, setPeriod] = useState<Period>("week");
  const live = s.activity.some((e) => e.kind === "session" && e.endedAt == null);
  const now = useNow(live);
  const days = periods.find((p) => p.id === period)!.days;

  const since = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
  }, [now, days]);

  const sum = useMemo(() => summarize(s.activity, since, now), [s.activity, since, now]);
  const bars = useMemo(() => trafficByDay(s.activity, period === "month" ? 30 : 7, now), [s.activity, period, now]);
  const journal = useMemo(() => groupByDay(s.activity.filter((e) => entryTime(e) >= since)), [s.activity, since]);

  async function copyReport() {
    const text = supportReport(s.activity, { ...s.version, platform: platformName[detectPlatform()] });
    try {
      await navigator.clipboard.writeText(text);
      flash("Журнал скопирован — вставьте его в чат поддержки");
    } catch {
      flash("Нет доступа к буферу обмена. Разрешите его приложению и попробуйте снова");
    }
  }

  // Короткое подтверждение под кнопкой: уведомления бэкенда заняты «Вернуть».
  const [note, setNote] = useState<string | null>(null);
  function flash(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 3500);
  }

  const empty = s.activity.length === 0;

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32"}>
      {!embedded && <h1 className="mb-5 font-display text-[28px] font-semibold tracking-[-0.02em]">Активность</h1>}

      {empty ? (
        <div className="glass flex flex-col items-center rounded-[28px] px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-[18px] border border-amber/25 bg-amber/12 text-amber" aria-hidden>
            <ShieldCheck className="size-7" />
          </span>
          <p className="mt-4 font-display text-lg font-semibold">Здесь появятся ваши подключения</p>
          <p className="mt-2 max-w-[32ch] text-[15px] text-balance text-ink-2">
            Сколько времени вы были под защитой, сколько трафика прошло через VPN и какими серверами вы пользуетесь чаще
          </p>
          {s.current && s.state === "disconnected" && (
            <Button variant="amber" className="mt-6" onClick={() => void backend.toggle()}>
              Подключиться
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="glass grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist" aria-label="Период">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "h-10 rounded-xl text-sm font-medium transition-colors",
                  period === p.id ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <section className="glass rounded-[22px] px-4 py-3.5" aria-label="Под защитой">
              <p className="text-[13px] text-ink-2">Под защитой</p>
              <p className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums">
                <DurationValue ms={sum.protectedMs} />
              </p>
              <p className="mt-0.5 text-[13px] text-ink-3 tabular-nums">
                {sum.sessions.length} {plural(sum.sessions.length, "сеанс", "сеанса", "сеансов")}
              </p>
            </section>
            <section className="glass rounded-[22px] px-4 py-3.5" aria-label="Трафик через VPN">
              <p className="text-[13px] text-ink-2">Через VPN</p>
              <p className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-tight tabular-nums">
                {formatBytes(sum.down + sum.up)}
              </p>
              <p className="mt-0.5 flex gap-2.5 text-[13px] text-ink-3 tabular-nums">
                <span className="flex items-center gap-0.5">
                  <ArrowDown className="size-3.5" aria-label="получено" />
                  {formatBytes(sum.down)}
                </span>
                <span className="flex items-center gap-0.5">
                  <ArrowUp className="size-3.5" aria-label="отправлено" />
                  {formatBytes(sum.up)}
                </span>
              </p>
            </section>
          </div>

          {period !== "today" && <DayBars bars={bars} now={now} />}

          {sum.top.length > 0 && (
            <section className="glass rounded-[24px] p-4" aria-labelledby="top-servers">
              <h2 id="top-servers" className="mb-3 text-[13px] font-medium text-ink-2">
                Чаще всего
              </h2>
              <ul className="flex flex-col gap-3">
                {sum.top.map(([server, ms]) => {
                  const share = sum.protectedMs > 0 ? ms / sum.protectedMs : 0;
                  return (
                    <li key={server} className="flex items-center gap-3">
                      <Flag name={server} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{splitFlag(server).name}</span>
                          <span className="shrink-0 text-[13px] text-ink-2 tabular-nums">{humanDuration(ms)}</span>
                        </span>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-glass-3" aria-hidden>
                          <span className="block h-full rounded-full bg-amber" style={{ width: `${Math.max(3, share * 100)}%` }} />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="journal" className="mt-1">
            <h2 id="journal" className="mb-2 px-1 text-[13px] font-medium text-ink-2">
              Журнал
            </h2>
            {journal.length === 0 && (
              <p className="glass rounded-[20px] px-4 py-4 text-[15px] text-ink-2">За этот период подключений не было</p>
            )}
            <div className="flex flex-col gap-4">
              {journal.map(({ day, entries }) => (
                <div key={day}>
                  <h3 className="mb-1.5 px-1 text-[13px] text-ink-3">{dayTitle(day, now)}</h3>
                  <ul className="glass divide-y divide-edge overflow-hidden rounded-[22px]">
                    {entries.map((e) => (
                      <JournalRow key={e.id} entry={e} now={now} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-2 flex flex-col gap-2">
            <Button variant="glass" onClick={() => void copyReport()}>
              <ClipboardCopy />
              Скопировать для поддержки
            </Button>
            <p aria-live="polite" className="min-h-5 text-center text-[13px] text-good">
              {note}
            </p>
            <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => backend.clearActivity()}>
              <Trash2 />
              Очистить журнал
            </Button>
            <p className="px-2 text-center text-[13px] text-ink-3">
              Журнал хранится только на этом устройстве. В отчёт для поддержки не попадают ссылки и ключи
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalRow({ entry: e, now }: { entry: ActivityEntry; now: number }) {
  if (e.kind === "session") {
    const live = e.endedAt == null;
    const end = e.endedAt ?? now;
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <Flag name={e.server} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{splitFlag(e.server).name}</span>
          <span className={cn("block text-[13px] tabular-nums", live ? "text-good" : "text-ink-2")}>
            {live ? `Подключено с ${time(e.startedAt)}` : `${time(e.startedAt)}–${time(end)}`} · {humanDuration(end - e.startedAt)}
            {e.end === "system" && " · прервано системой"}
            {e.end === "error" && " · обрыв"}
          </span>
        </span>
        <span className="shrink-0 text-right text-[13px] text-ink-2 tabular-nums">{formatBytes(e.down + e.up)}</span>
      </li>
    );
  }
  const error = e.kind === "error";
  const Icon = error ? TriangleAlert : RefreshCw;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl border",
          error ? "border-bad/30 bg-bad/10 text-bad" : "border-edge bg-glass-2 text-ink-2",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[15px] leading-snug break-words">
          {error && <span className="sr-only">Ошибка: </span>}
          {e.text}
        </span>
        <span className="block text-[13px] text-ink-3 tabular-nums">
          {time(e.at)}
          {e.kind === "error" && e.server && ` · ${splitFlag(e.server).name}`}
        </span>
      </span>
    </li>
  );
}

/** Столбики трафика по дням; сегодняшний — цвета акцента. */
function DayBars({ bars, now }: { bars: { day: number; bytes: number }[]; now: number }) {
  const max = Math.max(...bars.map((b) => b.bytes), 1);
  const total = bars.reduce((n, b) => n + b.bytes, 0);
  const many = bars.length > 7;
  return (
    <section className="glass rounded-[24px] p-4" aria-labelledby="traffic-by-day">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="traffic-by-day" className="text-[13px] font-medium text-ink-2">
          Трафик по дням
        </h2>
        <span className="text-[13px] text-ink-3 tabular-nums">макс. {formatBytes(max)}</span>
      </div>
      <div
        className={cn("flex h-28 items-end", many ? "gap-[3px]" : "gap-2")}
        role="img"
        aria-label={`Трафик по дням, всего ${formatBytes(total)}`}
      >
        {bars.map((b) => {
          const today = isSameDay(b.day, now);
          return (
            <div key={b.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayTitle(b.day, now)}: ${formatBytes(b.bytes)}`}>
              <div
                className={cn("w-full rounded-md", today ? "bg-amber" : "bg-ink/20")}
                style={{ height: b.bytes > 0 ? `${Math.max(4, (b.bytes / max) * 100)}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      {!many && (
        <div className="mt-2 flex gap-2" aria-hidden>
          {bars.map((b) => (
            <span key={b.day} className={cn("flex-1 text-center text-[12px]", isSameDay(b.day, now) ? "text-amber" : "text-ink-3")}>
              {weekday.format(b.day)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const time = (t: number) => timeFmt.format(t);

function isSameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayTitle(day: number, now: number) {
  if (isSameDay(day, now)) return "Сегодня";
  if (isSameDay(day, now - 86_400_000)) return "Вчера";
  return dateFmt.format(day);
}

/** Крупные числа и мелкие единицы, чтобы «28 ч 56 мин» помещалось в плитку. */
function DurationValue({ ms }: { ms: number }) {
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const unit = "ml-0.5 mr-1.5 font-sans text-[14px] font-medium text-ink-2";
  if (min < 1) return <span className="text-[18px]">меньше минуты</span>;
  return (
    <>
      {h > 0 && (
        <>
          {h}
          <span className={unit}>ч</span>
        </>
      )}
      {(m > 0 || h === 0) && (
        <>
          {m}
          <span className={unit}>мин</span>
        </>
      )}
    </>
  );
}

/** «2 ч 15 мин», «45 мин», «меньше минуты». */
function humanDuration(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "меньше минуты";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

function groupByDay(list: ActivityEntry[]) {
  const groups: { day: number; entries: ActivityEntry[] }[] = [];
  for (const e of list) {
    const d = new Date(entryTime(e));
    d.setHours(0, 0, 0, 0);
    const day = d.getTime();
    const last = groups.at(-1);
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

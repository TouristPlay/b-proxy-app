import { Entrance, useEntrance } from "@/lib/motion";
import { SmoothChart } from "@/components/SmoothChart";
import {
  ChevronRight,
  ChevronLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ClipboardCopy,
  FileText,
  Plug,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { backend, useSnapshot, type ActivityEntry, type Snapshot } from "@/backend";
import { entryTime, startOfDay, summarize, supportReport, trafficByDay } from "@/backend/activity";
import { detectPlatform } from "@/backend/xray";
import { Flag } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatSpeed, plural, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";
import { LogsSheet } from "./LogsSheet";
import { LOCALE, t } from "@/lib/i18n";

type Period = "today" | "week" | "month";
type Metric = "traffic" | "time";
type Kind = "all" | "session" | "error";
type Session = Extract<ActivityEntry, { kind: "session" }>;

const periods: { id: Period; label: string; days: number }[] = [
  { id: "today", label: t("Сегодня"), days: 1 },
  { id: "week", label: t("7 дней"), days: 7 },
  { id: "month", label: t("30 дней"), days: 30 },
];

const platformName = { android: "Android", ios: "iOS", windows: "Windows", macos: "macOS", linux: "Linux" };

/**
 * Активность: сколько времени устройство было под защитой, сколько трафика прошло
 * через VPN, какими серверами пользуетесь чаще и журнал подключений.
 * День на графике, сервер в «Чаще всего» и тип записи фильтруют журнал;
 * сеанс раскрывается в подробности и подключается заново одним нажатием.
 * Данные — только записи на этом устройстве.
 */
export function ActivityScreen({ embedded }: { embedded?: boolean }) {
  const s = useSnapshot();
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("traffic");
  const [day, setDay] = useState<number | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [logs, setLogs] = useState(false);
  const live = s.activity.find((e): e is Session => e.kind === "session" && e.endedAt == null) ?? null;
  const now = useNow(live != null);
  const days = periods.find((p) => p.id === period)!.days;

  const since = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
  }, [now, days]);

  // Выбранный день сужает всё, кроме самого графика.
  const range = useMemo(
    () => (day != null ? { from: day, to: day + 86_400_000 } : { from: since, to: Infinity }),
    [day, since],
  );
  const inRange = useMemo(
    () => s.activity.filter((e) => entryTime(e) >= range.from && entryTime(e) < range.to),
    [s.activity, range],
  );
  const sum = useMemo(() => summarize(inRange, range.from, now), [inRange, range, now]);
  const bars = useMemo(() => trafficByDay(s.activity, period === "month" ? 30 : 7, now), [s.activity, period, now]);

  const journalAll = useMemo(() => {
    const filtered = inRange.filter(
      (e) =>
        (kind === "all" || e.kind === kind || (kind === "error" && e.kind === "session" && e.end === "error")) &&
        (!server || (e.kind === "session" ? e.server === server : e.kind === "error" && e.server === server)),
    );
    return filtered;
  }, [inRange, kind, server]);

  // Журнал по страницам: на длинной истории экран не превращается в бесконечную ленту.
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(journalAll.length / JOURNAL_PAGE));
  const current = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [kind, server, day, period]);
  // При смене страницы возвращаемся к заголовку журнала, а не остаёмся внизу.
  function turn(p: number) {
    setPage(p);
    document.getElementById("journal")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  const journal = useMemo(
    () => groupByDay(journalAll.slice(current * JOURNAL_PAGE, (current + 1) * JOURNAL_PAGE)),
    [journalAll, current],
  );

  // Короткое подтверждение под кнопкой копирования.
  const [note, setNote] = useState<string | null>(null);
  function flash(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 3500);
  }

  async function copyReport() {
    const text = supportReport(s.activity, { ...s.version, platform: platformName[detectPlatform()] });
    try {
      await navigator.clipboard.writeText(text);
      flash(t("Журнал скопирован — вставьте его в чат поддержки"));
    } catch {
      flash(t("Нет доступа к буферу обмена. Разрешите его приложению и попробуйте снова"));
    }
  }

  function changePeriod(p: Period) {
    setPeriod(p);
    setDay(null);
  }

  const empty = s.activity.length === 0;
  const filtered = day != null || server != null || kind !== "all";

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32"}>
      {!embedded && <h1 className="mb-5 font-display text-[28px] font-semibold tracking-[-0.02em]">{t("Активность")}</h1>}

      {live && s.state === "connected" && <LiveCard session={live} s={s} now={now} />}

      {empty ? (
        <div className="glass flex flex-col items-center rounded-[28px] px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-[18px] border border-amber/25 bg-amber/12 text-amber" aria-hidden>
            <ShieldCheck className="size-7" />
          </span>
          <p className="mt-4 font-display text-lg font-semibold">{t("Здесь появятся ваши подключения")}</p>
          <p className="mt-2 max-w-[32ch] text-[15px] text-balance text-ink-2">
            
            {t("Сколько времени вы были под защитой, сколько трафика прошло через VPN и какими серверами вы пользуетесь чаще")}
          </p>
          {s.current && s.state === "disconnected" && (
            <Button variant="amber" className="mt-6" onClick={() => void backend.toggle()}>
              
              {t("Подключиться")}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Segmented label={t("Период")} value={period} onChange={changePeriod} options={periods.map((p) => ({ id: p.id, label: p.label }))} />

          <div className="grid grid-cols-2 gap-3">
            <section className="glass rounded-[22px] px-4 py-3.5" aria-label={t("Под защитой")}>
              <p className="text-[13px] text-ink-2">{t("Под защитой")}</p>
              <p className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums">
                <DurationValue ms={sum.protectedMs} />
              </p>
              <p className="mt-0.5 text-[13px] text-ink-3 tabular-nums">
                {sum.sessions.length} {plural(sum.sessions.length, t("сеанс"), t("сеанса"), t("сеансов"))}
                {sum.errors > 0 && (
                  <span className="text-bad">
                    {" "}
                    · {sum.errors} {plural(sum.errors, t("ошибка"), t("ошибки"), t("ошибок"))}
                  </span>
                )}
              </p>
            </section>
            <section className="glass rounded-[22px] px-4 py-3.5" aria-label={t("Трафик через VPN")}>
              <p className="text-[13px] text-ink-2">{t("Через VPN")}</p>
              <p className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-tight tabular-nums">
                {formatBytes(sum.down + sum.up)}
              </p>
              <p className="mt-0.5 flex gap-2 text-[12.5px] whitespace-nowrap text-ink-3 tabular-nums">
                <span className="flex items-center gap-0.5">
                  <ArrowDown className="size-3.5" aria-label={t("получено")} />
                  {formatBytes(sum.down)}
                </span>
                <span className="flex items-center gap-0.5">
                  <ArrowUp className="size-3.5" aria-label={t("отправлено")} />
                  {formatBytes(sum.up)}
                </span>
              </p>
            </section>
          </div>

          {period !== "today" && <DayBars bars={bars} now={now} metric={metric} onMetric={setMetric} selected={day} onSelect={setDay} />}

          {sum.top.length > 0 && (
            <section className="glass rounded-[24px] p-2" aria-labelledby="top-servers">
              <h2 id="top-servers" className="px-2 pt-2 pb-1 text-[13px] font-medium text-ink-2">
                
                {t("Чаще всего")}
              </h2>
              <ul className="flex flex-col">
                {sum.top.map(([name, ms]) => {
                  const share = sum.protectedMs > 0 ? ms / sum.protectedMs : 0;
                  const active = server === name;
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={t("{0}: {1}. Показать в журнале", [splitFlag(name).name, humanDuration(ms)])}
                        onClick={() => setServer(active ? null : name)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[16px] px-2 py-2.5 text-left transition-colors duration-[var(--dur)]",
                          active ? "bg-amber/10" : "hover:bg-glass-2",
                        )}
                      >
                        <Flag name={name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn("truncate font-medium", active && "text-amber")}>{splitFlag(name).name}</span>
                            <span className="shrink-0 text-[13px] text-ink-2 tabular-nums">
                              {humanDuration(ms)} · {Math.round(share * 100)}%
                            </span>
                          </span>
                          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-glass-3" aria-hidden>
                            <span
                              className="block h-full rounded-full bg-amber transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
                              style={{ width: `${Math.max(3, share * 100)}%` }}
                            />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="journal" className="mt-1">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2 id="journal" className="text-[13px] font-medium text-ink-2">
                
                {t("Журнал")}
              </h2>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setDay(null);
                    setServer(null);
                    setKind("all");
                  }}
                  className="min-h-9 text-[13px] font-medium text-amber hover:text-amber-2"
                >
                  
                  {t("Сбросить фильтры")}
                </button>
              )}
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", t("Всё")],
                  ["session", t("Подключения")],
                  ["error", t("Ошибки")],
                ] as const
              ).map(([id, text]) => (
                <Chip key={id} active={kind === id} onClick={() => setKind(id)}>
                  {text}
                </Chip>
              ))}
              {day != null && (
                <Chip active onClick={() => setDay(null)} removable>
                  {dayTitle(day, now)}
                </Chip>
              )}
              {server && (
                <Chip active onClick={() => setServer(null)} removable>
                  {splitFlag(server).name}
                </Chip>
              )}
            </div>

            {journal.length === 0 && (
              <p className="glass rounded-[20px] px-4 py-4 text-[15px] text-ink-2">
                {filtered ? t("Под эти условия ничего не попало") : t("За этот период подключений не было")}
              </p>
            )}
            <div className="flex flex-col gap-4">
              {journal.map(({ day: d, entries }) => (
                <div key={d}>
                  <h3 className="mb-1.5 px-1 text-[13px] text-ink-3">{dayTitle(d, now)}</h3>
                  <ul className="glass divide-y divide-edge overflow-hidden rounded-[22px]">
                    {entries.map((e) => (
                      <JournalRow key={e.id} entry={e} now={now} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} s={s} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {pages > 1 && (
              <nav aria-label={t("Страницы журнала")} className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => turn(current - 1)}
                  disabled={current === 0}
                  aria-label={t("Предыдущая страница")}
                  className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <span className="text-[14px] font-medium tabular-nums">
                    {current + 1} {" "}{t("из")}{" "}{pages}
                  </span>
                  <span className="text-[12px] text-ink-3 tabular-nums">
                    
                    {t("записи")}{" "}{current * JOURNAL_PAGE + 1}–{Math.min((current + 1) * JOURNAL_PAGE, journalAll.length)} {" "}{t("из")}{" "}{journalAll.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => turn(current + 1)}
                  disabled={current >= pages - 1}
                  aria-label={t("Следующая страница")}
                  className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
                >
                  <ChevronRight className="size-5" />
                </button>
              </nav>
            )}
          </section>

          <div className="mt-2 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="glass" className="px-3" onClick={() => void copyReport()}>
                <ClipboardCopy />
                
                {t("Для поддержки")}
              </Button>
              <Button variant="glass" className="px-3" onClick={() => setLogs(true)}>
                <FileText />
                
                {t("Тех. журналы")}
              </Button>
            </div>
            <p aria-live="polite" className="min-h-5 text-center text-[13px] text-good">
              {note}
            </p>
            <Button variant="ghost" className="text-bad hover:text-bad" onClick={() => backend.clearActivity()}>
              <Trash2 />
              
              {t("Очистить журнал")}
            </Button>
            <p className="px-2 text-center text-[13px] text-ink-3">
              
              {t("Журнал хранится только на этом устройстве. В отчёт для поддержки не попадают ссылки и ключи")}
            </p>
          </div>
        </div>
      )}

      <LogsSheet open={logs} onOpenChange={setLogs} />
    </div>
  );
}

/** Текущий сеанс: таймер, скорость и график в реальном времени. */
function LiveCard({ session, s, now }: { session: Session; s: Snapshot; now: number }) {
  const rise = useEntrance("anim-rise");
  return (
    <section className={cn("glass mb-4 rounded-[24px] border-good/30 p-4", rise)} aria-label={t("Текущее подключение")}>
      <div className="flex items-center gap-3">
        <Flag name={session.server} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{splitFlag(session.server).name}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-good tabular-nums">
            <span className="size-1.5 animate-pulse rounded-full bg-good" aria-hidden />
            
            {t("Сейчас ·")}{" "}{formatDuration(now - session.startedAt)}
          </span>
        </span>
        <span className="text-right text-[13px] text-ink-2 tabular-nums">
          <span className="flex items-center justify-end gap-1">
            <ArrowDown className="size-3.5 text-good" aria-label={t("загрузка")} />
            {formatSpeed(s.downSpeed ?? 0)}
          </span>
          <span className="flex items-center justify-end gap-1">
            <ArrowUp className="size-3.5" aria-label={t("отдача")} />
            {formatSpeed(s.upSpeed ?? 0)}
          </span>
        </span>
      </div>
      <SmoothChart values={s.speedHistory} className="mt-3 h-14 w-full" />
    </section>
  );
}

function JournalRow({ entry: e, now, open, onToggle, s }: { entry: ActivityEntry; now: number; open: boolean; onToggle: () => void; s: Snapshot }) {
  if (e.kind === "session") {
    const live = e.endedAt == null;
    const end = e.endedAt ?? now;
    const dur = end - e.startedAt;
    // Сервер ещё есть в подписках — можно подключиться к нему снова.
    const target = findServer(s, e.server);
    const canReconnect = target != null && s.state === "disconnected";
    return (
      <li>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-glass-2">
          <Flag name={e.server} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{splitFlag(e.server).name}</span>
            <span className={cn("block text-[13px] tabular-nums", live ? "text-good" : e.end === "error" ? "text-bad" : "text-ink-2")}>
              {live ? t("Подключено с {0}", [time(e.startedAt)]) : `${time(e.startedAt)}–${time(end)}`} · {humanDuration(dur)}
              {e.end === "system" && t(" · прервано системой")}
              {e.end === "error" && t(" · обрыв")}
            </span>
          </span>
          <span className="shrink-0 text-right text-[13px] text-ink-2 tabular-nums">{formatBytes(e.down + e.up)}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-[var(--dur)]", open && "rotate-180")} aria-hidden />
        </button>
        {open && (
          <div className="anim-status border-t border-edge px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Detail term={t("Начало")} value={`${dateFmt.format(e.startedAt)}, ${time(e.startedAt)}`} />
              <Detail term={t("Длительность")} value={humanDuration(dur)} />
              <Detail term={t("Получено")} value={formatBytes(e.down)} />
              <Detail term={t("Отправлено")} value={formatBytes(e.up)} />
              <Detail term={t("Средняя скорость")} value={formatSpeed(dur > 0 ? (e.down / dur) * 1000 : 0)} />
              <Detail
                term={t("Чем закончилось")}
                value={live ? t("Идёт сейчас") : e.end === "manual" ? t("Отключили вы") : e.end === "system" ? t("Прервала система") : t("Обрыв связи")}
              />
              {e.subscription && <Detail term={t("Подписка")} value={e.subscription} />}
              {e.error && <Detail term={t("Ошибка")} value={e.error} wide />}
            </dl>
            {canReconnect && (
              <Button
                size="sm"
                variant="amber"
                className="mt-3"
                onClick={async () => {
                  await backend.select({ subUrl: target.subUrl, nodeId: target.nodeId });
                  await backend.toggle();
                }}
              >
                <Plug />
                
                {t("Подключиться к нему")}
              </Button>
            )}
          </div>
        )}
      </li>
    );
  }
  const error = e.kind === "error";
  const Icon = error ? TriangleAlert : RefreshCw;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", error ? "border-bad/30 bg-bad/10 text-bad" : "border-edge bg-glass-2 text-ink-2")}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[15px] leading-snug break-words">
          {error && <span className="sr-only">{t("Ошибка:")}{" "}</span>}
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

function Detail({ term, value, wide }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-ink-3">{term}</dt>
      <dd className="break-words text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Столбики по дням. Нажатие выбирает день и фильтрует журнал, повторное — снимает выбор.
 * Переключатель — трафик или время под защитой.
 */
function DayBars({
  bars,
  now,
  metric,
  onMetric,
  selected,
  onSelect,
}: {
  bars: { day: number; bytes: number; ms: number; sessions: number }[];
  now: number;
  metric: Metric;
  onMetric: (m: Metric) => void;
  selected: number | null;
  onSelect: (day: number | null) => void;
}) {
  const value = (b: (typeof bars)[number]) => (metric === "traffic" ? b.bytes : b.ms);
  const show = (v: number) => (metric === "traffic" ? formatBytes(v) : humanDuration(v));
  const max = Math.max(...bars.map(value), 1);
  const many = bars.length > 7;
  const picked = bars.find((b) => b.day === selected) ?? null;
  const total = bars.reduce((n, b) => n + value(b), 0);
  const today = startOfDay(now);

  return (
    <section className="glass rounded-[24px] p-4" aria-labelledby="by-day">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="by-day" className="text-[13px] font-medium text-ink-2">
          
          {t("По дням")}
        </h2>
        <div className="glass flex rounded-full p-0.5" role="group" aria-label={t("Что показать на графике")}>
          {(
            [
              ["traffic", t("Трафик")],
              ["time", t("Время")],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={metric === id}
              onClick={() => onMetric(id)}
              className={cn(
                "h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-[var(--dur)]",
                metric === id ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <Entrance as="p" anim="anim-status" key={`${selected}-${metric}`} className="mb-3 min-h-5 text-[14px] tabular-nums" aria-live="polite">
        {picked ? (
          <>
            <span className="font-medium text-amber">{dayTitle(picked.day, now)}:</span> {show(value(picked))}
            <span className="text-ink-3">
              {" "}
              · {picked.sessions} {plural(picked.sessions, t("сеанс"), t("сеанса"), t("сеансов"))}
            </span>
          </>
        ) : (
          <span className="text-ink-2">
            
            {t("Всего")}{" "}{show(total)} <span className="text-ink-3">{t("· выберите день")}</span>
          </span>
        )}
      </Entrance>

      <div className={cn("flex h-28 items-end", many ? "gap-[3px]" : "gap-2")}>
        {bars.map((b) => {
          const isSel = b.day === selected;
          const v = value(b);
          return (
            <button
              key={b.day}
              type="button"
              onClick={() => onSelect(isSel ? null : b.day)}
              aria-pressed={isSel}
              aria-label={`${dayTitle(b.day, now)}: ${show(v)}`}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-md"
            >
              <span
                className={cn(
                  "block w-full rounded-md transition-[height,background-color,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
                  isSel ? "bg-amber" : b.day === today && selected == null ? "bg-amber/80" : "bg-ink/20 group-hover:bg-ink/35",
                  selected != null && !isSel && "opacity-50",
                )}
                style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : "2px" }}
              />
            </button>
          );
        })}
      </div>
      {!many && (
        <div className="mt-2 flex gap-2" aria-hidden>
          {bars.map((b) => (
            <span key={b.day} className={cn("flex-1 text-center text-[12px]", b.day === selected || (selected == null && b.day === today) ? "text-amber" : "text-ink-3")}>
              {weekday.format(b.day)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  const index = options.findIndex((o) => o.id === value);
  return (
    <div className="glass relative grid gap-1 rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="tablist" aria-label={label}>
      {/* Подложка переезжает к выбранному пункту. */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-xl bg-ink transition-transform duration-[380ms] ease-[var(--ease-out)]"
        style={{
          width: `calc((100% - 8px - ${(options.length - 1) * 4}px) / ${options.length})`,
          transform: `translateX(calc(${index} * (100% + 4px)))`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("relative h-10 rounded-xl text-sm font-medium transition-colors duration-[var(--dur)]", value === o.id ? "text-base" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, removable, children }: { active: boolean; onClick: () => void; removable?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-[var(--dur)]",
        active ? "border-amber/50 bg-amber/12 text-amber" : "border-edge text-ink-2 hover:text-ink",
      )}
    >
      {children}
      {removable && <X className="size-3.5" aria-label={t("убрать")} />}
    </button>
  );
}

/** Найти сервер по названию в текущих подписках, чтобы подключиться к нему снова. */
function findServer(s: Snapshot, name: string) {
  for (const sub of s.subscriptions) {
    const node = sub.nodes.find((n) => !n.divider && n.name === name);
    if (node) return { subUrl: sub.url, nodeId: node.id };
  }
  return null;
}

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long" });
const time = (t: number) => timeFmt.format(t);

function dayTitle(day: number, now: number) {
  const d = startOfDay(day);
  if (d === startOfDay(now)) return t("Сегодня");
  if (d === startOfDay(now - 86_400_000)) return t("Вчера");
  return dateFmt.format(day);
}

/** Крупные числа и мелкие единицы, чтобы «28 ч 56 мин» помещалось в плитку. */
function DurationValue({ ms }: { ms: number }) {
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const unit = "ml-0.5 mr-1.5 font-sans text-[14px] font-medium text-ink-2";
  if (min < 1) return <span className="text-[18px]">{t("меньше минуты")}</span>;
  return (
    <>
      {h > 0 && (
        <>
          {h}
          <span className={unit}>{t("ч")}</span>
        </>
      )}
      {(m > 0 || h === 0) && (
        <>
          {m}
          <span className={unit}>{t("мин")}</span>
        </>
      )}
    </>
  );
}

/** «2 ч 15 мин», «45 мин», «меньше минуты». */
function humanDuration(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("меньше минуты");
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return t("{0} мин", [m]);
  return m ? t("{0} ч {1} мин", [h, m]) : t("{0} ч", [h]);
}

/** Сколько записей журнала на одной странице. */
const JOURNAL_PAGE = 10;

function groupByDay(list: ActivityEntry[]) {
  const groups: { day: number; entries: ActivityEntry[] }[] = [];
  for (const e of list) {
    const day = startOfDay(entryTime(e));
    const last = groups.at(-1);
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

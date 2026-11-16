import { ArrowDown, ArrowUp, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { backend, useSnapshot, type Subscription } from "@/backend";
import { CountryCode, Ping } from "@/components/bits";
import { SavannaScene } from "@/components/SavannaScene";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, formatDuration, formatSpeed, splitFlag } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConnectScreen({ onOpenServers, onAdd }: { onOpenServers: () => void; onAdd: () => void }) {
  const s = useSnapshot();
  const now = useNow(s.connectedAt != null);
  const hasServers = s.subscriptions.some((x) => x.nodes.length > 0);

  const headline = !hasServers
    ? "Добавьте подписку"
    : s.state === "connected"
      ? "Защищено"
      : s.state === "connecting"
        ? "Подключаемся"
        : s.state === "disconnecting"
          ? "Отключаемся"
          : "Не подключено";

  const sub = s.current?.sub ?? s.subscriptions[0] ?? null;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <SavannaScene
        state={s.state}
        onToggle={hasServers ? () => void backend.toggle() : onAdd}
        className="h-[46dvh] min-h-[300px] shrink-0 lg:sticky lg:top-0 lg:h-dvh lg:w-[58%]"
      />

      <div className="flex flex-1 flex-col px-6 pt-7 pb-6 lg:justify-center lg:px-14">
        <div className="lg:max-w-md">
          <h1
            aria-live="polite"
            className={cn(
              "font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] transition-colors duration-700",
              s.state === "connected" ? "text-sun-core" : "text-ink",
            )}
          >
            {headline}
          </h1>

          <p className="mt-2 text-[15px] text-ink-muted tabular-nums">
            {!hasServers
              ? "Скопируйте ссылку из личного кабинета или Telegram-бота BaobabVPN, и все серверы появятся сами."
              : s.connectedAt != null
                ? `Подключено ${formatDuration(now - s.connectedAt)}`
                : "Трафик идёт напрямую, без защиты."}
          </p>

          {!hasServers && (
            <Button variant="sun" className="mt-6 w-full sm:w-auto" onClick={onAdd}>
              Добавить подписку
            </Button>
          )}

          {s.error && (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-row bg-danger/10 py-3 pr-2 pl-4 text-[15px] text-ink">
              <span className="flex-1 pt-1">{s.error}</span>
              <button
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
                onClick={() => backend.clearError()}
                aria-label="Скрыть ошибку"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {sub?.announce && (
            <p className="mt-5 border-l-2 border-sun pl-4 text-[15px] leading-relaxed text-ink">{sub.announce}</p>
          )}

          {s.current && (
            <button
              onClick={onOpenServers}
              className="mt-7 flex w-full items-center gap-4 rounded-row bg-dusk px-4 py-3.5 text-left transition-colors hover:bg-dusk-2"
            >
              <CountryCode name={s.current.node.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">
                  {splitFlag(s.current.node.name).name}
                </span>
                <span className="block truncate text-sm text-ink-muted">
                  {s.selected ? s.current.node.transport : `Выбран автоматически, ${s.current.node.transport}`}
                </span>
              </span>
              <Ping ms={s.current.node.pingMs} />
              <ChevronRight className="size-5 shrink-0 text-ink-faint" aria-hidden />
            </button>
          )}

          {s.state === "connected" && s.downSpeed != null && (
            <dl className="mt-4 flex gap-8 px-1 text-[15px] tabular-nums">
              <div className="flex items-center gap-2">
                <dt className="text-ink-faint">
                  <ArrowDown className="size-4" aria-label="Загрузка" />
                </dt>
                <dd>{formatSpeed(s.downSpeed)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-ink-faint">
                  <ArrowUp className="size-4" aria-label="Отдача" />
                </dt>
                <dd>{formatSpeed(s.upSpeed ?? 0)}</dd>
              </div>
            </dl>
          )}

          {sub && <SubscriptionLine sub={sub} />}
        </div>
      </div>
    </div>
  );
}

function SubscriptionLine({ sub }: { sub: Subscription }) {
  const unlimited = sub.totalBytes <= 0;
  const used = unlimited ? 0 : Math.min(1, sub.usedBytes / sub.totalBytes);
  const daysLeft = sub.expireAt ? Math.floor((sub.expireAt - Date.now()) / 86_400_000) : null;
  const expiring = daysLeft != null && daysLeft < 3;

  return (
    <div className="mt-8 border-t border-line pt-5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium text-ink">{sub.title}</span>
        <span className="text-ink-muted tabular-nums">
          {unlimited ? "Безлимит" : `${formatBytes(sub.usedBytes)} из ${formatBytes(sub.totalBytes)}`}
        </span>
      </div>
      {!unlimited && (
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-dusk-2"
          role="progressbar"
          aria-label="Использованный трафик"
          aria-valuenow={Math.round(used * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", used > 0.9 ? "bg-danger" : "bg-ink-muted")}
            style={{ width: `${used * 100}%` }}
          />
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className={expiring ? "text-danger" : "text-ink-faint"}>
          {sub.expireAt == null
            ? "Бессрочная подписка"
            : daysLeft! < 0
              ? `Подписка закончилась ${formatDate(sub.expireAt)}`
              : `Действует до ${formatDate(sub.expireAt)}`}
        </span>
        <span className="flex gap-4">
          {sub.webPageUrl && (
            <a className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href={sub.webPageUrl} target="_blank" rel="noreferrer">
              Продлить
            </a>
          )}
          {sub.supportUrl && (
            <a className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href={sub.supportUrl} target="_blank" rel="noreferrer">
              Поддержка
            </a>
          )}
        </span>
      </div>
    </div>
  );
}

/** Текущее время, обновляется раз в секунду, пока идёт таймер подключения. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

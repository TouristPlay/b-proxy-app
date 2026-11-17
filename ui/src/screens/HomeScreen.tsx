import { Entrance, useEntrance } from "@/lib/motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ClipboardPaste,
  ExternalLink,
  LoaderCircle,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Flag, SignalPing } from "@/components/bits";
import { PowerOrb } from "@/components/PowerOrb";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  daysLeft,
  formatDuration,
  formatSpeed,
  formatBytes,
  splitFlag,
} from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";

export function HomeScreen({
  onOpenServers,
  onAdd,
}: {
  onOpenServers: () => void;
  onAdd: () => void;
}) {
  const s = useSnapshot();
  const now = useNow(s.connectedAt != null);
  const sub = s.current?.sub ?? s.subscriptions[0] ?? null;
  const hasServers = s.current != null;
  const on = s.state === "connected";
  const days = sub ? daysLeft(sub.expireAt) : null;
  const expired = days === 0;
  const [pasting, setPasting] = useState(false);

  /** «Вставить»: берём ссылку из буфера и сразу добавляем; если не вышло — открываем форму. */
  async function paste() {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Нет доступа к буферу — пусть человек вставит вручную.
    }
    if (!/^https?:\/\//.test(text)) {
      onAdd();
      return;
    }
    setPasting(true);
    try {
      await backend.addSubscription(text);
    } catch {
      // Ошибку и ссылку покажет форма: там её можно поправить.
      onAdd();
    } finally {
      setPasting(false);
    }
  }

  const title = on
    ? "Защищено"
    : s.state === "connecting"
      ? "Подключаемся"
      : s.state === "disconnecting"
        ? "Отключаемся"
        : "Не защищено";
  const hint =
    s.state === "connecting"
      ? "Если система спросит разрешение — подтвердите. Нажмите ещё раз, чтобы отменить"
      : hasServers
        ? "Нажмите, чтобы подключиться"
        : "Вставьте ссылку на подписку из личного кабинета или Telegram-бота";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[92px]">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src={logo}
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full"
          />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            B-Proxy
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasServers && (
            <button
              type="button"
              onClick={onAdd}
              aria-label="Добавить подписку"
              title="Добавить подписку"
              className="glass flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-amber"
            >
              <Plus className="size-5" />
            </button>
          )}
        </div>
      </header>

      {/* Кнопка с состоянием занимает свободную высоту и стоит по центру; сервер и подписка — внизу.
          Отступы и размеры от высоты экрана: на обычных телефонах главная помещается без прокрутки. */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mt-[clamp(8px,2.5dvh,24px)] flex justify-center">
          <PowerOrb
            state={s.state}
            speed={s.downSpeed}
            onToggle={hasServers ? () => void backend.toggle() : onAdd}
            label={hasServers ? undefined : "Добавить подписку"}
            size="clamp(150px, min(72vw, 22dvh), 300px)"
          />
        </div>

        <Entrance
          as="h1"
          anim="anim-status"
          key={hasServers ? title : "empty"}
          aria-live="polite"
          className={cn(
            "mt-[clamp(4px,1.5dvh,20px)] text-center font-display text-[clamp(26px,4dvh,34px)] leading-tight font-semibold tracking-[-0.025em]",
            on &&
              "bg-gradient-to-b from-amber-2 to-amber bg-clip-text text-transparent",
          )}
        >
          {hasServers ? title : "Добавьте подписку"}
        </Entrance>

        <div className="mt-[clamp(6px,1.2dvh,12px)] flex justify-center">
          {on && s.current && s.connectedAt ? (
            <LiveBar
              time={formatDuration(now - s.connectedAt)}
              down={s.downSpeed ?? 0}
              up={s.upSpeed ?? 0}
              downTotal={s.downTotal}
              upTotal={s.upTotal}
            />
          ) : (
            <Entrance
              as="p"
              anim="anim-status"
              key={hint}
              className="max-w-[30ch] text-center text-[15px] text-balance text-ink-2"
            >
              {hint}
            </Entrance>
          )}
        </div>
      </div>

      <ErrorBanner onOpenServers={onOpenServers} className="mt-5" />

      {/* Подписка закончилась — подключение не заработает, сразу ведём продлевать. */}
      {expired && sub && !s.error && (
        <div
          role="alert"
          className="mt-5 rounded-[20px] border border-warn/40 bg-warn/10 p-4 text-[15px]"
        >
          <p className="flex items-start gap-3 leading-snug">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-warn"
              aria-hidden
            />
            Подписка закончилась. Продлите её, чтобы серверы снова работали
          </p>
          {sub.webPageUrl && (
            <a
              href={sub.webPageUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "amber",
                size: "sm",
                className: "mt-3 ml-8",
              })}
            >
              <ExternalLink />
              Продлить
            </a>
          )}
        </div>
      )}

      {!hasServers && (
        <div className="mt-8 flex flex-col gap-2">
          <Button
            variant="amber"
            onClick={() => void paste()}
            disabled={pasting}
          >
            {pasting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <ClipboardPaste />
            )}
            {pasting ? "Загружаем…" : "Вставить ссылку"}
          </Button>
          <Button variant="ghost" onClick={onAdd} disabled={pasting}>
            <Plus />
            Ввести вручную
          </Button>
        </div>
      )}


      {s.current && (
        <div className="glass mt-[clamp(10px,2dvh,16px)] divide-y divide-edge overflow-hidden rounded-[24px]">
          <button
            onClick={onOpenServers}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-glass-2"
          >
            <Flag name={s.current.node.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {splitFlag(s.current.node.name).name}
              </span>
              <span className="block text-[13px] text-ink-2">
                {s.selected
                  ? "Выбран вручную · сменить"
                  : s.pinging
                    ? "Ищем быстрый сервер…"
                    : "Автовыбор по пингу · сменить"}
              </span>
            </span>
            <SignalPing ms={s.current.node.pingMs} />
            <ChevronRight className="size-5 text-ink-3" aria-hidden />
          </button>
        </div>
      )}

      {sub && (
        <SubscriptionCard sub={sub} className="mt-[clamp(10px,2dvh,16px)]" />
      )}
    </div>
  );
}

/**
 * Строка под «Защищено»: время сеанса, скорость и объём в обе стороны.
 * Одна компактная строка вместо двух плиток — главная помещается на экран и при подключении.
 * Подробнее (график, журнал) — во вкладке «Активность».
 */
function LiveBar({
  time,
  down,
  up,
  downTotal,
  upTotal,
}: {
  time: string;
  down: number;
  up: number;
  downTotal: number;
  upTotal: number;
}) {
  const rise = useEntrance("anim-rise");
  return (
    <div
      className={cn(
        "glass grid w-full grid-cols-3 divide-x divide-edge rounded-[20px] border-good/25 py-2 text-center tabular-nums",
        rise,
      )}
      aria-label="Текущее подключение"
    >
      <span className="px-2">
        <span className="flex items-center justify-center gap-1.5 text-[12px] text-good">
          <span className="size-1.5 rounded-full bg-good" aria-hidden />
          Время
        </span>
        <span className="mt-0.5 block font-display text-[16px] font-semibold">{time}</span>
      </span>
      <span className="px-2">
        <span className="flex items-center justify-center gap-1 text-[12px] text-ink-2">
          <ArrowDown className="size-3.5 text-good" aria-hidden />
          {formatBytes(downTotal)}
        </span>
        <span className="mt-0.5 block font-display text-[16px] font-semibold" aria-label={`Загрузка ${formatSpeed(down)}`}>
          {formatSpeed(down)}
        </span>
      </span>
      <span className="px-2">
        <span className="flex items-center justify-center gap-1 text-[12px] text-ink-2">
          <ArrowUp className="size-3.5 text-tag-tls" aria-hidden />
          {formatBytes(upTotal)}
        </span>
        <span className="mt-0.5 block font-display text-[16px] font-semibold" aria-label={`Отдача ${formatSpeed(up)}`}>
          {formatSpeed(up)}
        </span>
      </span>
    </div>
  );
}

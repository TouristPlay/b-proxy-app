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
import { type ReactNode, useState } from "react";
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
  splitBytes,
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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-24">
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
            size="clamp(150px, min(72vw, 25dvh), 300px)"
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
            <Entrance
              as="span"
              anim="anim-rise"
              className="flex items-center gap-2 rounded-full border border-good/30 bg-good/10 px-4 py-1.5 text-[14px] font-medium text-good tabular-nums"
            >
              <span className="size-2 rounded-full bg-good" aria-hidden />
              {splitFlag(s.current.node.name).name} ·{" "}
              {formatDuration(now - s.connectedAt)}
            </Entrance>
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

      {on && s.downSpeed != null && (
        <div className="mt-[clamp(12px,2.5dvh,24px)] grid grid-cols-2 gap-3">
          <Stat
            icon={<ArrowDown className="size-4" />}
            label="Получено"
            bytes={s.downTotal}
            speed={s.downSpeed}
            delay={0}
          />
          <Stat
            icon={<ArrowUp className="size-4" />}
            label="Отправлено"
            bytes={s.upTotal}
            speed={s.upSpeed ?? 0}
            delay={70}
          />
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

function Stat({
  icon,
  label,
  bytes,
  speed,
  delay,
}: {
  icon: ReactNode;
  label: string;
  bytes: number;
  speed: number;
  delay: number;
}) {
  const { value, unit } = splitBytes(bytes);
  const rise = useEntrance("anim-rise");
  return (
    <div
      className={cn("glass rounded-[22px] px-4 py-3.5", rise)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="mt-1 tabular-nums">
        <span className="font-display text-[26px] font-medium tracking-tight">
          {value}
        </span>
        <span className="ml-1 text-[13px] text-ink-2">{unit}</span>
      </p>
      <p className="text-[12.5px] text-ink-3 tabular-nums">
        {formatSpeed(speed)}
      </p>
    </div>
  );
}

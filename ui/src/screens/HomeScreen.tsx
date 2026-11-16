import { ArrowDown, ArrowUp, ChevronRight, ClipboardPaste, ExternalLink, LoaderCircle, Megaphone, Plus, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { backend, useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Flag, SignalPing } from "@/components/bits";
import { PowerOrb } from "@/components/PowerOrb";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { daysLeft, formatDuration, formatSpeed, splitBytes, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";

export function HomeScreen({ onOpenServers, onAdd }: { onOpenServers: () => void; onAdd: () => void }) {
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

  const title = on ? "Защищено" : s.state === "connecting" ? "Подключаемся" : s.state === "disconnecting" ? "Отключаемся" : "Не защищено";
  const hint =
    s.state === "connecting"
      ? "Если система спросит разрешение — подтвердите. Нажмите ещё раз, чтобы отменить"
      : hasServers
        ? "Нажмите, чтобы подключиться"
        : "Вставьте ссылку на подписку из личного кабинета или Telegram-бота";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" width={32} height={32} className="size-8 rounded-full" />
          <span className="font-display text-[17px] font-semibold tracking-tight">B-Proxy</span>
        </div>
        {sub && (
          <span className="glass rounded-full px-3.5 py-1.5 text-[13px] text-ink-2 tabular-nums">
            {sub.plan ?? sub.title}
            {days != null && ` · ${days} дн.`}
          </span>
        )}
      </header>

      <div className="mt-6 flex justify-center">
        <PowerOrb
          state={s.state}
          speed={s.downSpeed}
          onToggle={hasServers ? () => void backend.toggle() : onAdd}
          label={hasServers ? undefined : "Добавить подписку"}
          size={Math.min(300, window.innerWidth * 0.78)}
        />
      </div>

      <h1
        key={hasServers ? title : "empty"}
        aria-live="polite"
        className={cn(
          "anim-status mt-5 text-center font-display text-[34px] leading-tight font-semibold tracking-[-0.025em]",
          on && "bg-gradient-to-b from-amber-2 to-amber bg-clip-text text-transparent",
        )}
      >
        {hasServers ? title : "Добавьте подписку"}
      </h1>

      <div className="mt-3 flex justify-center">
        {on && s.current && s.connectedAt ? (
          <span className="anim-rise flex items-center gap-2 rounded-full border border-good/30 bg-good/10 px-4 py-1.5 text-[14px] font-medium text-good tabular-nums">
            <span className="size-2 rounded-full bg-good" aria-hidden />
            {splitFlag(s.current.node.name).name} · {formatDuration(now - s.connectedAt)}
          </span>
        ) : (
          <p key={hint} className="anim-status max-w-[30ch] text-center text-[15px] text-balance text-ink-2">
            {hint}
          </p>
        )}
      </div>

      <ErrorBanner onOpenServers={onOpenServers} className="mt-5" />

      {/* Подписка закончилась — подключение не заработает, сразу ведём продлевать. */}
      {expired && sub && !s.error && (
        <div role="alert" className="mt-5 rounded-[20px] border border-warn/40 bg-warn/10 p-4 text-[15px]">
          <p className="flex items-start gap-3 leading-snug">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
            Подписка закончилась. Продлите её, чтобы серверы снова работали
          </p>
          {sub.webPageUrl && (
            <a href={sub.webPageUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "amber", size: "sm", className: "mt-3 ml-8" })}>
              <ExternalLink />
              Продлить
            </a>
          )}
        </div>
      )}

      {!hasServers && (
        <div className="mt-8 flex flex-col gap-2">
          <Button variant="amber" onClick={() => void paste()} disabled={pasting}>
            {pasting ? <LoaderCircle className="animate-spin" /> : <ClipboardPaste />}
            {pasting ? "Загружаем…" : "Вставить ссылку"}
          </Button>
          <Button variant="ghost" onClick={onAdd} disabled={pasting}>
            <Plus />
            Ввести вручную
          </Button>
        </div>
      )}

      {on && s.downSpeed != null && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat icon={<ArrowDown className="size-4" />} label="Получено" bytes={s.downTotal} speed={s.downSpeed} delay={0} />
          <Stat icon={<ArrowUp className="size-4" />} label="Отправлено" bytes={s.upTotal} speed={s.upSpeed ?? 0} delay={70} />
        </div>
      )}

      {s.current && (
        <div className="glass mt-4 divide-y divide-edge overflow-hidden rounded-[24px]">
          <button onClick={onOpenServers} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-glass-2">
            <Flag name={s.current.node.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{splitFlag(s.current.node.name).name}</span>
              <span className="block text-[13px] text-ink-2">
                {s.selected ? "Выбран вручную · сменить" : s.pinging ? "Ищем быстрый сервер…" : "Автовыбор по пингу · сменить"}
              </span>
            </span>
            <SignalPing ms={s.current.node.pingMs} />
            <ChevronRight className="size-5 text-ink-3" aria-hidden />
          </button>
        </div>
      )}

      {sub?.announce && (
        <div className="glass mt-4 flex gap-3 rounded-[20px] px-4 py-3.5 text-[15px] leading-snug whitespace-pre-line">
          <Megaphone className="mt-0.5 size-[18px] shrink-0 text-amber" aria-hidden />
          {sub.announce}
        </div>
      )}

      {sub && <SubscriptionCard sub={sub} className="mt-4" />}
    </div>
  );
}

function Stat({ icon, label, bytes, speed, delay }: { icon: ReactNode; label: string; bytes: number; speed: number; delay: number }) {
  const { value, unit } = splitBytes(bytes);
  return (
    <div className="glass anim-rise rounded-[22px] px-4 py-3.5" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="mt-1 tabular-nums">
        <span className="font-display text-[26px] font-medium tracking-tight">{value}</span>
        <span className="ml-1 text-[13px] text-ink-2">{unit}</span>
      </p>
      <p className="text-[12.5px] text-ink-3 tabular-nums">{formatSpeed(speed)}</p>
    </div>
  );
}

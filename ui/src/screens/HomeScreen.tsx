import { ArrowDown, ArrowUp, ChevronRight, ClipboardPaste, Megaphone, Plus, ShieldCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import { backend, useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { Flag, IconTile, SignalPing } from "@/components/bits";
import { PowerOrb } from "@/components/PowerOrb";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Button } from "@/components/ui/button";
import { daysLeft, formatDate, formatDuration, formatSpeed, splitBytes, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";

export function HomeScreen({ onOpenServers, onAdd }: { onOpenServers: () => void; onAdd: () => void }) {
  const s = useSnapshot();
  const now = useNow(s.connectedAt != null);
  const sub = s.current?.sub ?? s.subscriptions[0] ?? null;
  const hasServers = s.current != null;
  const on = s.state === "connected";
  const days = sub ? daysLeft(sub.expireAt) : null;

  /** «Вставить»: берём ссылку из буфера; если не вышло — открываем форму. */
  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\//.test(text)) {
        await backend.addSubscription(text);
        return;
      }
    } catch {
      // Нет доступа к буферу — пусть человек вставит вручную.
    }
    onAdd();
  }

  const title = on ? "Защищено" : s.state === "connecting" ? "Подключаемся" : s.state === "disconnecting" ? "Отключаемся" : "Не защищено";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="" className="size-8 rounded-full" />
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
        <PowerOrb state={s.state} onToggle={hasServers ? () => void backend.toggle() : onAdd} size={Math.min(300, window.innerWidth * 0.78)} />
      </div>

      <h1
        aria-live="polite"
        className={cn(
          "mt-5 text-center font-display text-[34px] leading-tight font-semibold tracking-[-0.025em]",
          on && "bg-gradient-to-b from-amber-2 to-amber bg-clip-text text-transparent",
        )}
      >
        {hasServers ? title : "Нет серверов"}
      </h1>

      <div className="mt-3 flex justify-center">
        {on && s.current && s.connectedAt ? (
          <span className="flex items-center gap-2 rounded-full border border-good/30 bg-good/10 px-4 py-1.5 text-[14px] font-medium text-good tabular-nums">
            <span className="size-2 rounded-full bg-good" aria-hidden />
            {splitFlag(s.current.node.name).name} · {formatDuration(now - s.connectedAt)}
          </span>
        ) : (
          <p className="text-center text-[15px] text-ink-2">
            {hasServers ? "Нажмите, чтобы подключиться" : "Добавьте ссылку на подписку или конфигурацию сервера"}
          </p>
        )}
      </div>

      {s.error && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-[20px] border border-bad/30 bg-bad/10 py-3 pr-2 pl-4 text-[15px]">
          <span className="flex-1 pt-1">{s.error}</span>
          <button className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:text-ink" onClick={() => backend.clearError()} aria-label="Скрыть ошибку">
            <X className="size-4" />
          </button>
        </div>
      )}

      {!hasServers && (
        <div className="mt-8 grid grid-cols-2 gap-2">
          <Button variant="amber" onClick={onAdd}>
            <Plus />
            Добавить
          </Button>
          <Button variant="glass" onClick={() => void paste()}>
            <ClipboardPaste />
            Вставить
          </Button>
        </div>
      )}

      {on && s.downSpeed != null && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat icon={<ArrowDown className="size-4" />} label="Получено" bytes={s.downTotal} speed={s.downSpeed} />
          <Stat icon={<ArrowUp className="size-4" />} label="Отправлено" bytes={s.upTotal} speed={s.upSpeed ?? 0} />
        </div>
      )}

      {s.current && (
        <div className="glass mt-4 divide-y divide-edge overflow-hidden rounded-[24px]">
          <button onClick={onOpenServers} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-glass-2">
            <Flag name={s.current.node.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{splitFlag(s.current.node.name).name}</span>
              <span className="block text-[13px] text-ink-2">
                {s.selected ? "Выбран вручную" : "Автовыбор по пингу"}
              </span>
            </span>
            <SignalPing ms={s.current.node.pingMs} />
            <ChevronRight className="size-5 text-ink-3" aria-hidden />
          </button>
          {!on && (
            <>
              {sub?.expireAt && (
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <IconTile icon={ShieldCheck} tone="green" />
                  <span className="flex-1 font-medium">Подписка</span>
                  <span className="text-[15px] text-ink-2">до {formatDate(sub.expireAt)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {sub?.announce && (
        <div className="glass mt-4 flex gap-3 rounded-[20px] px-4 py-3.5 text-[15px] leading-snug">
          <Megaphone className="mt-0.5 size-[18px] shrink-0 text-amber" aria-hidden />
          {sub.announce}
        </div>
      )}

      {sub && <SubscriptionCard sub={sub} className="mt-4" />}
    </div>
  );
}

function Stat({ icon, label, bytes, speed }: { icon: ReactNode; label: string; bytes: number; speed: number }) {
  const { value, unit } = splitBytes(bytes);
  return (
    <div className="glass rounded-[22px] px-4 py-3.5">
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

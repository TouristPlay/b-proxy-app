import { ArrowDown, ArrowUp, Gauge, Globe2, LoaderCircle, Lock, Plus, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { backend, useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { PowerOrb } from "@/components/PowerOrb";
import { ServerList } from "@/components/ServerList";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatSpeed, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";
import { ActivityScreen } from "./ActivityScreen";
import { SettingsScreen } from "./SettingsScreen";

type Tab = "home" | "activity" | "settings";

/** Компьютер: слева панель серверов, справа главная или настройки. */
export function DesktopLayout({ onAdd }: { onAdd: () => void }) {
  const s = useSnapshot();
  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow(s.connectedAt != null);
  const canPing = s.state === "disconnected";

  return (
    <div className="grid h-dvh grid-cols-[minmax(320px,360px)_1fr] gap-5 p-5">
      <aside className="glass flex min-h-0 flex-col rounded-[28px]" aria-label="Серверы">
        <div className="flex items-center gap-1 px-5 pt-5 pb-3">
          <img src={logo} alt="" width={32} height={32} className="mr-2 size-8 rounded-full" />
          <h2 className="flex-1 font-display text-[17px] font-semibold tracking-tight">Серверы</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Проверить пинг"
            title={canPing ? "Проверить пинг" : "Пинг проверяется при выключенном VPN"}
            disabled={!canPing || s.pinging}
            onClick={() => void backend.pingAll()}
          >
            <Gauge className={cn(s.pinging && "animate-pulse")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Обновить подписки"
            title="Обновить подписки"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await backend.refreshSubscriptions().finally(() => setRefreshing(false));
            }}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <ServerList compact />
        </div>
        <div className="border-t border-edge p-4">
          <Button variant="glass" className="w-full" onClick={onAdd}>
            <Plus />
            Добавить подписку
          </Button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-4">
          <span className="w-40" />
          <nav className="glass flex gap-1 rounded-full p-1" aria-label="Разделы">
            {(
              [
                ["home", "Главная"],
                ["activity", "Активность"],
                ["settings", "Настройки"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "h-10 rounded-full px-6 text-[15px] font-medium transition-colors duration-[var(--dur)]",
                  tab === id ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          <span className="flex w-40 justify-end">
            {s.current && (
              <span
                className={cn(
                  "glass flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 tabular-nums",
                  s.state === "connected" && "border-good/40",
                )}
              >
                <Flag name={s.current.node.name} size="sm" className="rounded-full" />
                <span className="font-display text-[15px] font-semibold">
                  {s.connectedAt ? formatDuration(now - s.connectedAt) : "—:—"}
                </span>
              </span>
            )}
          </span>
        </header>

        <div key={tab} className="anim-screen mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === "home" ? (
            <DesktopHome now={now} onAdd={onAdd} />
          ) : (
            <div className="mx-auto max-w-2xl pb-8">
              {tab === "activity" ? <ActivityScreen embedded /> : <SettingsScreen embedded />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DesktopHome({ now, onAdd }: { now: number; onAdd: () => void }) {
  const s = useSnapshot();
  const on = s.state === "connected";
  const busy = s.state === "connecting" || s.state === "disconnecting";
  const node = s.current?.node;
  const sub = s.current?.sub ?? s.subscriptions[0] ?? null;
  const status = on ? "Защищено" : s.state === "connecting" ? "Подключаемся" : s.state === "disconnecting" ? "Отключаемся" : "Не защищено";

  return (
    <div className="grid gap-5 pb-6 xl:grid-cols-2">
      <section className="flex items-center gap-8 xl:col-span-2">
        <div className="min-w-0 flex-1">
          <p className={cn("flex items-center gap-2 text-[14px] font-medium", on ? "text-good" : "text-ink-2")} aria-live="polite">
            <span className={cn("size-2 rounded-full", on ? "bg-good" : "bg-ink-3")} aria-hidden />
            {status}
          </p>
          <h1 className="mt-2 truncate font-display text-[clamp(36px,4.6vw,60px)] leading-[1.05] font-semibold tracking-[-0.03em]">
            {node ? splitFlag(node.name).name.split(" · ")[0] : "Добавьте подписку"}
          </h1>
          {node && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-2">
              <span>{splitFlag(node.name).name.split(" · ")[1] ?? (s.selected ? "Выбран вручную" : "Автовыбор")}</span>
              <Tags tags={node.tags} />
              <SignalPing ms={node.pingMs} />
            </div>
          )}
          <div className="mt-6 flex gap-3">
            {node ? (
              <Button
                variant={on || busy ? "glass" : "amber"}
                className="px-7"
                disabled={s.state === "disconnecting"}
                onClick={() => void backend.toggle()}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Power />}
                {on ? "Отключиться" : s.state === "connecting" ? "Отменить" : busy ? "Отключаемся…" : "Подключиться"}
              </Button>
            ) : (
              <Button variant="amber" onClick={onAdd}>
                <Plus />
                Добавить подписку
              </Button>
            )}
          </div>
          {s.state === "connecting" && (
            <p className="mt-3 text-[14px] text-ink-2">Если система спросит пароль или разрешение — подтвердите</p>
          )}
          <ErrorBanner className="mt-4 max-w-xl" />
        </div>
        <PowerOrb
          state={s.state}
          speed={s.downSpeed}
          onToggle={node ? () => void backend.toggle() : onAdd}
          label={node ? undefined : "Добавить подписку"}
          size={240}
          className="shrink-0"
        />
      </section>

      <Tile title="Время">
        <p className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {s.connectedAt ? formatDuration(now - s.connectedAt) : "00:00:00"}
        </p>
        <p className="mt-3 text-[14px] text-ink-2">{on ? "Сеанс идёт" : "VPN выключен"}</p>
      </Tile>

      <Tile title="Скорость">
        <div className="flex gap-6 text-[15px] tabular-nums">
          <span className="flex items-center gap-1.5">
            <ArrowDown className="size-4 text-good" aria-label="Загрузка" />
            {formatSpeed(s.downSpeed ?? 0)}
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowUp className="size-4 text-tag-tls" aria-label="Отдача" />
            {formatSpeed(s.upSpeed ?? 0)}
          </span>
        </div>
        <Sparkline values={s.speedHistory} />
      </Tile>

      <Tile title="Сеть">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-[13px] font-medium", on ? "bg-good/12 text-good" : "bg-glass-2 text-ink-2")}>
            {on ? "Защищено" : "Напрямую"}
          </span>
          {node && <Tags tags={node.tags} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <Chip icon={<Lock className="size-3.5" />} text={s.settings.ipv6 ? "IPv6 через VPN" : "IPv6 закрыт"} />
          <Chip icon={<Globe2 className="size-3.5" />} text="DNS в туннеле" />
          {s.settings.tlsFragment && <Chip icon={<ShieldCheck className="size-3.5" />} text="Обход DPI" />}
        </div>
        <p className="mt-4 text-[14px] text-ink-2 tabular-nums">
          ↓ {formatBytes(s.downTotal)} ↑ {formatBytes(s.upTotal)} за сеанс
        </p>
      </Tile>

      {sub && <SubscriptionCard sub={sub} />}
    </div>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-[28px] p-5" aria-label={title}>
      <h2 className="mb-4 text-[13px] font-medium text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-edge-2 px-3 py-1 text-ink-2">
      <span aria-hidden>{icon}</span>
      {text}
    </span>
  );
}

/** Маленький график скорости загрузки за последние 40 секунд. */
function Sparkline({ values }: { values: number[] }) {
  const w = 300;
  const h = 64;
  const pts = values.length > 1 ? values : [0, 0];
  const max = Math.max(...pts, 1);
  const step = w / (pts.length - 1);
  const line = pts.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v / max) * (h - 10)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-amber)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--color-amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#spark)" />
      <polyline points={line} fill="none" stroke="var(--color-amber)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

import { demoTab } from "@/lib/demoHash";
import { markScreenEnter } from "@/lib/motion";
import { ArrowDown, ArrowUp, Globe2, LoaderCircle, Lock, Plus, Power, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { backend, useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { PowerOrb } from "@/components/PowerOrb";
import { AllProvidersActions, ServerList } from "@/components/ServerList";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SmoothChart } from "@/components/SmoothChart";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatSpeed, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
import { cn } from "@/lib/utils";
import { ActivityScreen } from "./ActivityScreen";
import { SettingsScreen } from "./SettingsScreen";
import { t } from "@/lib/i18n";

type Tab = "home" | "activity" | "settings";

/** Компьютер: слева панель серверов, справа главная или настройки. */
export function DesktopLayout({ onAdd }: { onAdd: () => void }) {
  const s = useSnapshot();
  const [tab, setTabState] = useState<Tab>(() => demoTab(["home", "activity", "settings"] as const, "home"));
  // Новый экран: элементы, пришедшие вместе с ним, не анимируются (lib/motion).
  const setTab = (next: Tab) => {
    if (next === tab) return;
    markScreenEnter();
    setTabState(next);
  };
  const now = useNow(s.connectedAt != null);

  return (
    <div className="grid h-dvh grid-cols-[clamp(380px,36vw,500px)_minmax(0,1fr)] gap-5 p-5">
      <aside className="glass flex min-h-0 flex-col rounded-[28px]" aria-label={t("Серверы")}>
        <div className="flex items-center gap-1 px-5 pt-5 pb-3">
          <img src={logo} alt="" width={32} height={32} className="mr-2 size-8 rounded-full" />
          <h2 className="flex-1 font-display text-[17px] font-semibold tracking-tight">{t("Серверы")}</h2>
          <AllProvidersActions />
          <button
            type="button"
            onClick={onAdd}
            aria-label={t("Добавить подписку")}
            title={t("Добавить подписку")}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-amber/35 bg-amber/14 text-amber transition-colors hover:bg-amber/22"
          >
            <Plus className="size-5" strokeWidth={2.2} />
          </button>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-4 pb-4">
          <ServerList compact />
        </div>
      </aside>

      <main className="min-w-0 flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-4">
          <span className="w-40" />
          <nav className="glass flex gap-1 rounded-full p-1" aria-label={t("Разделы")}>
            {(
              [
                ["home", t("Главная")],
                ["activity", t("Активность")],
                ["settings", t("Настройки")],
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

        <div key={tab} className="scroll-area mt-5 min-h-0 flex-1 pr-1">
          {tab === "home" ? (
            <DesktopHome now={now} onAdd={onAdd} />
          ) : (
            <div className="mx-auto max-w-2xl pb-8">
              {tab === "activity" ? <ActivityScreen embedded /> : <SettingsScreen embedded onAdd={onAdd} />}
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
  const status = on ? t("Защищено") : s.state === "connecting" ? t("Подключаемся") : s.state === "disconnecting" ? t("Отключаемся") : t("Не защищено");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <section className="flex items-center gap-8 xl:col-span-2">
        <div className="min-w-0 flex-1">
          <p className={cn("flex items-center gap-2 text-[14px] font-medium", on ? "text-good" : "text-ink-2")} aria-live="polite">
            <span className={cn("size-2 rounded-full", on ? "bg-good" : "bg-ink-3")} aria-hidden />
            {status}
          </p>
          <h1 className="mt-2 truncate font-display text-[clamp(36px,4.6vw,60px)] leading-[1.05] font-semibold tracking-[-0.03em]">
            {node ? splitFlag(node.name).name.split(" · ")[0] : t("Добавьте подписку")}
          </h1>
          {node && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-2">
              <span>{splitFlag(node.name).name.split(" · ")[1] ?? (s.selected ? t("Выбран вручную") : t("Автовыбор"))}</span>
              <Tags tags={node.tags} />
              <SignalPing ms={node.pingMs} />
            </div>
          )}
          <div className="relative mt-6 flex gap-3">
            {node ? (
              <Button
                variant={on || busy ? "glass" : "amber"}
                className="px-7"
                disabled={s.state === "disconnecting"}
                onClick={() => void backend.toggle()}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Power />}
                {on ? t("Отключиться") : s.state === "connecting" ? t("Отменить") : busy ? t("Отключаемся…") : t("Подключиться")}
              </Button>
            ) : (
              <Button variant="amber" onClick={onAdd}>
                <Plus />
                
                {t("Добавить подписку")}
              </Button>
            )}
            {/* Подсказка поверх свободного места под кнопкой: блок не меняет высоту, прокрутка не появляется. */}
            {s.state === "connecting" && (
              <p className="absolute top-full left-0 mt-3 text-[14px] whitespace-nowrap text-ink-2">
                {t("Если система спросит пароль или разрешение — подтвердите")}
              </p>
            )}
          </div>
          <ErrorBanner className="mt-4 max-w-xl" />
        </div>
        <PowerOrb
          state={s.state}
          speed={s.downSpeed}
          onToggle={node ? () => void backend.toggle() : onAdd}
          label={node ? undefined : t("Добавить подписку")}
          size="clamp(160px, 17vw, 240px)"
          className="shrink-0"
        />
      </section>

      <Tile title={t("Время")}>
        <p className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {s.connectedAt ? formatDuration(now - s.connectedAt) : "00:00:00"}
        </p>
        <p className="mt-3 text-[14px] text-ink-2">{on ? t("Сеанс идёт") : t("VPN выключен")}</p>
      </Tile>

      <Tile title={t("Скорость")}>
        <div className="flex gap-6 text-[15px] tabular-nums">
          <span className="flex items-center gap-1.5">
            <ArrowDown className="size-4 text-good" aria-label={t("Загрузка")} />
            {formatSpeed(s.downSpeed ?? 0)}
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowUp className="size-4 text-tag-tls" aria-label={t("Отдача")} />
            {formatSpeed(s.upSpeed ?? 0)}
          </span>
        </div>
        <Sparkline values={s.speedHistory} />
      </Tile>

      <Tile title={t("Сеть")}>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-3 py-1 text-[13px] font-medium", on ? "bg-good/12 text-good" : "bg-glass-2 text-ink-2")}>
            {on ? t("Защищено") : t("Напрямую")}
          </span>
          {node && <Tags tags={node.tags} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <Chip icon={<Lock className="size-3.5" />} text={s.settings.ipv6 ? t("IPv6 через VPN") : t("IPv6 закрыт")} />
          <Chip icon={<Globe2 className="size-3.5" />} text={t("DNS в туннеле")} />
          {s.settings.tlsFragment && <Chip icon={<ShieldCheck className="size-3.5" />} text={t("Обход DPI")} />}
        </div>
        <p className="mt-4 text-[14px] text-ink-2 tabular-nums">
          {t("↓ {0} ↑ {1} за сеанс", [formatBytes(s.downTotal), formatBytes(s.upTotal)])}
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
  return <SmoothChart values={values} color="var(--color-amber)" className="mt-4 h-16 w-full" />;
}

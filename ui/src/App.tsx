import { markScreenEnter } from "@/lib/motion";
import { Activity, House, Server, Settings2 } from "lucide-react";
import { useState } from "react";
import { useSnapshot } from "@/backend";
import { Backdrop } from "@/components/Backdrop";
import { Toast } from "@/components/Toast";
import { useIsDesktop } from "@/lib/useMedia";
import { useApplyAppearance } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ActivityScreen } from "@/screens/ActivityScreen";
import { AddSubscriptionSheet } from "@/screens/AddSubscriptionSheet";
import { DesktopLayout } from "@/screens/DesktopLayout";
import { HomeScreen } from "@/screens/HomeScreen";
import { ServersScreen } from "@/screens/ServersScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

type Tab = "home" | "servers" | "activity" | "settings";

const tabs = [
  { id: "home", label: "Главная", icon: House },
  { id: "servers", label: "Серверы", icon: Server },
  { id: "activity", label: "Активность", icon: Activity },
  { id: "settings", label: "Настройки", icon: Settings2 },
] as const;

export default function App() {
  const s = useSnapshot();
  const desktop = useIsDesktop();
  const [tab, setTabState] = useState<Tab>("home");
  // Новый экран: элементы, пришедшие вместе с ним, не анимируются (lib/motion).
  const setTab = (next: Tab) => {
    if (next === tab) return;
    markScreenEnter();
    setTabState(next);
  };
  const [adding, setAdding] = useState(false);
  const mode = useApplyAppearance(s.settings.appearance);

  return (
    <>
      <Backdrop state={s.state} appearance={s.settings.appearance} mode={mode} />
      <Toast />

      {desktop ? (
        <DesktopLayout onAdd={() => setAdding(true)} />
      ) : (
        <>
          {/* Экран меняется сразу: полупрозрачный родитель на время проявления «выключает»
              размытие стекла (backdrop-filter), и карточки мигали. Движение даёт подсветка в меню. */}
          <div key={tab} className="h-dvh overflow-y-auto">
            {tab === "home" && <HomeScreen onOpenServers={() => setTab("servers")} onAdd={() => setAdding(true)} />}
            {tab === "servers" && <ServersScreen onPicked={() => setTab("home")} />}
            {tab === "activity" && <ActivityScreen />}
            {tab === "settings" && <SettingsScreen />}
          </div>

          {/* Плавающее меню-«пилюля». */}
          <nav
            aria-label="Разделы"
            className="glass fixed inset-x-4 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 mx-auto grid isolate max-w-md grid-cols-4 gap-1 rounded-[30px] bg-panel/75 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]"
          >
            {/* Подсветка активного раздела переезжает, а не перескакивает. */}
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 left-1.5 rounded-[24px] bg-amber/14 transition-transform duration-[380ms] ease-[var(--ease-out)]"
              style={{
                width: "calc((100% - 24px) / 4)",
                transform: `translateX(calc(${tabs.findIndex((t) => t.id === tab)} * (100% + 4px)))`,
              }}
            />
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[24px] text-[11.5px] font-medium transition-colors",
                    active ? "text-amber" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn("size-[22px] transition-transform duration-[var(--dur)] ease-[var(--ease-pop)]", active && "-translate-y-px scale-110")}
                    aria-hidden
                  />
                  {label}
                  {id === "home" && s.state === "connected" && !active && (
                    <span className="absolute top-2.5 right-[28%] size-2 rounded-full bg-good ring-2 ring-panel" aria-hidden />
                  )}
                </button>
              );
            })}
          </nav>
        </>
      )}

      <AddSubscriptionSheet open={adding} onOpenChange={setAdding} />
    </>
  );
}

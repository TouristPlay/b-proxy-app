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
  const [tab, setTab] = useState<Tab>("home");
  const [adding, setAdding] = useState(false);
  const mode = useApplyAppearance(s.settings.appearance);

  return (
    <>
      <Backdrop state={s.state} appearance={s.settings.appearance} mode={mode} />
      <Toast />

      {desktop ? (
        <DesktopLayout onAdd={() => setAdding(true)} />
      ) : (
        <div key={tab} className="h-dvh overflow-y-auto">
          {tab === "home" && <HomeScreen onOpenServers={() => setTab("servers")} onAdd={() => setAdding(true)} />}
          {tab === "servers" && <ServersScreen onPicked={() => setTab("home")} />}
          {tab === "activity" && <ActivityScreen />}
          {tab === "settings" && <SettingsScreen />}

          {/* Плавающее меню-«пилюля». */}
          <nav
            aria-label="Разделы"
            className="glass fixed inset-x-4 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[30px] bg-panel/75 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]"
          >
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[24px] text-[11.5px] font-medium transition-colors",
                    active ? "bg-amber/14 text-amber" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <Icon className="size-[22px]" aria-hidden />
                  {label}
                  {id === "home" && s.state === "connected" && !active && (
                    <span className="absolute top-2.5 right-[28%] size-2 rounded-full bg-good ring-2 ring-panel" aria-hidden />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <AddSubscriptionSheet open={adding} onOpenChange={setAdding} />
    </>
  );
}

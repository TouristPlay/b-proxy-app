import { Globe, Power, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useSnapshot } from "@/backend";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { AddSubscriptionSheet } from "@/screens/AddSubscriptionSheet";
import { ConnectScreen } from "@/screens/ConnectScreen";
import { ServersScreen } from "@/screens/ServersScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

type Tab = "connect" | "servers" | "settings";

const tabs: { id: Tab; label: string; icon: typeof Power }[] = [
  { id: "connect", label: "Подключение", icon: Power },
  { id: "servers", label: "Серверы", icon: Globe },
  { id: "settings", label: "Настройки", icon: SlidersHorizontal },
];

export default function App() {
  const s = useSnapshot();
  const [tab, setTab] = useState<Tab>("connect");
  const [adding, setAdding] = useState(false);
  const connected = s.state === "connected";

  return (
    <div className="flex h-dvh flex-col lg:flex-row-reverse">
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === "connect" && (
          <>
            {/* Шапка поверх сцены: знак BaobabVPN и название. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2.5 px-6 pt-[max(20px,env(safe-area-inset-top))] lg:hidden">
              <img src={logo} alt="" className="size-7 rounded-full" />
              <span className="font-display text-[15px] font-medium tracking-tight">B-Proxy</span>
            </div>
            <ConnectScreen onOpenServers={() => setTab("servers")} onAdd={() => setAdding(true)} />
          </>
        )}
        {tab === "servers" && <ServersScreen onAdd={() => setAdding(true)} onPicked={() => setTab("connect")} />}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <nav
        aria-label="Разделы"
        className={cn(
          "flex shrink-0 border-t border-line bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur",
          "lg:w-24 lg:flex-col lg:items-stretch lg:gap-1 lg:border-t-0 lg:border-r lg:pt-6 lg:pb-6",
        )}
      >
        <div className="hidden justify-center pb-6 lg:flex">
          <img src={logo} alt="BaobabVPN" className="size-9 rounded-full" />
        </div>
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors lg:flex-none lg:py-3",
                active ? "text-ink" : "text-ink-faint hover:text-ink-muted",
              )}
            >
              <span className="relative">
                <Icon className="size-[22px]" aria-hidden />
                {id === "connect" && connected && (
                  <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-sun ring-2 ring-night" aria-hidden />
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <AddSubscriptionSheet open={adding} onOpenChange={setAdding} />
    </div>
  );
}

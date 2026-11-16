import { Check, Gauge, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { CountryCode, Ping } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { plural, splitFlag } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ServersScreen({ onAdd, onPicked }: { onAdd: () => void; onPicked: () => void }) {
  const s = useSnapshot();
  const [refreshing, setRefreshing] = useState(false);
  const auto = s.selected == null;
  const canPing = s.state === "disconnected";

  async function refresh() {
    setRefreshing(true);
    try {
      await backend.refreshSubscriptions();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 pt-[max(24px,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Серверы</h1>
        <div className="-mr-3 flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void backend.pingAll()}
            disabled={!canPing || s.pinging}
            aria-label={canPing ? "Проверить пинг" : "Пинг можно проверить, когда VPN выключен"}
            title={canPing ? "Проверить пинг" : "Пинг можно проверить, когда VPN выключен"}
          >
            <Gauge className={cn(s.pinging && "animate-pulse")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={refreshing} aria-label="Обновить подписки" title="Обновить подписки">
            <RefreshCw className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </header>

      <label className="mt-6 flex cursor-pointer items-center gap-4 rounded-row bg-dusk px-4 py-4">
        <span className="flex-1">
          <span className="block font-medium">Выбирать автоматически</span>
          <span className="block text-sm text-ink-muted">Сервер с самым коротким пингом</span>
        </span>
        <Switch
          checked={auto}
          onCheckedChange={(on) => {
            if (on) void backend.select(null);
            else if (s.current) void backend.select({ subUrl: s.current.sub.url, nodeId: s.current.node.id });
          }}
          aria-label="Выбирать сервер автоматически"
        />
      </label>

      {s.subscriptions.map((sub) => (
        <section key={sub.url} className="mt-8">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="font-display text-[15px] font-medium tracking-tight">{sub.title}</h2>
            <span className="text-sm text-ink-faint">
              {sub.nodes.length} {plural(sub.nodes.length, "сервер", "сервера", "серверов")}
            </span>
          </div>
          <ul role="listbox" aria-label={`Серверы ${sub.title}`} className="-mx-2">
            {sub.nodes.map((node) => {
              const active = s.current?.node.id === node.id && s.current.sub.url === sub.url;
              const chosen = !auto && active;
              return (
                <li key={node.id} role="option" aria-selected={active}>
                  <button
                    onClick={() => {
                      void backend.select({ subUrl: sub.url, nodeId: node.id });
                      onPicked();
                    }}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-row px-3 py-3 text-left transition-colors hover:bg-dusk",
                      active && "bg-dusk",
                    )}
                  >
                    <CountryCode name={node.name} className={cn(active && "bg-sun text-ground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{splitFlag(node.name).name}</span>
                      <span className="block truncate text-sm text-ink-muted">{node.transport}</span>
                    </span>
                    <Ping ms={node.pingMs} />
                    <span className="flex w-5 justify-end" aria-hidden>
                      {chosen && <Check className="size-5 text-sun" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Button variant="quiet" className="mt-8 w-full" onClick={onAdd}>
        <Plus />
        Добавить подписку
      </Button>
    </div>
  );
}

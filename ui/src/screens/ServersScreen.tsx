import { Gauge, RefreshCw } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { ServerList } from "@/components/ServerList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ServersScreen({ onPicked }: { onPicked: () => void }) {
  const s = useSnapshot();
  const [refreshing, setRefreshing] = useState(false);
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.filter((v) => !v.divider).length, 0);
  const canPing = s.state === "disconnected";

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32">
      <header className="mb-1 flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-display text-[26px] font-semibold tracking-[-0.02em]">
          Серверы <span className="text-ink-3">{total}</span>
        </h1>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-3 whitespace-nowrap text-amber hover:text-amber-2"
          onClick={() => void backend.pingAll()}
          disabled={!canPing || s.pinging}
          aria-label="Проверить пинг"
          title={canPing ? "Проверить пинг" : "Пинг проверяется при выключенном VPN"}
        >
          <Gauge className={cn(s.pinging && "animate-pulse")} aria-hidden />
          {s.pinging ? "Меряем…" : "Пинг"}
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
      </header>
      <p className="mb-5 text-[14px] text-ink-2">
        {canPing ? "Пинг меряется напрямую, без VPN" : "Чтобы проверить пинг, отключите VPN"}
      </p>
      <ServerList onPicked={onPicked} />
    </div>
  );
}

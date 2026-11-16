import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { ServerList } from "@/components/ServerList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ServersScreen({ onPicked }: { onPicked: () => void }) {
  const s = useSnapshot();
  const [refreshing, setRefreshing] = useState(false);
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.length, 0);
  const canPing = s.state === "disconnected";

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32">
      <header className="mb-1 flex items-center gap-2">
        <h1 className="flex-1 font-display text-[28px] font-semibold tracking-[-0.02em]">
          Серверы <span className="text-ink-3">{total}</span>
        </h1>
        <Button
          variant="ghost"
          size="sm"
          className="text-amber hover:text-amber-2"
          onClick={() => void backend.pingAll()}
          disabled={!canPing || s.pinging}
          title={canPing ? undefined : "Пинг проверяется при выключенном VPN"}
        >
          {s.pinging ? "Проверяем…" : "Проверить пинг"}
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

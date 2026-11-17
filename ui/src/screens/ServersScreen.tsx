import { Plus } from "lucide-react";
import { useSnapshot } from "@/backend";
import { ServerList } from "@/components/ServerList";

/**
 * Серверы всех подписок. Пинг и обновление — у каждого провайдера в его заголовке,
 * здесь только «+» для новой подписки: он крупнее и стоит правее кнопок провайдера.
 */
export function ServersScreen({ onPicked, onAdd }: { onPicked: () => void; onAdd: () => void }) {
  const s = useSnapshot();
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.filter((v) => !v.divider).length, 0);
  const canPing = s.state === "disconnected";

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32">
      <header className="mb-1 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate font-display text-[26px] font-semibold tracking-[-0.02em]">
          Серверы <span className="text-ink-3">{total}</span>
        </h1>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Добавить подписку"
          title="Добавить подписку"
          className="-mr-1 flex size-12 shrink-0 items-center justify-center rounded-full border border-amber/35 bg-amber/14 text-amber transition-colors hover:bg-amber/22"
        >
          <Plus className="size-6" strokeWidth={2.2} />
        </button>
      </header>
      <p className="mb-5 text-[14px] text-ink-2">
        {canPing ? "Пинг меряется у выбранного провайдера, напрямую без VPN" : "Чтобы проверить пинг, отключите VPN"}
      </p>
      <ServerList onPicked={onPicked} />
    </div>
  );
}

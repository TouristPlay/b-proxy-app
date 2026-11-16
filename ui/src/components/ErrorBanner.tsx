import { RotateCcw, Server, TriangleAlert, X } from "lucide-react";
import { backend, useSnapshot } from "@/backend";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ошибка подключения или подписки: что случилось и что можно сделать сразу —
 * попробовать ещё раз или выбрать другой сервер.
 */
export function ErrorBanner({ onOpenServers, className }: { onOpenServers?: () => void; className?: string }) {
  const s = useSnapshot();
  if (!s.error) return null;
  const canRetry = s.current != null && s.state === "disconnected";
  return (
    <div role="alert" className={cn("rounded-[20px] border border-bad/35 bg-bad/10 p-4 text-[15px]", className)}>
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
        <p className="min-w-0 flex-1 leading-snug break-words whitespace-pre-line">{s.error}</p>
        <button
          type="button"
          className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-glass-2 hover:text-ink"
          onClick={() => backend.clearError()}
          aria-label="Скрыть ошибку"
        >
          <X className="size-4" />
        </button>
      </div>
      {canRetry && (
        <div className="mt-3 flex flex-wrap gap-2 pl-8">
          <Button size="sm" variant="glass" onClick={() => void backend.toggle()}>
            <RotateCcw />
            Повторить
          </Button>
          {onOpenServers && (
            <Button size="sm" variant="ghost" onClick={onOpenServers}>
              <Server />
              Другой сервер
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

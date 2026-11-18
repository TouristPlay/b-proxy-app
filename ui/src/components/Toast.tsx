import { CircleCheck, RotateCcw, Undo2, X, Download } from "lucide-react";
import { backend, useSnapshot } from "@/backend";
import { t } from "@/lib/i18n";

/**
 * Короткое уведомление сверху: «Подписка добавлена», «Подписка удалена · Вернуть».
 * Живая область всегда в разметке, чтобы экранный диктор прочитал новое сообщение.
 */
export function Toast() {
  const { toast } = useSnapshot();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-[60] flex justify-center px-4">
      {toast && (
        <div
          role="status"
          className="pointer-events-auto flex w-[min(92vw,440px)] items-center gap-3 rounded-[20px] border border-edge-2 bg-panel py-2 pr-2 pl-4 text-[15px] font-medium shadow-[0_18px_40px_-16px_rgb(0_0_0/0.7)]"
          style={{ animation: "toast-in 260ms var(--ease-soft) both" }}
        >
          <CircleCheck className="size-5 shrink-0 text-good" aria-hidden />
          <span className="min-w-0 flex-1 py-1.5 leading-snug">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => backend.toastAction()}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold text-amber hover:bg-glass-2"
            >
              {toast.action.id === "undo" ? (
                <Undo2 className="size-4" aria-hidden />
              ) : toast.action.id === "app-update" ? (
                <Download className="size-4" aria-hidden />
              ) : (
                <RotateCcw className="size-4" aria-hidden />
              )}
              {toast.action.label}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => backend.dismissToast()}
              aria-label={t("Закрыть уведомление")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-glass-2 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

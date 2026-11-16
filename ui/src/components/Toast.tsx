import { CircleCheck } from "lucide-react";
import { useSnapshot } from "@/backend";

/** Короткое уведомление сверху: «Пинг обновлён», «Подписка добавлена». */
export function Toast() {
  const { toast } = useSnapshot();
  if (!toast) return null;
  return (
    <div
      role="status"
      className="glass fixed top-[max(16px,env(safe-area-inset-top))] left-1/2 z-[60] flex w-[min(92vw,420px)] items-center gap-3 rounded-[20px] border-good/30 bg-panel/85 px-4 py-3.5 text-[15px] font-medium"
      style={{ animation: "toast-in 260ms var(--ease-soft) both" }}
    >
      <CircleCheck className="size-6 shrink-0 text-good" aria-hidden />
      {toast}
    </div>
  );
}

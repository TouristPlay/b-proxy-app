import type { ToastActionId, ToastMessage } from "./types";

/**
 * Короткие уведомления с необязательной кнопкой («Вернуть», «Переподключить»).
 * Без кнопки висит 4 секунды, с «Отменить» — 7 секунд (успеть передумать),
 * с «Переподключить» и «Обновить» — пока не нажмут или не закроют.
 */
export class Toaster {
  private timer: number | undefined;
  private run: (() => void) | null = null;

  constructor(private readonly set: (toast: ToastMessage | null) => void) {}

  show(text: string, action?: { id: ToastActionId; label: string; run: () => void }) {
    window.clearTimeout(this.timer);
    this.run = action?.run ?? null;
    this.set({ text, action: action && { id: action.id, label: action.label } });
    const sticky = action && action.id !== "undo";
    if (!sticky) this.timer = window.setTimeout(() => this.dismiss(), action ? 7000 : 4000);
  }

  act() {
    const run = this.run;
    this.dismiss();
    run?.();
  }

  dismiss() {
    window.clearTimeout(this.timer);
    this.run = null;
    this.set(null);
  }
}

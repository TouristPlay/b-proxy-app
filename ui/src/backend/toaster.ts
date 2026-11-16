import type { ToastActionId, ToastMessage } from "./types";

/**
 * Короткие уведомления с необязательной кнопкой («Вернуть», «Переподключить»).
 * Без кнопки висит 4 секунды, с кнопкой — 6, чтобы успеть нажать.
 */
export class Toaster {
  private timer: number | undefined;
  private run: (() => void) | null = null;

  constructor(private readonly set: (toast: ToastMessage | null) => void) {}

  show(text: string, action?: { id: ToastActionId; label: string; run: () => void }) {
    window.clearTimeout(this.timer);
    this.run = action?.run ?? null;
    this.set({ text, action: action && { id: action.id, label: action.label } });
    this.timer = window.setTimeout(() => this.dismiss(), action ? 6000 : 4000);
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

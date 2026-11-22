/**
 * Виброотклик на телефонах: Taptic Engine на iOS, performHapticFeedback на Android
 * (команда плагина haptic). На компьютере и в демо в браузере — ничего.
 * Системные настройки вибрации телефон учитывает сам; в приложении есть свой выключатель.
 */
import { invoke } from "@tauri-apps/api/core";
import { detectPlatform, isMobile } from "@/backend/xray";

export type HapticKind = "tap" | "select" | "toggle-on" | "toggle-off" | "success" | "warning" | "error" | "heavy";

const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && isMobile(detectPlatform());
let enabled = true;
let last = { kind: "", at: 0 };

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function hapticsAvailable() {
  return native;
}

export function haptic(kind: HapticKind) {
  if (!native || !enabled) return;
  // Один и тот же отклик чаще 60 мс — дребезг (двойное событие), а не новое действие.
  const now = Date.now();
  if (last.kind === kind && now - last.at < 60) return;
  last = { kind, at: now };
  void invoke("plugin:bproxy|haptic", { kind }).catch(() => {});
}

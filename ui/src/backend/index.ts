import { useSyncExternalStore } from "react";
import { DemoBackend } from "./demo";
import type { Backend, Snapshot } from "./types";

/**
 * Выбор бэкенда. Пока интерфейс делается отдельно, везде работает DemoBackend.
 * Когда подключим Tauri, здесь появится TauriBackend: вызовы invoke() к ядру Xray.
 * #empty в адресе показывает экран без подписки.
 */
function createBackend(): Backend {
  const empty = typeof location !== "undefined" && location.hash === "#empty";
  return new DemoBackend(empty);
}

export const backend: Backend = createBackend();

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(
    (cb) => backend.subscribe(cb),
    () => backend.snapshot(),
  );
}

export type * from "./types";

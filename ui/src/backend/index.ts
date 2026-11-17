import { demoFlag } from "@/lib/demoHash";
import { useSyncExternalStore } from "react";
import { DemoBackend } from "./demo";
import { TauriBackend } from "./tauri";
import type { Backend, Snapshot } from "./types";

/**
 * Выбор бэкенда: в приложении — TauriBackend (ядро Xray и VPN),
 * в браузере — DemoBackend с тестовыми данными для показа дизайна.
 * #empty в адресе показывает экран без подписки (только демо).
 */
function createBackend(): Backend {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return new TauriBackend();
  const backend = new DemoBackend(demoFlag("empty"));
  if (demoFlag("light")) backend.updateAppearance({ mode: "light" }, false);
  if (demoFlag("connected")) void backend.toggle();
  return backend;
}

export const backend: Backend = createBackend();

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(
    (cb) => backend.subscribe(cb),
    () => backend.snapshot(),
  );
}

export * from "./types";

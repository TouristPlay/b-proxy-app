import path from "node:path";
import { defineConfig } from "vitest/config";

// Тесты логики бэкенда (разбор подписок, маршруты, конфиг Xray) — без браузера и Tauri.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});

import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// mode "preview" собирает один HTML-файл с тестовыми данными — для показа дизайна.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "preview" ? [viteSingleFile()] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  base: "./",
  // Tauri ждёт фиксированный порт в режиме разработки.
  server: { port: 1420, strictPort: true },
  build: { outDir: mode === "preview" ? "dist-preview" : "dist", target: "es2022" },
}));

import { useEffect, useState } from "react";
import type { Appearance, ThemeId } from "@/backend";

/**
 * Темы оформления. Тема задаёт акцентный цвет (кнопка, кольцо, переключатели)
 * и цвета пятен на фоне: «холодные» без VPN и «тёплые» при подключении.
 * Светлый и тёмный режим меняют основу и текст (index.css), тема — только акцент.
 */
export interface ThemePreset {
  id: ThemeId;
  name: string;
  accent: string;
  /** Пятна фона без подключения: [большое, второе, центральное]. */
  idle: [string, string, string];
  /** Пятна фона при подключении. */
  active: [string, string, string];
  /** Цвет основы в тёмном режиме. */
  base: string;
}

export const themes: ThemePreset[] = [
  {
    id: "amber",
    name: "Янтарь",
    accent: "#f2b04b",
    idle: ["#2b3a4c", "#1c2a3d", "#24313f"],
    active: ["#b8662c", "#5e3424", "#f2b04b"],
    base: "#0a0e13",
  },
  {
    id: "aqua",
    name: "Аква",
    accent: "#4fe0c8",
    idle: ["#283544", "#1a2636", "#22303f"],
    active: ["#0f6e66", "#1e3f8f", "#4fe0c8"],
    base: "#090e14",
  },
  {
    id: "gold",
    name: "Золото",
    accent: "#dcb56a",
    idle: ["#1d2547", "#141a33", "#1e2440"],
    active: ["#6d5222", "#1d2452", "#dcb56a"],
    base: "#0a0d1a",
  },
  {
    id: "emerald",
    name: "Изумруд",
    accent: "#b4e25a",
    idle: ["#22322a", "#18241e", "#1f2c25"],
    active: ["#3c6a1f", "#123526", "#b4e25a"],
    base: "#0a100d",
  },
  {
    id: "mono",
    name: "Графит",
    accent: "#e6e9ed",
    idle: ["#2c3036", "#1d2025", "#262a30"],
    active: ["#4a5058", "#2a2e35", "#c9ced6"],
    base: "#0b0c0e",
  },
];

export const themeById = (id: ThemeId) => themes.find((t) => t.id === id) ?? themes[0];

/** Текущий акцент: свой цвет пользователя или цвет темы. */
export const accentOf = (a: Appearance) => a.accent ?? themeById(a.theme).accent;

/** Яркость цвета 0–255 — чтобы акцент и текст на нём оставались читаемыми. */
function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const isDark = (hex: string) => luminance(hex) < 140;

/**
 * Акцент, который виден на фоне выбранного режима. Слишком светлый цвет
 * на белом фоне (например «Графит») затемняем, слишком тёмный на тёмном — осветляем.
 */
function readableAccent(accent: string, mode: "dark" | "light") {
  const l = luminance(accent);
  if (mode === "light" && l > 150) return `color-mix(in oklab, ${accent} ${l > 210 ? 30 : 55}%, black)`;
  if (mode === "dark" && l < 70) return `color-mix(in oklab, ${accent} 55%, white)`;
  return accent;
}

/** Применяет оформление к <html>: режим, акцент, размытие, анимации. */
export function useApplyAppearance(a: Appearance) {
  const systemDark = useSystemDark();
  const mode = a.mode === "system" ? (systemDark ? "dark" : "light") : a.mode;

  useEffect(() => {
    const root = document.documentElement;
    const theme = themeById(a.theme);
    const raw = accentOf(a);
    const accent = readableAccent(raw, mode);
    // Цвет текста на кнопке считаем по фактическому акценту после поправки.
    const adjusted = accent !== raw;
    const textOnAccent = adjusted ? (mode === "light" ? "#ffffff" : "#1b1408") : isDark(raw) ? "#ffffff" : "#1b1408";
    root.dataset.mode = mode;
    root.dataset.motion = a.motion ? "on" : "off";
    const vars: Record<string, string> = {
      "--color-amber": accent,
      // В светлом режиме «светлый» оттенок акцента темнее: иначе текст и значки сливаются с фоном.
      "--color-amber-2": mode === "dark" ? `color-mix(in oklab, ${accent} 58%, white)` : `color-mix(in oklab, ${accent} 80%, black)`,
      "--color-amber-deep": `color-mix(in oklab, ${accent} ${mode === "dark" ? 68 : 60}%, black)`,
      "--color-on-accent": textOnAccent,
      "--glass-blur": `${a.glassBlur}px`,
    };
    if (mode === "dark") vars["--color-base"] = theme.base;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    if (mode !== "dark") root.style.removeProperty("--color-base");
  }, [a, mode]);

  return mode;
}

function useSystemDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => typeof window === "undefined" || window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark;
}

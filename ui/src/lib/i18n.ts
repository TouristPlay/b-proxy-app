import { en } from "./i18n.en";

/**
 * Язык интерфейса. Ключ перевода — русский текст: в коде остаётся читаемым,
 * а английский берётся из словаря i18n.en.ts. Нет перевода — показываем русский.
 *
 * Язык выбирается один раз при запуске (настройка «Язык» в оформлении или язык системы),
 * смена языка перезагружает интерфейс — так переводятся и строки, посчитанные при загрузке модулей.
 */
export type Lang = "ru" | "en";
export type LangSetting = "system" | Lang;

const APPEARANCE_KEY = "b-proxy.appearance";

function systemLang(): Lang {
  const langs = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  // Русский интерфейс — для русского и близких языков, где его обычно понимают.
  return langs.some((l) => /^(ru|be|uk|kk|ky|uz|tg|hy|az)\b/i.test(l ?? "")) ? "ru" : "en";
}

function detect(): Lang {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") as { language?: LangSetting };
    if (saved.language === "ru" || saved.language === "en") return saved.language;
  } catch {
    // Нет хранилища — язык системы.
  }
  return systemLang();
}

export const LANG: Lang = detect();
/** Локаль для дат и чисел. */
export const LOCALE = LANG === "ru" ? "ru-RU" : "en-US";

/** Перевод: t("Подписка «{0}» обновлена", [title]). */
export function t(key: string, args?: unknown[]): string {
  const text = LANG === "en" ? (en[key] ?? key) : key;
  return args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? "")) : text;
}

/**
 * Параметры демо из адреса — для страницы ревью дизайна (ui/public/review.html):
 *   #empty     — без подписок
 *   #welcome   — знакомство при первом запуске (вместе с #empty — как у нового пользователя)
 *   #servers, #activity, #settings — открыть раздел
 *   #light     — светлая тема
 *   #connected — сразу «Защищено»
 * Несколько через «&»: #activity&light. В приложении (Tauri) не используются.
 */
const flags = new Set(
  typeof location === "undefined" ? [] : location.hash.replace(/^#/, "").split("&").filter(Boolean),
);

export const demoFlag = (name: string) => flags.has(name);

export function demoTab<T extends string>(tabs: readonly T[], fallback: T): T {
  return tabs.find((t) => flags.has(t)) ?? fallback;
}

/**
 * Заставка из index.html: убираем, когда интерфейс отрисовался, но не раньше,
 * чем она успела показаться целиком (иначе солнце не успеет встать).
 */
const MIN_MS = 1450;
const STILL_MS = 250;

declare global {
  interface Window {
    __splashStart?: number;
  }
}

export function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  const still = el.classList.contains("sp-still");
  const shown = performance.now() - (window.__splashStart ?? 0);
  const wait = Math.max(0, (still ? STILL_MS : MIN_MS) - shown);
  window.setTimeout(() => {
    el.classList.add("sp-out");
    window.setTimeout(() => el.remove(), still ? 250 : 600);
  }, wait);
}

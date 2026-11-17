import { useEffect, useState } from "react";
import { markScreenEnter } from "./motion";

/** true, если окно шире 1024 px — показываем раскладку для компьютера. */
export function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    // Смена раскладки при изменении окна — как новый экран: без «прыжков» появления.
    const on = () => {
      markScreenEnter();
      setMatch(m.matches);
    };
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return match;
}

/** Текущее время раз в секунду, пока active. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

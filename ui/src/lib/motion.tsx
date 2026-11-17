import { createElement, useState, type ElementType, type HTMLAttributes, type Ref } from "react";
import { cn } from "./utils";

/**
 * Анимации появления только в ответ на действие, а не при открытии экрана.
 *
 * Раньше при каждом переключении вкладки заново проигрывались все «прыжки» и «подъёмы»
 * (заголовок, щит, статистика, галочки) — интерфейс дёргался. Теперь элементы, которые
 * появились вместе с экраном, показываются сразу, а анимация остаётся для смены состояния:
 * подключились — щит прыгнул, выбрали сервер — галочка появилась.
 */

/** Сколько после открытия экрана считаем элементы «пришедшими вместе с ним». */
const ENTER_WINDOW_MS = 400;
let enteredAt = typeof performance !== "undefined" ? performance.now() : 0;

/** Вызывать при смене экрана (вкладки). */
export function markScreenEnter() {
  enteredAt = performance.now();
}

/** Класс анимации, если элемент появился не вместе с экраном. Решается один раз на элемент. */
export function useEntrance(anim: string): string {
  const [cls] = useState(() => (performance.now() - enteredAt > ENTER_WINDOW_MS ? anim : ""));
  return cls;
}

type EntranceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  anim: string;
  ref?: Ref<HTMLElement>;
};

/** Обёртка: <Entrance as="h1" anim="anim-status" key={title}>…</Entrance>. */
export function Entrance({ as = "div", anim, className, ...props }: EntranceProps) {
  const cls = useEntrance(anim);
  return createElement(as, { ...props, className: cn(cls, className) });
}

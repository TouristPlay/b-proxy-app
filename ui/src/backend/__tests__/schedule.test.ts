import { describe, expect, it } from "vitest";
import { inWindow, nextChange } from "../schedule";

const work = { enabled: true, days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" };
// 2026-11-16 — понедельник.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, 16 + day, h, m).getTime();

describe("расписание", () => {
  it("будни 9–18", () => {
    expect(inWindow(work, at(0, 9))).toBe(true);
    expect(inWindow(work, at(0, 17, 59))).toBe(true);
    expect(inWindow(work, at(0, 18))).toBe(false);
    expect(inWindow(work, at(0, 8, 59))).toBe(false);
    expect(inWindow(work, at(5, 12))).toBe(false); // суббота
    expect(inWindow({ ...work, enabled: false }, at(0, 12))).toBe(false);
  });

  it("окно через полночь принадлежит дню начала", () => {
    const night = { enabled: true, days: [5], from: "22:00", to: "07:00" }; // пятница
    expect(inWindow(night, at(4, 23))).toBe(true); // пятница вечер
    expect(inWindow(night, at(5, 6, 30))).toBe(true); // утро субботы
    expect(inWindow(night, at(5, 23))).toBe(false); // суббота вечер
    expect(inWindow(night, at(4, 6))).toBe(false); // утро пятницы
  });

  it("следующее включение и выключение", () => {
    expect(nextChange(work, at(0, 8, 30))).toEqual({ at: at(0, 9), on: true });
    expect(nextChange(work, at(0, 12))).toEqual({ at: at(0, 18), on: false });
    expect(nextChange(work, at(4, 19))).toEqual({ at: at(7, 9), on: true }); // пятница → понедельник
    expect(nextChange({ ...work, days: [] }, at(0, 12))).toBeNull();
  });
});

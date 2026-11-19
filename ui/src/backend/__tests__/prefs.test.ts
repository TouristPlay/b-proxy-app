import { describe, expect, it } from "vitest";
import { applyPrefs, pickCurrent } from "../prefs";
import { defaultSubPrefs, type Subscription } from "../types";

const sub = (url: string, pings: (number | null)[], prefs: Partial<typeof defaultSubPrefs> = {}): Subscription =>
  applyPrefs({
    url,
    providerTitle: url,
    plan: null,
    nodes: pings.map((p, i) => ({ id: `n${i}`, name: `Сервер ${i}`, tags: [], pingMs: p })),
    usedBytes: 0,
    totalBytes: 0,
    expireAt: null,
    announce: null,
    supportUrl: null,
    webPageUrl: null,
    updatedAt: 0,
    hideUrl: false,
    prefs,
  } as unknown as Subscription);

describe("настройки провайдера и автовыбор", () => {
  it("переименование и скрытие серверов", () => {
    const s = sub("a", [10, 20], { renames: { n0: "Дом" }, hidden: ["n1"], title: "Свой" });
    expect(s.title).toBe("Свой");
    expect(s.nodes[0]).toMatchObject({ name: "Дом", originalName: "Сервер 0" });
    expect(s.nodes[1].hidden).toBe(true);
  });

  it("автовыбор берёт самый быстрый, кроме скрытых и выключенных провайдеров", () => {
    const a = sub("a", [50, 5], { hidden: ["n1"] });
    const b = sub("b", [1], { autoSelect: false });
    const c = sub("c", [30, null]);
    expect(pickCurrent([a, b, c], null)).toMatchObject({ sub: { url: "c" }, node: { id: "n0" } });
  });

  it("выбранный вручную важнее пинга", () => {
    const a = sub("a", [50, 5]);
    expect(pickCurrent([a], { subUrl: "a", nodeId: "n0" })?.node.id).toBe("n0");
  });
});

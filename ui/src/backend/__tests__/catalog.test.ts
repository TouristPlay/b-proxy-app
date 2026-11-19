import { describe, expect, it } from "vitest";
import { parseCatalog } from "../catalog";

describe("Рекомендуемые VPN", () => {
  it("отбрасывает битые, просроченные и не-https карточки, сортирует по весу", () => {
    const raw = JSON.stringify({
      items: [
        { id: "a", name: "A", url: "https://a.example.com", weight: 1 },
        { id: "b", name: "B", url: "https://b.example.com", weight: 5, until: "2099-01-01" },
        { id: "old", name: "Old", url: "https://old.example.com", until: "2000-01-01" },
        { id: "http", name: "Http", url: "http://insecure.example.com" },
        { id: "js", name: "Js", url: "javascript:alert(1)" },
        { url: "https://noname.example.com" },
      ],
    });
    expect(parseCatalog(raw, new Date("2026-11-19")).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("не JSON — пустой список, логотип только https или data:image", () => {
    expect(parseCatalog("<html>")).toEqual([]);
    const [item] = parseCatalog(JSON.stringify([{ name: "A", url: "https://a.example.com", logo: "file:///etc/passwd" }]));
    expect(item.logo).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { isNewer } from "../version";

describe("сравнение версий", () => {
  it("по числам, а не по строке", () => {
    expect(isNewer("0.2.10", "0.2.9")).toBe(true);
    expect(isNewer("v1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.2.2", "0.2.2")).toBe(false);
    expect(isNewer("0.2.1", "0.2.2")).toBe(false);
    expect(isNewer("0.3", "0.2.9")).toBe(true);
  });
});

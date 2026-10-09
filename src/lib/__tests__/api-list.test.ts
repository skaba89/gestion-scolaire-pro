import { describe, expect, it } from "vitest";
import { toList } from "../api-list";

describe("toList", () => {
  it("returns a bare array as is", () => {
    expect(toList<number>([1, 2])).toEqual([1, 2]);
  });
  it("unwraps a paginated { items } response", () => {
    expect(toList<{ id: string }>({ items: [{ id: "a" }], total: 1 })).toEqual([{ id: "a" }]);
  });
  it("returns [] for anything else", () => {
    for (const value of [null, undefined, {}, { items: "x" }, "x", 3]) {
      expect(toList(value)).toEqual([]);
    }
  });
});

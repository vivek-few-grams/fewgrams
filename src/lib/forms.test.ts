import { describe, expect, it } from "vitest";
import { MAX_SORT_ORDER, sortOrder, switchTo } from "./forms";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("sortOrder", () => {
  it("takes a whole number from 0 to 999, and blank as 0", () => {
    expect(sortOrder(form({ sortOrder: "3" }))).toBe(3);
    expect(sortOrder(form({ sortOrder: " 0 " }))).toBe(0);
    expect(sortOrder(form({ sortOrder: String(MAX_SORT_ORDER) }))).toBe(999);
    expect(sortOrder(form({ sortOrder: "" }))).toBe(0);
    expect(sortOrder(form({}))).toBe(0);
  });

  it("refuses what the padded sort key would order wrongly", () => {
    for (const bad of ["-1", "1.5", "1000", "abc", "1e3"]) {
      expect(sortOrder(form({ sortOrder: bad })), bad).toBeNull();
    }
  });

  it("reads another field when told to", () => {
    expect(sortOrder(form({ order: "7" }), "order")).toBe(7);
  });
});

describe("switchTo", () => {
  it("reads the state the button asks for", () => {
    expect(switchTo(form({ to: "on" }))).toBe(true);
    expect(switchTo(form({ to: "off" }))).toBe(false);
  });

  it("is null when the button said nothing it could mean", () => {
    expect(switchTo(form({}))).toBeNull();
    expect(switchTo(form({ to: "true" }))).toBeNull();
  });
});

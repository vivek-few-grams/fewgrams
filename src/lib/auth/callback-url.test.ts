import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "./callback-url";

describe("safeCallbackPath", () => {
  it("keeps a path on this site, query and all", () => {
    expect(safeCallbackPath("/checkout")).toBe("/checkout");
    expect(safeCallbackPath("/kn/account/orders/FO1?x=1#top")).toBe("/kn/account/orders/FO1?x=1#top");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "https:evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
  ])("sends %j home", (value) => {
    expect(safeCallbackPath(value)).toBe("/");
  });

  it("sends anything that is not a string home", () => {
    expect(safeCallbackPath(undefined)).toBe("/");
    expect(safeCallbackPath(["/a", "/b"])).toBe("/");
  });
});

import { describe, expect, it } from "vitest";
import { decodeShortfall, encodeShortfall } from "./shortfall";

describe("shortfall", () => {
  it("survives the trip through a notice or a query string", () => {
    const short = [
      { kind: "seed" as const, key: "radish", short: 120 },
      { kind: "tray" as const, key: "tray-pair", short: 2 },
    ];
    const enc = encodeShortfall(short);
    expect(enc).toBe("seed:radish:120,tray:tray-pair:2");
    expect(decodeShortfall(enc)).toEqual(short);
    expect(decodeShortfall(new URLSearchParams({ short: enc }).get("short"))).toEqual(short);
  });

  it("is empty when nothing came up short", () => {
    expect(encodeShortfall([])).toBe("");
    expect(decodeShortfall("")).toEqual([]);
    expect(decodeShortfall(null)).toEqual([]);
  });

  it("drops anything typed into the address bar that is not a stock item and an amount", () => {
    expect(
      decodeShortfall(
        "seed:radish:120,rack:x:1,seed:Radish:1,seed:radish:-4,seed:radish:abc,seed::3,seed:a:1:2",
      ),
    ).toEqual([{ kind: "seed", key: "radish", short: 120 }]);
  });
});

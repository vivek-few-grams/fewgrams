import { beforeEach, describe, expect, it, vi } from "vitest";

/* A shelf in memory, keyed `kind:key`, behind the three repositories'
   take-and-return calls. `failOn` makes the next call for that row throw. */
const shelf = new Map<string, number>();
let failOn: string | null = null;

function rows(kind: string) {
  const touch = (key: string) => {
    if (failOn === `${kind}:${key}`) throw new Error(`DynamoDB fell over on ${kind}:${key}`);
  };
  return {
    add: async (key: string, n: number) => {
      touch(key);
      shelf.set(`${kind}:${key}`, (shelf.get(`${kind}:${key}`) ?? 0) + n);
    },
    take: async (key: string, n: number) => {
      touch(key);
      const held = shelf.get(`${kind}:${key}`) ?? 0;
      const taken = Math.min(held, n);
      shelf.set(`${kind}:${key}`, held - taken);
      return taken;
    },
  };
}

vi.mock("@/lib/repo/trays", () => ({ returnToStock: rows("tray").add, takeFromStock: rows("tray").take }));
vi.mock("@/lib/repo/grow-media", () => ({
  returnToStock: rows("media").add,
  takeFromStock: rows("media").take,
}));
vi.mock("@/lib/repo/seeds", () => ({ returnToShelf: rows("seed").add, takeFromShelf: rows("seed").take }));

const { applyStockChange, undoStockChange } = await import("./stock");

beforeEach(() => {
  shelf.clear();
  failOn = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("applyStockChange", () => {
  it("moves each row, and says what moved and what the shelf was short of", async () => {
    shelf.set("seed:radish", 300);
    const r = await applyStockChange(
      new Map([
        ["tray:tray-pair", 4],
        ["seed:radish", -500],
      ]),
    );
    expect(Object.fromEntries(shelf)).toEqual({ "tray:tray-pair": 4, "seed:radish": 0 });
    expect(Object.fromEntries(r.moved)).toEqual({ "tray:tray-pair": 4, "seed:radish": -300 });
    expect(r.short).toEqual([{ kind: "seed", key: "radish", short: 200 }]);
  });

  it("is all or nothing: a row that throws puts back the rows already moved", async () => {
    /* A bill save whose stock half-moved and then recorded the new lines
       left a re-save computing a change of nothing. */
    shelf.set("seed:radish", 300);
    failOn = "media:horti-coir";
    await expect(
      applyStockChange(
        new Map([
          ["tray:tray-pair", 4],
          ["seed:radish", -100],
          ["media:horti-coir", 2],
        ]),
      ),
    ).rejects.toThrow("DynamoDB fell over");
    expect(Object.fromEntries(shelf)).toEqual({ "tray:tray-pair": 0, "seed:radish": 300 });
  });
});

describe("undoStockChange", () => {
  it("reverses what moved, as far as the shelf allows", async () => {
    shelf.set("seed:radish", 300);
    const { moved } = await applyStockChange(
      new Map([
        ["seed:radish", -100],
        ["tray:tray-pair", 4],
      ]),
    );
    /* One pack sold before the undo: three come back off, and it is logged. */
    shelf.set("tray:tray-pair", 3);
    await undoStockChange(moved);
    expect(Object.fromEntries(shelf)).toEqual({ "seed:radish": 300, "tray:tray-pair": 0 });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("carries on past a row it cannot put back, and logs it", async () => {
    failOn = "tray:tray-pair";
    await undoStockChange(
      new Map([
        ["seed:radish", -100],
        ["tray:tray-pair", 4],
      ]),
    );
    expect(shelf.get("seed:radish")).toBe(100);
    expect(console.error).toHaveBeenCalledOnce();
  });
});

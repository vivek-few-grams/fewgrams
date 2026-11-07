import { describe, expect, it } from "vitest";
import type { Sowing } from "@/lib/types";
import { gramsPerTray, isIsoDate, readSowing, seedChange, yieldByVariety, yieldRatio } from "./sowing";

const keys = new Set(["radish", "sunflower"]);
const today = "2026-10-10";

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

describe("readSowing", () => {
  it("reads a new sowing with no harvest columns", () => {
    const r = readSowing(
      form({
        sowDate: "2026-10-09",
        varietyKey: ["radish", "sunflower"],
        seedGrams: ["40", "120"],
        trays: ["2", ""],
      }),
      { varietyKeys: keys, today },
    );
    expect(r).toEqual({
      ok: true,
      sowDate: "2026-10-09",
      lines: [
        { varietyKey: "radish", seedGrams: 40, trays: 2 },
        { varietyKey: "sunflower", seedGrams: 120 },
      ],
    });
  });

  it("drops a row left wholly blank", () => {
    const r = readSowing(
      form({ sowDate: today, varietyKey: ["radish", ""], seedGrams: ["40", ""], trays: ["", ""] }),
      {
        varietyKeys: keys,
        today,
      },
    );
    expect(r.ok && r.lines).toHaveLength(1);
  });

  it("refuses an empty sowing, a future date and an unknown variety", () => {
    expect(
      readSowing(form({ sowDate: today, varietyKey: [""], seedGrams: [""] }), { varietyKeys: keys, today }),
    ).toMatchObject({
      ok: false,
      state: { code: "noLines" },
    });
    expect(readSowing(form({ sowDate: "2026-10-11" }), { varietyKeys: keys, today })).toMatchObject({
      state: { code: "dateFuture", field: "sowDate" },
    });
    expect(
      readSowing(form({ sowDate: today, varietyKey: ["kale"], seedGrams: ["10"] }), {
        varietyKeys: keys,
        today,
      }),
    ).toMatchObject({ state: { code: "varietyRequired", field: "varietyKey.0", values: { row: "1" } } });
  });

  it("refuses zero seed and a fractional tray count", () => {
    const base = { sowDate: today, varietyKey: ["radish"] };
    expect(readSowing(form({ ...base, seedGrams: ["0"] }), { varietyKeys: keys, today })).toMatchObject({
      state: { code: "seedInvalid", field: "seedGrams.0" },
    });
    expect(
      readSowing(form({ ...base, seedGrams: ["10"], trays: ["1.5"] }), { varietyKeys: keys, today }),
    ).toMatchObject({
      state: { code: "traysInvalid" },
    });
  });

  it("dates a harvest today when its date is blank, and keeps a zero harvest", () => {
    const r = readSowing(
      form({
        sowDate: "2026-10-01",
        varietyKey: ["radish", "sunflower"],
        seedGrams: ["40", "100"],
        trays: ["2", "1"],
        harvestGrams: ["600", "0"],
        harvestedOn: ["", "2026-10-08"],
      }),
      { varietyKeys: keys, today },
    );
    expect(r.ok && r.lines).toEqual([
      { varietyKey: "radish", seedGrams: 40, trays: 2, harvestGrams: 600, harvestedOn: today },
      { varietyKey: "sunflower", seedGrams: 100, trays: 1, harvestGrams: 0, harvestedOn: "2026-10-08" },
    ]);
  });

  it("refuses a harvest before the sowing, and a date without grams", () => {
    const base = { sowDate: "2026-10-05", varietyKey: ["radish"], seedGrams: ["40"] };
    expect(
      readSowing(form({ ...base, harvestGrams: ["10"], harvestedOn: ["2026-10-04"] }), {
        varietyKeys: keys,
        today,
      }),
    ).toMatchObject({ state: { code: "harvestBeforeSow", field: "harvestedOn.0" } });
    expect(
      readSowing(form({ ...base, harvestGrams: [""], harvestedOn: ["2026-10-08"] }), {
        varietyKeys: keys,
        today,
      }),
    ).toMatchObject({ state: { code: "harvestDateWithoutGrams" } });
  });
});

describe("isIsoDate", () => {
  it("refuses a date the calendar does not have", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/10/2026")).toBe(false);
  });
});

describe("yield", () => {
  const sowings: Sowing[] = [
    {
      id: "a",
      sowDate: "2026-10-01",
      createdAt: "",
      updatedAt: "",
      lines: [
        { varietyKey: "radish", seedGrams: 40, trays: 2, harvestGrams: 600, harvestedOn: "2026-10-08" },
        { varietyKey: "sunflower", seedGrams: 100 },
      ],
    },
    {
      id: "b",
      sowDate: "2026-10-03",
      createdAt: "",
      updatedAt: "",
      lines: [{ varietyKey: "radish", seedGrams: 60, harvestGrams: 600, harvestedOn: "2026-10-09" }],
    },
  ];

  it("gives a ratio and grams per tray only once cut", () => {
    expect(yieldRatio(sowings[0].lines[0])).toBe(15);
    expect(gramsPerTray(sowings[0].lines[0])).toBe(300);
    expect(yieldRatio(sowings[0].lines[1])).toBeNull();
    expect(gramsPerTray(sowings[1].lines[0])).toBeNull();
  });

  it("totals by variety, counting only harvested seed in the ratio", () => {
    expect(yieldByVariety(sowings)).toEqual([
      {
        varietyKey: "radish",
        sown: 2,
        harvested: 2,
        seedGrams: 100,
        harvestedSeedGrams: 100,
        harvestGrams: 1200,
        ratio: 12,
        meanDays: 6.5,
        /* Only the first radish line counted trays. */
        perTray: 300,
      },
      {
        varietyKey: "sunflower",
        sown: 1,
        harvested: 0,
        seedGrams: 100,
        harvestedSeedGrams: 0,
        harvestGrams: 0,
        ratio: null,
        meanDays: null,
        perTray: null,
      },
    ]);
  });
});

describe("seedChange", () => {
  const radish = { varietyKey: "radish", seedGrams: 40 };
  const mustard = { varietyKey: "mustard", seedGrams: 30 };

  it("takes a new sowing's seed off the shelf", () => {
    expect(seedChange({}, [], [radish, mustard])).toEqual(
      new Map([
        ["radish", 40],
        ["mustard", 30],
      ]),
    );
  });

  it("adds two lines of one variety together", () => {
    expect(seedChange({}, [], [radish, radish])).toEqual(new Map([["radish", 80]]));
  });

  it("moves only the difference on an edit, and nothing for a harvest", () => {
    const cut = { ...radish, harvestGrams: 350, harvestedOn: "2026-10-25" };
    expect(
      seedChange({ radish: 40, mustard: 30 }, [radish, mustard], [cut, { ...mustard, seedGrams: 25 }]),
    ).toEqual(new Map([["mustard", -5]]));
  });

  it("puts a deleted sowing's seed back", () => {
    expect(seedChange({ radish: 40 }, [radish], [])).toEqual(new Map([["radish", -40]]));
  });

  it("puts back all of a seed no longer sown, and takes the one sown instead", () => {
    expect(seedChange({ radish: 40 }, [radish], [{ ...radish, varietyKey: "dill" }])).toEqual(
      new Map([
        ["radish", -40],
        ["dill", 40],
      ]),
    );
  });

  it("never asks again for a shortfall", () => {
    /* 50 g sown with 30 g on the shelf took 30. The owner counts the shelf
       and corrects it; a later edit — a harvest, a tray count — must not
       take the missing 20 again, and adding 10 g takes 10. */
    const sown = { ...radish, seedGrams: 50 };
    const cut = { ...sown, harvestGrams: 400, harvestedOn: "2026-10-28" };
    expect(seedChange({ radish: 30 }, [sown], [cut])).toEqual(new Map());
    expect(seedChange({ radish: 30 }, [sown], [{ ...sown, seedGrams: 60 }])).toEqual(
      new Map([["radish", 10]]),
    );
  });

  it("takes nothing later for a seed that had no row when it was sown", () => {
    /* Sown before its seed row existed, so it took nothing; the row added
       since must not have the whole sowing taken from it on the next edit. */
    const cut = { ...radish, harvestGrams: 300, harvestedOn: "2026-10-28" };
    expect(seedChange({}, [radish], [cut])).toEqual(new Map());
    expect(seedChange({}, [radish], [{ ...radish, seedGrams: 45 }])).toEqual(new Map([["radish", 5]]));
    expect(seedChange({}, [radish], [])).toEqual(new Map());
  });

  it("never puts back more than a short shelf gave", () => {
    /* 250 g sown with 200 g on the shelf: deleting returns the 200, and
       cutting the line to 25 g returns the 225 no longer sown — up to the
       200 that came off. */
    const sown = { ...mustard, seedGrams: 250 };
    expect(seedChange({ mustard: 200 }, [sown], [])).toEqual(new Map([["mustard", -200]]));
    expect(seedChange({ mustard: 200 }, [sown], [{ ...mustard, seedGrams: 25 }])).toEqual(
      new Map([["mustard", -200]]),
    );
    expect(seedChange({ mustard: 200 }, [sown], [{ ...mustard, seedGrams: 150 }])).toEqual(
      new Map([["mustard", -100]]),
    );
  });
});

import { describe, expect, it } from "vitest";
import type { PlanWeek, Variety } from "@/lib/types";
import { demandFor } from "./demand";
import type { Subscription } from "./subscription";

const variety = (contentKey: string, growDays: number, min: number, max: number, seed?: number): Variety => ({
  id: contentKey,
  contentKey,
  pricePerTray: 100,
  yieldGramsPerTrayMin: min,
  yieldGramsPerTrayMax: max,
  growDays,
  ...(seed ? { seedGramsPerTray: seed } : {}),
  active: true,
});
const varieties = new Map([
  ["broccoli", variety("broccoli", 10, 250, 350, 20)],
  ["mustard", variety("mustard", 7, 300, 400)],
  ["radish", variety("radish", 7, 300, 400)],
]);
const rotations = new Map<string, PlanWeek[]>([
  ["ess", [
    { planId: "ess", week: 1, varietyKeys: ["mustard", "radish"] },
    { planId: "ess", week: 2, varietyKeys: ["broccoli"] },
  ]],
  ["exo", [{ planId: "exo", week: 1, varietyKeys: ["broccoli"] }]],
]);

const sub = (id: string, lines: Array<[string, number, number]>, status: Subscription["status"] = "active"): Subscription =>
  ({
    id,
    status,
    lines: lines.map(([planId, boxes, gramsPerBox]) => ({
      planId,
      planKey: planId,
      name: planId,
      boxes,
      monthlyPrice: 1000,
      lineTotal: boxes * 1000,
      gramsPerBox,
    })),
    deliveries: [{ date: "2026-10-10", week: 1 }, { date: "2026-10-17", week: 2 }],
  }) as Subscription;

describe("demandFor — the tray plan (SPEC §6)", () => {
  it("adds every box on the day, splitting a box evenly across its week's varieties", () => {
    const d = demandFor(
      "2026-10-10",
      [sub("a", [["ess", 2, 200]]), sub("b", [["ess", 1, 200], ["exo", 3, 300]])],
      rotations,
      varieties,
    );
    const grams = Object.fromEntries(d.lines.map((l) => [l.varietyKey, l.grams]));
    /* Essentials week 1: 3 boxes × 100 g each of mustard and radish.
       Exotic week 1: 3 boxes × 300 g of broccoli. */
    expect(grams).toEqual({ mustard: 300, radish: 300, broccoli: 900 });
    expect(d.subscribers).toBe(2);
    expect(d.plans.map((p) => [p.planId, p.boxes])).toEqual([["ess", 3], ["exo", 3]]);
  });

  it("counts trays at the low yield, with the high yield as the best case, and seed from the trays", () => {
    const d = demandFor("2026-10-10", [sub("b", [["exo", 3, 300]])], rotations, varieties);
    const broccoli = d.lines.find((l) => l.varietyKey === "broccoli")!;
    expect(broccoli.trays).toBe(4); // 900 / 250 = 3.6
    expect(broccoli.traysAtBest).toBe(3); // 900 / 350 = 2.57
    expect(broccoli.seedGrams).toBe(80);
    expect(broccoli.sowBy).toBe("2026-09-30");
  });

  it("puts what must be sown first at the top", () => {
    const d = demandFor("2026-10-10", [sub("b", [["ess", 1, 200], ["exo", 1, 300]])], rotations, varieties);
    expect(d.lines[0].varietyKey).toBe("broccoli");
  });

  it("ignores unpaid checkouts and Saturdays outside a subscription's term", () => {
    expect(demandFor("2026-10-10", [sub("p", [["ess", 5, 200]], "pending_payment")], rotations, varieties).lines).toEqual([]);
    expect(demandFor("2026-10-24", [sub("a", [["ess", 1, 200]])], rotations, varieties).subscribers).toBe(0);
  });

  it("flags a plan whose rotation week is empty rather than silently sowing nothing", () => {
    const d = demandFor("2026-10-17", [sub("b", [["exo", 2, 300]])], rotations, varieties);
    expect(d.lines).toEqual([]);
    expect(d.emptyWeeks.map((p) => p.planId)).toEqual(["exo"]);
  });
});

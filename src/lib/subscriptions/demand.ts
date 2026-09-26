import { fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import type { PlanWeek, Variety } from "@/lib/types";
import type { Subscription } from "./subscription";

/**
 * The tray plan — SPEC §6. For one delivery Saturday: how many grams of each
 * variety every paid subscription adds up to, and how many trays that is.
 *
 * Pure, so the arithmetic the owner sows from is tested rather than read off
 * a screen.
 *
 * ## Where the grams come from
 *
 * A box's weight is split **evenly** across the varieties in that Saturday's
 * rotation week: a 200 g box in a week of Mustard and Red Amaranthus is 100 g
 * of each. The weight is the one on the subscription (`gramsPerBox`, as paid
 * for); the varieties are the plan's **current** rotation, because flat
 * pricing exists so the owner can swap a green in a week without anyone's
 * price moving (SPEC §5.1) — and a swap has to show up in what gets sown.
 *
 * ## Trays
 *
 * `ceil(grams ÷ yieldGramsPerTrayMin)` — the owner's **low** yield, so a
 * light tray still fills every box. The high-yield figure is returned too,
 * for the best case.
 */

export type DemandLine = {
  varietyKey: string;
  grams: number;
  /** Boxes this variety goes into on the day. */
  boxes: number;
  /** At the low yield — what to sow. Null when the variety has no yield set. */
  trays: number | null;
  /** At the high yield — the fewest it could take. */
  traysAtBest: number | null;
  /** Seed for `trays`, where the variety has a seed rate. */
  seedGrams: number | null;
  /** `YYYY-MM-DD` IST: the Saturday less the grow days. Null for a variety
   *  that is no longer in the catalogue. */
  sowBy: string | null;
  growDays: number | null;
};

export type PlanBoxes = { planId: string; planKey: string; boxes: number; week: number };

export type DeliveryDemand = {
  date: string;
  /** Boxes going out, per plan, with the rotation week each is on. */
  plans: PlanBoxes[];
  /** Subscriptions with a box that day. */
  subscribers: number;
  lines: DemandLine[];
  /** Plans with boxes that day whose rotation week has no varieties —
   *  there is nothing to sow for them, which the owner needs to see. */
  emptyWeeks: PlanBoxes[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function demandFor(
  date: string,
  subs: readonly Subscription[],
  rotations: ReadonlyMap<string, readonly PlanWeek[]>,
  varieties: ReadonlyMap<string, Variety>,
): DeliveryDemand {
  const plans = new Map<string, PlanBoxes>();
  const grams = new Map<string, { grams: number; boxes: number }>();
  let subscribers = 0;

  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const delivery = sub.deliveries.find((d) => d.date === date);
    if (!delivery) continue;
    subscribers += 1;

    for (const line of sub.lines) {
      const p = plans.get(line.planId) ?? { planId: line.planId, planKey: line.planKey, boxes: 0, week: delivery.week };
      p.boxes += line.boxes;
      plans.set(line.planId, p);

      const keys = rotations.get(line.planId)?.find((w) => w.week === delivery.week)?.varietyKeys ?? [];
      if (keys.length === 0) continue;
      const each = line.gramsPerBox / keys.length;
      for (const key of keys) {
        const g = grams.get(key) ?? { grams: 0, boxes: 0 };
        g.grams += each * line.boxes;
        g.boxes += line.boxes;
        grams.set(key, g);
      }
    }
  }

  const saturday = fromIstDateISO(date).getTime();
  const lines = [...grams.entries()].map(([key, g]): DemandLine => {
    const v = varieties.get(key);
    const total = Math.round(g.grams);
    const trays = v && v.yieldGramsPerTrayMin > 0 ? Math.ceil(total / v.yieldGramsPerTrayMin) : null;
    const traysAtBest = v && v.yieldGramsPerTrayMax > 0 ? Math.ceil(total / v.yieldGramsPerTrayMax) : null;
    return {
      varietyKey: key,
      grams: total,
      boxes: g.boxes,
      trays,
      traysAtBest,
      seedGrams: trays !== null && v?.seedGramsPerTray ? Math.ceil(trays * v.seedGramsPerTray) : null,
      sowBy: v ? istDateISO(new Date(saturday - v.growDays * DAY_MS)) : null,
      growDays: v?.growDays ?? null,
    };
  });
  /* Sow order: whatever has to go into the soil first comes first. */
  lines.sort((a, b) => (a.sowBy ?? "").localeCompare(b.sowBy ?? "") || b.grams - a.grams);

  const all = [...plans.values()];
  return {
    date,
    plans: all,
    subscribers,
    lines,
    emptyWeeks: all.filter(
      (p) => (rotations.get(p.planId)?.find((w) => w.week === p.week)?.varietyKeys.length ?? 0) === 0,
    ),
  };
}

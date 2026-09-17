import { revalidatePath } from "next/cache";
import {
  listAngleRackModels,
  listPipeRackModels,
  listRackModels,
  loadRateCard,
  priceable,
  putAngleRackModel,
  putPipeRackModel,
  putRackModel,
} from "@/lib/repo/racks";
import {
  angleRackCost,
  pipeRackCost,
  rackCost,
  repricedRows,
  type RateCard,
} from "./pricing";
import type {
  AngleRackConfig,
  PipeRackConfig,
  RackConfig,
} from "@/lib/types";

/**
 * The rate cascade — SPEC §19.3.1.
 *
 * **Editing a rate reprices every rack that uses it, immediately, with no
 * approval step.** The owner's instruction, 17 Sep 2026: *"we need to add
 * logic to update prices of all variants as soon as primary raw material cost
 * is updated, No need of approval."*
 *
 * What this replaced: a rate edit used to move a rack's *cost* only, flag the
 * row with the old and new figure, and leave the selling price frozen until
 * someone pressed Republish on it. The intent was that a rate edit could never
 * move a price a customer was looking at. The cost was that every rate change
 * left a queue of rows to accept one at a time — a hundred of them across the
 * three ranges — which is the hand recalculation this feature exists to
 * remove. The owner has weighed both and chosen the cascade.
 *
 * ## What still protects a live order
 *
 * The frozen price was only ever half of that protection, and it was the
 * weaker half. The real guarantee is that **an order line snapshots its name
 * and price at purchase** (SPEC §4.3), so nothing here can reach an order that
 * already exists. What a cascade *can* now do is move a price between a
 * customer adding a rack to their basket and paying for it. Checkout
 * re-reading the model at payment time is what closes that, and it belongs
 * with the cart work rather than here — noted in SPEC §19.3.1 rather than
 * left implicit.
 *
 * ## Why it is one function over three ranges
 *
 * All three are priced from an overlapping rate card: the markup, the
 * rounding, the heights and the corner leg count are shared by every range,
 * and the angle rate prices both steel ranges' legs. So a single edit on
 * `/admin/racks` can move prices on all three screens, and a cascade that
 * covered only the screen it was triggered from would leave the other two
 * quietly wrong. Every rate-writing action calls this, not a per-range
 * variant.
 *
 * Writes are skipped for rows that have not moved and for rows that cannot be
 * priced — see `repricedRows` for both, and for why the comparison looks at
 * the price and not only the cost.
 */

/** What a cascade did, per range. Returned rather than logged so an action
 *  can report it and a test can assert it. */
export type RepriceSummary = {
  plated: number;
  angle: number;
  pipe: number;
  /** Rows whose parts have gone, so they kept their last good price. Counted
   *  because it is the one outcome an operator might need to chase. */
  unpriceable: number;
  /** Rows written, across all three ranges. */
  total: number;
};

export const NO_REPRICE: RepriceSummary = {
  plated: 0,
  angle: 0,
  pipe: 0,
  unpriceable: 0,
  total: 0,
};

/**
 * Reprices every published rack from the current rate card.
 *
 * Call it **after** the rate has been written, never before: it reads the card
 * back from DynamoDB rather than taking the new figures as an argument, so
 * there is no way for the cascade to price against a rate that failed to save.
 *
 * A no-op when the shared settings are absent — there is no markup to apply,
 * and a fresh install has nothing published anyway.
 */
export async function repriceAllRacks(): Promise<RepriceSummary> {
  const stored = await loadRateCard();
  const card = priceable(stored);
  if (!card) return NO_REPRICE;

  const [plated, angle, pipe] = await Promise.all([
    listRackModels(),
    listAngleRackModels(),
    listPipeRackModels(),
  ]);

  /* The config type is annotated on each callback rather than inferred: with
     a bare `(c) => ...` TypeScript resolves `C` from the callback's parameter
     and lands on `unknown`, which compiles the wrong cost function in without
     complaint. */
  const platedRows = repricedRows(
    plated,
    (c: RackConfig) => rackCost(c, card),
    card.settings,
  );
  const angleRows = repricedRows(
    angle,
    (c: AngleRackConfig) => angleRackCost(c, card),
    card.settings,
  );
  const pipeRows = repricedRows(
    pipe,
    (c: PipeRackConfig) => pipeRackCost(c, card),
    card.settings,
  );

  /* One timestamp for the whole cascade, so every row it touched carries the
     same `publishedAt` and the sweep is legible as one event in the data
     rather than a hundred near-simultaneous ones. */
  const publishedAt = new Date().toISOString();
  const stamp = <M extends object>(row: { model: M; price: number; costAtPublish: number }) => ({
    ...row.model,
    price: row.price,
    costAtPublish: row.costAtPublish,
    publishedAt,
  });

  await Promise.all([
    ...platedRows.map((r) => putRackModel(stamp(r))),
    ...angleRows.map((r) => putAngleRackModel(stamp(r))),
    ...pipeRows.map((r) => putPipeRackModel(stamp(r))),
  ]);

  return {
    plated: platedRows.length,
    angle: angleRows.length,
    pipe: pipeRows.length,
    unpriceable: countUnpriceable(plated, angle, pipe, card),
    total: platedRows.length + angleRows.length + pipeRows.length,
  };
}

function countUnpriceable(
  plated: { config: RackConfig }[],
  angle: { config: AngleRackConfig }[],
  pipe: { config: PipeRackConfig }[],
  card: RateCard,
): number {
  return (
    plated.filter((m) => rackCost(m.config, card) === null).length +
    angle.filter((m) => angleRackCost(m.config, card) === null).length +
    pipe.filter((m) => pipeRackCost(m.config, card) === null).length
  );
}

/**
 * Revalidates **all three** rack screens.
 *
 * A rate edit on any one of them can move prices on the other two — the
 * markup, rounding, heights and corner leg count are shared — so refreshing
 * only the screen the form was submitted from would leave the other two
 * showing prices that are no longer what the database holds. Every action that
 * calls `repriceAllRacks` calls this too.
 */
export function revalidateRackScreens(): void {
  for (const route of ["racks", "angle-racks", "pipe-racks"]) {
    revalidatePath(`/[locale]/admin/${route}`, "page");
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { isOnABill } from "@/lib/repo/purchases";
import { forgetSupply } from "@/lib/repo/vendors";
import { deleteSeed, getSeed, listSeeds, patchSeed, putSeedMargin, setSeedStock } from "@/lib/repo/seeds";
import { retailPrice } from "@/lib/pricing/margin";
import { count, err, zeroOrMore, type FormState } from "@/lib/forms";

/**
 * Seed mutations — SPEC §22.3.
 *
 * SPEC §8: every one of these asserts the admin role itself. A server action
 * is addressable over HTTP independently of the page that renders its form.
 *
 * **Nothing here accepts text**, and since 18 Oct 2026 nothing here takes a
 * cost or adds a seed either (the owner: "for each and every purchase … I'll
 * be entering the product … and how much I've paid"). A seed is added from a
 * purchase bill ("+ New product", `addStockItem`), the bill sets its cost
 * (`costFromBills`), and this screen keeps the margin, the switch, the
 * delete and a stocktake.
 *
 * ## Stock moves by itself; a count corrects it
 *
 * A bill adds grams, a paid order and a sowing take them, a cancellation
 * puts them back — all as deltas, each conditional or atomic. What is left
 * to the keyboard is the stocktake: spilt seed, a damp sack, a recount.
 * `correctSeedStock` writes that count outright, as the whole row used to.
 */

/** Public pages that change when the seed catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/seeds", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/seeds", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** A stocktake — the grams counted on the shelf. Zero is a real answer (sold
 *  out); an empty field is not. */
export async function correctSeedStock(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const seed = await getSeed(String(fd.get("id") ?? ""));
  if (!seed) return err("notFound");
  const grams = zeroOrMore(fd, "count");
  /* Not whole grams only: a sowing can take 12.5 g, so the shelf can hold it. */
  if (grams === null) return err("countInvalid", "count");
  await setSeedStock(seed.id, grams);
  refresh();
  return { status: "saved" };
}

/** Hide a seed without losing its price or its stock figure — the only way a
 *  seed leaves the site. **Not switched on before a bill has costed it**: a
 *  seed added from a bill is priced at 0 until that bill is saved. */
export async function toggleSeedActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getSeed(String(fd.get("id")));
  if (!existing) throw new Error("Seed not found");
  if (!existing.active && existing.costPer100g === undefined) return;
  await patchSeed(existing.id, { active: !existing.active });
  refresh();
}

/**
 * The seeds margin. Saving reprices **every seed with a cost**, straight away.
 * A seed not yet costed by a bill keeps its price until one is saved.
 */
export async function saveSeedMargin(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const markupPercent = zeroOrMore(fd, "markupPercent");
  if (markupPercent === null) return err("zeroOrMore", "markupPercent");
  const roundUpToNearest = count(fd, "roundUpToNearest");
  if (roundUpToNearest === null) return err("countInvalid", "roundUpToNearest");

  const margin = { markupPercent, roundUpToNearest };
  await putSeedMargin(margin);
  const rows = await listSeeds();
  await Promise.all(
    rows
      .filter((r) => r.costPer100g !== undefined && retailPrice(r.costPer100g, margin) !== r.pricePer100g)
      .map((r) => patchSeed(r.id, { pricePer100g: retailPrice(r.costPer100g!, margin) })),
  );
  refresh();
  return { status: "saved" };
}

export async function removeSeed(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const row = await getSeed(id);
  /* Its screen offers no Delete while a bill names it; this is for a
     request made without the screen. */
  if (row && (await isOnABill(`seed:${row.contentKey}`))) throw new Error("This seed is on a purchase bill");
  await deleteSeed(id);
  if (row) await forgetSupply(`seed:${row.contentKey}`);
  refresh();
}

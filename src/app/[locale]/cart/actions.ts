"use server";

import { revalidatePath } from "next/cache";
import { listVarieties } from "@/lib/repo/varieties";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { getVarietyContent } from "@/lib/content/varieties";
import { getSeedContent } from "@/lib/content/seeds";
import { seedMaxUnits } from "@/lib/seeds/stock";
import { getTrayContent } from "@/lib/content/trays";
import { getGrowMediumContent } from "@/lib/content/grow-media";
import { findSellableRack } from "@/lib/racks/catalogue";
import {
  MAX_UNITS_PER_LINE,
  asCartKind,
  isValidKeyFor,
  removeFromCart,
  unitsFor,
  upsertLine,
  type CartKind,
} from "@/lib/cart/cart";
import { readCartLines, writeCartLines } from "@/lib/cart/server";
import { err, type FormState } from "@/lib/forms";

/**
 * Cart mutations — SPEC §18.6, extended to seeds and then to trays on
 * 17 Sep 2026.
 *
 * **No role assertion here, on purpose.** Unlike the admin and account actions
 * (SPEC §8), a cart is explicitly available to a guest: §8 allows browsing and
 * buying without an account, and §3 only requires one for subscriptions. So
 * these are public actions — which is exactly why each one re-validates its
 * input instead of trusting the form.
 *
 * What *is* enforced, and it is the same short list for every kind:
 *
 * | | Must be |
 * |---|---|
 * | variety | active, and have a content file |
 * | seed | active, have a content file, and **no more than the shelf holds** |
 * | tray | active, and have a content file |
 * | media | active, and have a content file |
 * | rack | resolve to a published, active model in a colour its grade offers |
 *
 * **A seed's stock is back to being a limit** (the owner, 25 Sep 2026). From
 * 17 Sep any quantity could be ordered and the shelf only set the date; now
 * an add or an increase past what is held is refused here as well as in the
 * stepper, so a stale tab or a hand-made POST cannot order seed that is not
 * there. Decreasing is always allowed.
 *
 * A tray never had a stock test to drop: nothing in that category is held at
 * all (SPEC §23.1), so the only thing its quantity changes is how many packs
 * the supplier order is for. A rack is the same again — built to order from a
 * rate card (§19), so there is nothing to be out of.
 *
 * **A rack is the one kind with no content file**, so its test is a different
 * shape rather than a different threshold: `findSellableRack` is the whole of
 * it, and it folds five separate failures — malformed key, never published,
 * since deactivated, parts retired, colour not offered — into one null.
 *
 * The per-line twenty-unit cap below survives. That one is a wholesale
 * threshold rather than an inventory one, and it applies identically whatever
 * a unit happens to be.
 */

/** Pages whose rendering depends on the cart cookie. The header badge is in
 *  the root layout, so the layout is revalidated rather than a single page. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

/**
 * Can this much of this item be ordered right now?
 *
 * The quantity matters for one kind: a seed cannot be ordered past what is on
 * the shelf, and with under 50 g held it is sold out (the owner, 25 Sep
 * 2026). Returns the reason it cannot be ordered, as a message key, so the
 * caller can report it without this function choosing any wording
 * (CLAUDE.md).
 */
async function sellable(
  kind: CartKind,
  key: string,
  units: number,
): Promise<{ ok: true } | { ok: false; code: string; values?: Record<string, string> }> {
  /* Kind-aware, because a rack's key is a SKU and a content key bans the digits
     a SKU is made of — see `isValidKeyFor`. This used to be a bare
     `isValidContentKey`, which would have rejected every rack before the
     lookup ran. */
  if (!isValidKeyFor(kind, key)) return { ok: false, code: "notSellable" };

  if (kind === "rack") {
    /* One call is the entire test. Nothing else to check: the price is on the
       model, and a rack has no stock and no content file. */
    return (await findSellableRack(key))
      ? { ok: true }
      : { ok: false, code: "notSellable" };
  }

  if (kind === "variety") {
    const rows = await listVarieties({ activeOnly: true });
    if (!rows.some((v) => v.contentKey === key)) return { ok: false, code: "notSellable" };
    // Locale is irrelevant to existence — English is required in every file.
    if (!(await getVarietyContent(key, "en"))) return { ok: false, code: "notSellable" };
    return { ok: true };
  }

  if (kind === "tray") {
    const rows = await listTrays({ activeOnly: true });
    if (!rows.some((tr) => tr.contentKey === key)) return { ok: false, code: "notSellable" };
    if (!(await getTrayContent(key, "en"))) return { ok: false, code: "notSellable" };
    /* Nothing else to check. `leadDays` is read only by `hydrateCart`, and
       only to pick a delivery date — a slow supplier is not a reason to refuse
       an order, it is the reason the date is what it is. */
    return { ok: true };
  }

  if (kind === "media") {
    /* The tray test exactly — a grow medium is sold the same way (SPEC §24.1). */
    const rows = await listGrowMedia({ activeOnly: true });
    if (!rows.some((m) => m.contentKey === key)) return { ok: false, code: "notSellable" };
    if (!(await getGrowMediumContent(key, "en"))) return { ok: false, code: "notSellable" };
    return { ok: true };
  }

  const seed = (await listSeeds({ activeOnly: true })).find((s) => s.contentKey === key);
  if (!seed) return { ok: false, code: "notSellable" };
  if (!(await getSeedContent(key, "en"))) return { ok: false, code: "notSellable" };
  /* The shelf is the limit. Never says how much is held. */
  const max = seedMaxUnits(seed.stockGrams);
  if (max === 0) return { ok: false, code: "soldOut" };
  if (units > max) return { ok: false, code: "overStock" };
  return { ok: true };
}

function readKind(fd: FormData): CartKind | null {
  return asCartKind(String(fd.get("kind") ?? "").trim());
}

function readKey(fd: FormData): string {
  return String(fd.get("key") ?? "").trim().toLowerCase();
}

function readUnits(fd: FormData): number {
  const n = Number(String(fd.get("units") ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/**
 * Set this item's quantity in the cart, from its detail page.
 *
 * **Sets, does not add** (changed 15 Sep 2026). The page's stepper is seeded
 * from the cart, so it already reads 3 when the cart holds 3; adding 3 again
 * would quietly make it 6. Being absolute also makes it idempotent, so a
 * double-click or a retried request cannot double the line.
 *
 * Returns `FormState` so the button can confirm in place. Sending the customer
 * to `/cart` on every add would interrupt someone browsing three greens, and
 * §18.6 makes this the low-commitment entry point — it should stay
 * low-friction.
 *
 * One action for every kind rather than one each: every rule is shared between
 * them, and three copies would be three places to fix the next one.
 */
export async function setCartQuantity(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const kind = readKind(fd);
  if (!kind) return err("notSellable");
  const key = readKey(fd);
  const units = readUnits(fd);

  /* The lower bound is one unit, which is the minimum order for every kind:
     one tray of greens, 50 g of seed (SPEC §22.2), one pack of trays
     (§23.1). A seed's upper bound is its shelf, checked in `sellable`. */
  if (!Number.isFinite(units) || units < 1 || units > MAX_UNITS_PER_LINE) {
    return err("unitsInvalid", "units");
  }

  const check = await sellable(kind, key, units);
  if (!check.ok) return err(check.code, undefined, check.values);

  const before = await readCartLines();
  const after = upsertLine(before, kind, key, units);

  /* A full cart silently returning the same lines would look like a working
     add that did nothing, so the one case `upsertLine` cannot express is
     reported here. Only a *new* line can be refused — an existing one is
     always updatable. */
  if (unitsFor(after, kind, key) !== units) return err("cartFull");

  await writeCartLines(after);
  refresh();
  return { status: "saved" };
}

/**
 * Set a line's exact quantity from the cart page. Zero removes it.
 *
 * Returns nothing — the cart page's steppers are plain form submits with no
 * error surface, so an increase of something no longer on sale has to be
 * *refused silently* here and prevented in the UI (the button is disabled at
 * the cap). The alternative, clamping to the maximum, would change the
 * customer's line to a number they did not choose.
 */
export async function updateCartLine(fd: FormData): Promise<void> {
  const kind = readKind(fd);
  if (!kind) return;
  const key = readKey(fd);
  const units = readUnits(fd);
  if (!isValidKeyFor(kind, key) || !Number.isFinite(units)) return;

  /* Decreasing and removing are always allowed — only an increase has to
     clear the sellable check, so a customer holding a line that has since been
     withdrawn can always reduce or remove it. */
  const lines = await readCartLines();
  if (units > unitsFor(lines, kind, key)) {
    const check = await sellable(kind, key, units);
    if (!check.ok) return;
  }

  await writeCartLines(upsertLine(lines, kind, key, units));
  refresh();
}

export async function removeCartLine(fd: FormData): Promise<void> {
  const kind = readKind(fd);
  if (!kind) return;
  const key = readKey(fd);
  if (!isValidKeyFor(kind, key)) return;
  await writeCartLines(removeFromCart(await readCartLines(), kind, key));
  refresh();
}

/** Drop every line, including any that no longer resolve — this is also how a
 *  stale cookie entry reported as unavailable gets cleaned up. */
export async function clearCart(): Promise<void> {
  await writeCartLines([]);
  refresh();
}

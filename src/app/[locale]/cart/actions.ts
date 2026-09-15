"use server";

import { revalidatePath } from "next/cache";
import { listVarieties } from "@/lib/repo/varieties";
import { getVarietyContent, isValidContentKey } from "@/lib/content/varieties";
import {
  removeFromCart,
  unitsFor,
  upsertLine,
  MAX_UNITS_PER_LINE,
} from "@/lib/cart/cart";
import { readCartLines, writeCartLines } from "@/lib/cart/server";
import type { FormState } from "@/lib/forms";

/**
 * Cart mutations — SPEC §18.6.
 *
 * **No role assertion here, on purpose.** Unlike the admin and account actions
 * (SPEC §8), a cart is explicitly available to a guest: §8 allows browsing and
 * buying without an account, and §3 only requires one for subscriptions. So
 * these are public actions — which is exactly why each one re-validates its
 * input instead of trusting the form.
 *
 * What *is* enforced: the key must name a variety that is active **and** has a
 * content file. Otherwise a stale or hand-made request could seed a cart with
 * something withdrawn from sale, and the cart page would then report it
 * unavailable the moment it was added.
 */

/** Pages whose rendering depends on the cart cookie. The header badge is in
 *  the root layout, so the layout is revalidated rather than a single page. */
function refresh() {
  revalidatePath("/[locale]", "layout");
}

async function isSellable(key: string): Promise<boolean> {
  if (!isValidContentKey(key)) return false;
  const rows = await listVarieties({ activeOnly: true });
  if (!rows.some((v) => v.contentKey === key)) return false;
  // Locale is irrelevant to existence — English is required in every file.
  return (await getVarietyContent(key, "en")) !== null;
}

function readKey(fd: FormData): string {
  return String(fd.get("key") ?? "").trim().toLowerCase();
}

function readUnits(fd: FormData): number {
  const n = Number(String(fd.get("units") ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/**
 * Set this variety's quantity in the cart, from the variety detail page.
 *
 * **Sets, does not add** (changed 15 Sep 2026). The page's stepper is seeded
 * from the cart, so it already reads 3 when the cart holds 3; adding 3 again
 * would quietly make it 6. Being absolute also makes it idempotent, so a
 * double-click or a retried request cannot double the line.
 *
 * Returns `FormState` so the button can confirm in place. Sending the customer
 * to `/cart` on every add would interrupt someone browsing three greens, and
 * §18.6 makes this the low-commitment entry point — it should stay low-friction.
 */
export async function setVarietyQuantity(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const key = readKey(fd);
  const units = readUnits(fd);

  if (!Number.isFinite(units) || units < 1 || units > MAX_UNITS_PER_LINE) {
    return { status: "error", code: "unitsInvalid", field: "units" };
  }
  if (!(await isSellable(key))) {
    return { status: "error", code: "notSellable" };
  }

  const before = await readCartLines();
  const after = upsertLine(before, key, units);

  /* A full cart silently returning the same lines would look like a working
     add that did nothing, so the one case `upsertLine` cannot express is
     reported here. Only a *new* line can be refused — an existing one is
     always updatable. */
  if (unitsFor(after, key) !== units) {
    return { status: "error", code: "cartFull" };
  }

  await writeCartLines(after);
  refresh();
  return { status: "saved" };
}

/** Set a line's exact quantity from the cart page. Zero removes it. */
export async function updateCartLine(fd: FormData): Promise<void> {
  const key = readKey(fd);
  const units = readUnits(fd);
  if (!isValidContentKey(key) || !Number.isFinite(units)) return;

  await writeCartLines(upsertLine(await readCartLines(), key, units));
  refresh();
}

export async function removeCartLine(fd: FormData): Promise<void> {
  const key = readKey(fd);
  if (!isValidContentKey(key)) return;
  await writeCartLines(removeFromCart(await readCartLines(), key));
  refresh();
}

/** Drop every line, including any that no longer resolve — this is also how a
 *  stale cookie entry reported as unavailable gets cleaned up. */
export async function clearCart(): Promise<void> {
  await writeCartLines([]);
  refresh();
}

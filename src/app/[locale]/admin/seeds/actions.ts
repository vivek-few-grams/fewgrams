"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deleteSeed, getSeed, listSeeds, putSeed } from "@/lib/repo/seeds";
import { isValidContentKey } from "@/lib/content/content-key";
import { err, money, zeroOrMore, type FormState } from "@/lib/forms";
import type { Seed } from "@/lib/types";

/**
 * Seed mutations — SPEC §22.3.
 *
 * SPEC §8: every one of these asserts the admin role itself. A server action
 * is addressable over HTTP independently of the page that renders its form.
 *
 * **Nothing here accepts text.** A seed's name and copy come from
 * `content/seeds/<contentKey>.json` (SPEC §4.3), so the only identifier these
 * actions take is a content key. Same rule as varieties, and for the same
 * reason: copy wants git history and a diff, a price does not.
 *
 * ## Stock is set, never adjusted
 *
 * `stockGrams` is written as an absolute figure — what the owner counted —
 * rather than as "+500 g received". The owner's words were *"the number of
 * grams of seed that I hold today for selling"*, and that is a count, not a
 * ledger. A running total would need every receipt and every order to be
 * recorded correctly for the figure to mean anything; a count is right the
 * moment it is typed and wrong only until it is re-counted.
 *
 * The consequence to know about: **decrementing stock against a paid order is
 * not built**, because nothing takes payment yet (SPEC §9). When checkout
 * lands it must decrement with a conditional write, not a `put` — see
 * `putSeed`. Until then the figure is a promise rather than a reservation:
 * since §22.2 was rewritten it is not a cap at all, so two customers can both
 * be told "next day" for the same 200 g. The stakes are lower than they were
 * under the old cap — the failure is late, not impossible.
 */

/** Public pages that change when the seed catalogue does. */
function refresh() {
  revalidatePath("/[locale]/admin/seeds", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/seeds", "page");
  /* The /shop index prints a live count per category. */
  revalidatePath("/[locale]/shop", "page");
}

/** Price and stock — the only two things this screen sets, plus active. */
type Ops = Pick<Seed, "pricePer100g" | "stockGrams" | "active">;

function readOps(fd: FormData): { ok: true; value: Ops } | { ok: false; state: FormState } {
  const pricePer100g = money(fd, "pricePer100g");
  if (pricePer100g === null)
    return { ok: false, state: err("priceInvalid", "pricePer100g") };

  /* `zeroOrMore`, not `money`: **zero is a legitimate stock figure** — an
     empty shelf, where every order goes on the vendor run (SPEC §22.2). It is
     not "sold out"; there is no such state for a seed any more. It also
     rejects an empty field rather than reading it as a deliberate 0, which is
     the bug that put every rack on sort order 0. */
  const stockGrams = zeroOrMore(fd, "stockGrams");
  if (stockGrams === null) return { ok: false, state: err("stockInvalid", "stockGrams") };

  return {
    ok: true,
    value: { pricePer100g, stockGrams, active: fd.get("active") === "on" },
  };
}

/**
 * Create a seed from a content key.
 *
 * **The content file is deliberately not a precondition**, exactly as for a
 * variety: requiring it first would mean you could not price a sack of seed
 * without opening a code editor. What stops a nameless seed reaching a
 * customer is downstream — the admin row is flagged in red with the exact
 * path, and every public page skips a seed it cannot name.
 *
 * The id is a generated UUID and is never derived from the key, so re-keying
 * content later cannot collide with an existing row or orphan an order line.
 */
export async function addSeed(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const contentKey = String(fd.get("contentKey") ?? "")
    .trim()
    .toLowerCase();
  if (!contentKey) return err("keyRequired", "contentKey");

  /* Validated rather than sanitised: the key is both a filename and a URL
     segment, so quietly rewriting it would break the link between this row and
     the file the operator is about to create. */
  if (!isValidContentKey(contentKey))
    return err("keyInvalid", "contentKey", { key: contentKey });

  /* One row per key — the key is the GSI1 sort key and the public URL, so two
     rows sharing one would make /seeds/<key> ambiguous. Seed keys are checked
     against *seeds* only: `radish` as a seed and `radish` as a microgreen are
     two different products in two different folders (SPEC §22.4). */
  const existing = await listSeeds();
  if (existing.some((s) => s.contentKey === contentKey))
    return err("keyTaken", "contentKey", { key: contentKey });

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putSeed({ id: crypto.randomUUID(), contentKey, ...ops.value });
  refresh();
  return { status: "saved" };
}

/** Update the price and the stock count on an existing seed. The key and id
 *  never change here — re-keying means renaming the content file and is a
 *  rename, not an edit. */
export async function updateSeed(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const id = String(fd.get("id") ?? "").trim();
  const current = id ? await getSeed(id) : null;
  if (!current) return err("notFound");

  const ops = readOps(fd);
  if (!ops.ok) return ops.state;

  await putSeed({ ...current, ...ops.value });
  refresh();
  return { status: "saved" };
}

/** Hide a seed without losing its price or its stock figure.
 *
 *  Since §22.2 was rewritten this is the **only** way a seed leaves the site.
 *  There is no sold-out state to fall into: an empty shelf changes the
 *  delivery date, not the availability, so a seed at 0 g is still listed and
 *  still sells. */
export async function toggleSeedActive(fd: FormData): Promise<void> {
  await assertRole("admin");
  const existing = await getSeed(String(fd.get("id")));
  if (!existing) throw new Error("Seed not found");
  await putSeed({ ...existing, active: !existing.active });
  refresh();
}

export async function removeSeed(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteSeed(String(fd.get("id")));
  refresh();
}

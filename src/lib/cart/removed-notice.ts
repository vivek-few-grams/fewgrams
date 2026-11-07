import { getFormatter, getTranslations } from "next-intl/server";
import type { RemovedNotice } from "@/components/cart/CartCleanup";
import type { HydratedCart, UnavailableLine } from "./server";

/**
 * What `CartCleanup` says about the lines that went off sale, or null when
 * none did: "No longer on sale: Alfalfa microgreens and Beetroot seeds."
 *
 * Named by product **and kind**, never by key. It printed the bare content
 * keys until 7 Nov 2026 — "alfalfa, beetroot" — beside an alfalfa *seed* line
 * that was still on sale, so it read as that line being refused. A line with
 * no name left (a deleted file, a rack, a pack) says what kind of thing it was.
 */
export async function removedNotice(cart: Pick<HydratedCart, "unavailable">): Promise<RemovedNotice | null> {
  if (cart.unavailable.length === 0) return null;
  const [t, format] = await Promise.all([getTranslations("cart"), getFormatter()]);
  const label = (u: UnavailableLine): string => {
    if (u.name === null) return t(`removedUnnamed.${u.kind}`);
    if (u.kind === "variety") return t("removedVariety", { name: u.name });
    if (u.kind === "seed") return t("removedSeed", { name: u.name });
    return u.name;
  };
  return {
    heading: t("removedHeading"),
    body: t("removedBody", { items: format.list(cart.unavailable.map(label), { type: "conjunction" }) }),
  };
}

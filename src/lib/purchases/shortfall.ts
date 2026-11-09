import { isValidContentKey } from "@/lib/content/content-key";
import { STOCK_KINDS, type StockKind } from "./bill";
import type { StockShortfall } from "./stock";

/**
 * What a bill could not take back off the shelf, carried to the screen that
 * says so — SPEC §26.6. Correcting a bill down or deleting it takes its stock
 * back, and a seed the shelf no longer holds in full stops at zero
 * (`applyStockChange`); the operator has to know, to count it.
 *
 * It travels as one string because both routes there carry only strings: a
 * saved form's `notice.values`, and the `?short=` the register opens with
 * after a delete. `kind:key:amount`, comma-separated — a content key has no
 * digits, colons or commas (`isValidContentKey`), so nothing in it can be
 * misread. Read back defensively: the query string can be typed by anyone,
 * and an entry that does not parse is dropped, never shown.
 */

export function encodeShortfall(short: readonly StockShortfall[]): string {
  return short
    .filter((s) => s.short > 0)
    .map((s) => `${s.kind}:${s.key}:${s.short}`)
    .join(",");
}

export function decodeShortfall(raw: string | null | undefined): StockShortfall[] {
  if (!raw) return [];
  return raw.split(",").flatMap((part) => {
    const [kind, key, amount, ...rest] = part.split(":");
    const short = Number(amount);
    if (rest.length > 0 || !(STOCK_KINDS as readonly string[]).includes(kind ?? "")) return [];
    if (!key || !isValidContentKey(key) || !Number.isFinite(short) || short <= 0) return [];
    return [{ kind: kind as StockKind, key, short }];
  });
}

/**
 * Who we buy each product from — SPEC §26.6 (the owner, 18 Oct 2026: "for
 * each product I would need a picker").
 *
 * The link is picked on the product screens — a vendor picker on every seed,
 * tray and grow-medium row, one on the shelf-rack and angle-rack screens, and
 * two on the pipe-rack screen, because a pipe rack's pipes and its connectors
 * come from different people. A product may have several vendors.
 *
 * It is stored on the vendor, as a list of the keys below, so a purchase bill
 * can offer just what the chosen vendor supplies. Most keys name a catalogue
 * row the way a cart line does — kind + content key; a rack range is one key,
 * pipe racks two. Nothing prices or counts stock from this.
 */

/** The rack supplies, which are ranges and parts rather than catalogue rows. */
export const RACK_SUPPLIES = ["rack:shelf", "rack:angle", "rack:pipe-pipes", "rack:pipe-connectors"] as const;
export type RackSupply = (typeof RACK_SUPPLIES)[number];

/** A seed, tray or grow-medium row, by the content key that names it. */
const ROW_SUPPLY = /^(seed|tray|media):[a-z]+(-[a-z]+)*$/;

export function isSupplyKey(key: string): boolean {
  return (RACK_SUPPLIES as readonly string[]).includes(key) || ROW_SUPPLY.test(key);
}

/**
 * The vendors whose lists change when `key` is to be bought from exactly the
 * vendors in `ids` — added where newly ticked, removed where unticked — so a
 * save writes only those.
 */
export function supplierChanges<V extends { id: string; supplies: string[] }>(
  vendors: V[],
  key: string,
  ids: readonly string[],
): V[] {
  return vendors.flatMap((v) => {
    const has = v.supplies.includes(key);
    const want = ids.includes(v.id);
    if (has === want) return [];
    return [{ ...v, supplies: want ? [...v.supplies, key] : v.supplies.filter((k) => k !== key) }];
  });
}

/** The vendor ids that supply `key`. */
export function suppliersOf(
  vendors: ReadonlyArray<{ id: string; supplies: string[] }>,
  key: string,
): string[] {
  return vendors.filter((v) => v.supplies.includes(key)).map((v) => v.id);
}

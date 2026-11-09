import { IS_GOODS, isCreditNote, type PurchaseBill, type PurchaseLine, type StockKind } from "./bill";

/**
 * What a stocked product costs us — SPEC §26.6 (the owner, 18 Oct 2026: the
 * cost is what the purchase bill says, not a figure typed on the product
 * screen). The sell price is still `retailPrice(cost, margin)`; only where
 * the cost comes from changed.
 *
 * - **The latest bill sets it**, by bill date and then by when the bill was
 *   entered. Not an average: a cost that reads straight off one bill is one
 *   the owner can check.
 * - **Shipping is part of it.** A bill's `freight` lines are shared across
 *   every goods line on it (`IS_GOODS`) by value before GST, and only the
 *   stock lines' shares join a cost: ₹100 of shipping on ₹1,000 of seed adds
 *   10% to each seed's cost, and on ₹1,000 of trays to sell beside ₹9,000 of
 *   trays to grow in, ₹10 to the trays for sale — not all ₹100 (8 Nov 2026).
 *   By value before GST, so a 0% seed and an 18% tray carry shipping alike.
 * - **GST included**, as billed — the rule the catalogue screens kept while
 *   costs were typed (17 Oct 2026).
 *
 * Racks are not here: one is built to order, so it is priced from the
 * vendor's rate card before it is ever bought.
 */

/** The bill a cost was read from, kept on the product row so its screen can
 *  say where the figure came from and link to it. */
export type CostSource = { billId: string; number: string; date: string; vendor: string };

/** A product's cost in rupees per cost unit, and the bill it came from. */
export type ItemCost = { cost: number; source: CostSource };

/** Quantity in one cost unit: seed is bought in grams and costed per 100 g,
 *  the unit it sells in; trays per pack and cocopeat per block, as counted. */
export const COST_UNIT: Record<StockKind, number> = { seed: 100, tray: 1, media: 1 };

const gross = (l: Pick<PurchaseLine, "taxable" | "igst" | "cgst" | "sgst">) =>
  l.taxable + l.igst + l.cgst + l.sgst;

/**
 * Each stock item's cost on one bill, in **paise per cost unit**, keyed
 * `kind:key` — its lines' value with tax, plus its share of the bill's
 * shipping, over the quantity bought. The shipping (with its own GST, as
 * billed) is shared across every goods line by its value before GST; the
 * shares of goods that are not stock — trays to grow in, packaging — are
 * real costs of those, but no product's. Two lines for one item are added
 * together. A stock line without a quantity is skipped (the form refuses one).
 */
export function billCosts(
  lines: ReadonlyArray<
    Pick<PurchaseLine, "category" | "item" | "quantity" | "taxable" | "igst" | "cgst" | "sgst">
  >,
): Map<string, number> {
  const stock = lines.filter((l) => l.category === "stock" && l.item && l.quantity);
  const goods = lines.filter((l) => IS_GOODS[l.category]).reduce((s, l) => s + l.taxable, 0);
  const freight = lines.filter((l) => l.category === "freight").reduce((s, l) => s + gross(l), 0);

  const by = new Map<string, { paise: number; quantity: number; kind: StockKind }>();
  for (const l of stock) {
    const id = `${l.item!.kind}:${l.item!.key}`;
    const share = goods > 0 ? (freight * l.taxable) / goods : 0;
    const e = by.get(id) ?? { paise: 0, quantity: 0, kind: l.item!.kind };
    e.paise += gross(l) + share;
    e.quantity += l.quantity!;
    by.set(id, e);
  }
  return new Map(
    [...by].map(([id, e]) => [id, Math.round((e.paise * COST_UNIT[e.kind]) / e.quantity)] as const),
  );
}

/**
 * Every stocked item's cost, from the latest bill it is on. **A vendor's
 * credit note never sets a cost**: goods sent back, or a price cut on a past
 * bill, say nothing about what the item costs to buy now — and costed like a
 * bill, a note returning two packs would price the tray from those two alone.
 * So credit notes are skipped here, and the cost stays with the latest bill.
 */
export function latestCosts(
  bills: ReadonlyArray<
    Pick<PurchaseBill, "id" | "number" | "date" | "vendor" | "lines" | "createdAt" | "doc">
  >,
): Map<string, ItemCost> {
  const oldestFirst = bills
    .filter((b) => !isCreditNote(b))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const out = new Map<string, ItemCost>();
  for (const b of oldestFirst) {
    for (const [id, paise] of billCosts(b.lines)) {
      out.set(id, {
        cost: paise / 100,
        source: { billId: b.id, number: b.number, date: b.date, vendor: b.vendor.name },
      });
    }
  }
  return out;
}

/** The stock items a bill's lines name, `kind:key`. */
export function billItems(lines: ReadonlyArray<Pick<PurchaseLine, "category" | "item">>): string[] {
  return lines.flatMap((l) => (l.category === "stock" && l.item ? [`${l.item.kind}:${l.item.key}`] : []));
}

/** How many bills name each stock item, `kind:key` — a product on a bill is
 *  not deleted (the owner, 18 Oct 2026), or that bill could no longer be
 *  opened and saved. */
export function billsPerItem(
  bills: ReadonlyArray<{ lines: ReadonlyArray<Pick<PurchaseLine, "category" | "item">> }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bills) for (const k of new Set(billItems(b.lines))) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

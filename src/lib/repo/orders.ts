import type { OrderSummary } from "@/lib/types";

/**
 * Order history for one customer — SPEC §12, `/account/orders`.
 *
 * **This returns an empty list on purpose, and it is not a placeholder for a
 * missing query.** Nothing writes an `ORDER#` row yet: checkout is SPEC §14
 * phase 5, so there is no order in any table to read. The by-customer index
 * it will need — `GSI3PK = USER#<userId>`, `GSI3SK = <createdAt>` — is also
 * not on `fewgrams-orders`, and adding a GSI to a populated table triggers a
 * backfill, so it goes in alongside the entity that uses it rather than
 * ahead of it.
 *
 * What this file buys today is the seam: the page renders a real list of a
 * real type from a real repository call, so wiring orders up later changes
 * this function and nothing that calls it.
 */
export async function listOrdersForUser(userId: string): Promise<OrderSummary[]> {
  void userId;
  return [];
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "./order";

/* An in-memory order row and counter whose conditional writes behave as the
   real ones: a credit note number is drawn only by the press holding the
   lease, so two presses leave no gap in the series (8 Nov 2026). */
const db = vi.hoisted(() => ({
  row: null as null | { creditNote?: { number: string; issuedAt: string }; creditNoteClaimedAt?: string },
  counter: 0,
}));

vi.mock("@/lib/repo/orders", () => ({
  advanceOrderStatus: async () => true,
  nextSequence: async () => ++db.counter,
  claimCreditNote: async (_id: string, at: string, staleBefore: string) => {
    const r = db.row!;
    if (r.creditNote) return false;
    if (r.creditNoteClaimedAt && !(r.creditNoteClaimedAt < staleBefore)) return false;
    r.creditNoteClaimedAt = at;
    return true;
  },
  setCreditNote: async (_id: string, note: { number: string; issuedAt: string }, claimedAt: string) => {
    const r = db.row!;
    if (r.creditNote || r.creditNoteClaimedAt !== claimedAt) return false;
    r.creditNote = note;
    return true;
  },
}));

const { issueCreditNote, CREDIT_NOTE_LEASE_MS } = await import("./refund");

const refunded = {
  id: "FG1",
  status: "refunded",
  tax: [],
  invoiceNo: "FG/2627/00009",
  creditNote: null,
} as unknown as Order;

beforeEach(() => {
  db.row = {};
  db.counter = 0;
});

describe("issueCreditNote", () => {
  it("draws one number for two presses at once", async () => {
    const now = new Date("2026-11-08T12:00:00Z");
    await Promise.all([issueCreditNote(refunded, now), issueCreditNote(refunded, now)]);
    expect(db.counter).toBe(1);
    expect(db.row!.creditNote!.number).toMatch(/\/00001$/);
  });

  it("lets a later press finish one whose draw died, once the lease is stale", async () => {
    const now = new Date("2026-11-08T12:00:00Z");
    db.row!.creditNoteClaimedAt = new Date(now.getTime() - 30_000).toISOString();
    await issueCreditNote(refunded, now);
    expect(db.counter).toBe(0);

    await issueCreditNote(refunded, new Date(now.getTime() + CREDIT_NOTE_LEASE_MS));
    expect(db.counter).toBe(1);
    expect(db.row!.creditNote).toBeDefined();
  });

  it("issues nothing for an order without an invoice or with a note already", async () => {
    await issueCreditNote({ ...refunded, invoiceNo: null });
    await issueCreditNote({ ...refunded, creditNote: { number: "x", issuedAt: "y" } });
    expect(db.counter).toBe(0);
  });
});

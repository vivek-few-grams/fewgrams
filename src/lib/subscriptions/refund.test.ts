import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GstFiling } from "@/lib/gst/quarter";
import type { OrderAddress } from "@/lib/orders/order";
import { subscriptionTax } from "@/lib/tax/order-tax";
import { HOME_STATE } from "@/lib/tax/states";
import type { Subscription, SubscriptionRefund } from "./subscription";

/* An in-memory subscription table and counter, so the refund can be run end
   to end without DynamoDB: the conditional writes behave as the real ones. */
const db = vi.hoisted(() => ({
  subs: new Map<string, Subscription>(),
  counters: new Map<string, number>(),
  /** Throw on the next draw, as a run dying between record and draw would. */
  failDraw: false,
}));

vi.mock("@/lib/repo/orders", () => ({
  nextSequence: async (name: string) => {
    if (db.failDraw) {
      db.failDraw = false;
      throw new Error("Lambda timed out");
    }
    const n = (db.counters.get(name) ?? 0) + 1;
    db.counters.set(name, n);
    return n;
  },
}));
vi.mock("@/lib/repo/subscriptions", () => ({
  claimSubscriptionRefund: async (sub: Subscription, refund: SubscriptionRefund) => {
    const row = db.subs.get(sub.id)!;
    if (row.status !== "cancelled" || !row.invoiceNo || row.refund || row.creditNote) return false;
    Object.assign(row, { refund: structuredClone(refund), creditNoteClaimedAt: refund.recordedAt });
    return true;
  },
  retakeSubscriptionCreditNote: async (sub: Subscription, now: string) => {
    const row = db.subs.get(sub.id)!;
    if (!sub.creditNoteClaimedAt || row.creditNoteClaimedAt !== sub.creditNoteClaimedAt || row.creditNote)
      return false;
    row.creditNoteClaimedAt = now;
    return true;
  },
  setSubscriptionCreditNote: async (
    id: string,
    creditNote: { number: string; issuedAt: string },
    at: string,
  ) => {
    const row = db.subs.get(id)!;
    if (row.creditNote || row.creditNoteClaimedAt !== at) return false;
    row.creditNote = { ...creditNote };
    return true;
  },
}));

const {
  CREDIT_NOTE_LEASE_MS,
  canRecordRefund,
  finishSubscriptionCreditNote,
  owesSubscriptionCreditNote,
  recordSubscriptionRefund,
  undeliveredValue,
} = await import("./refund");

const NOW = new Date("2026-12-02T06:00:00.000Z");
const PAID = 119900;

function cancelled(over: Partial<Subscription> = {}): Subscription {
  const lines = [
    {
      planId: "p1",
      planKey: "essential",
      name: "Everyday Essentials",
      boxes: 1,
      monthlyPrice: 1199,
      lineTotal: 1199,
      gramsPerBox: 100,
    },
  ];
  return {
    id: "FSAAAAAAAAAA",
    userId: "u1",
    email: null,
    status: "cancelled",
    lines,
    total: 1199,
    deliveries: [
      { date: "2026-11-14", week: 1 },
      { date: "2026-11-21", week: 2 },
    ],
    skipped: [],
    held: 0,
    address: {
      label: "Home",
      recipient: "A",
      phone: "9999999999",
      line1: "1",
      pincode: "560001",
    } as OrderAddress,
    locale: "en",
    provider: "razorpay",
    providerOrderId: null,
    receiptNo: null,
    invoiceNo: "FG/2627/00007",
    tax: subscriptionTax(lines, HOME_STATE),
    placeOfSupply: HOME_STATE,
    paidAt: "2026-11-10T05:00:00.000Z",
    finishingAt: "2026-11-10T05:00:00.000Z",
    finishedAt: "2026-11-10T05:00:01.000Z",
    createdAt: "2026-11-10T04:59:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    expiresAt: "2026-11-10T05:20:00.000Z",
    ...over,
  };
}

/** Put a subscription in the table and return the copy a page would read. */
function seed(sub: Subscription = cancelled()): Subscription {
  db.subs.set(sub.id, structuredClone(sub));
  return structuredClone(sub);
}
const stored = () => db.subs.get("FSAAAAAAAAAA")!;
const drawn = () => db.counters.get("credit-note-2627") ?? 0;

const filed = (quarter: string, which: "gstr1" | "gstr3b"): GstFiling[] => [
  {
    quarter,
    gstr1: which === "gstr1" ? { filedOn: "2027-01-10", arn: "AA" } : null,
    gstr3b: which === "gstr3b" ? { filedOn: "2027-01-20", arn: "BB" } : null,
    closing: null,
    updatedAt: "",
  },
];

beforeEach(() => {
  db.subs.clear();
  db.counters.clear();
  db.failDraw = false;
});

describe("recording a refund", () => {
  it("issues one credit note for the amount, from the orders' series, scaled from the bill", async () => {
    db.counters.set("credit-note-2627", 4);
    expect(await recordSubscriptionRefund(seed(), 59950, [], NOW)).toBe("issued");
    expect(stored().creditNote).toEqual({ number: "CN/2627/00005", issuedAt: NOW.toISOString() });
    expect(stored().refund).toMatchObject({ amount: 59950, recordedAt: NOW.toISOString() });
    expect(stored().refund!.rows).toEqual([
      expect.objectContaining({ line: "plan:essential", gross: 59950, taxable: 59950, rate: 0 }),
    ]);
  });

  it("draws one number for a double press", async () => {
    const page = seed();
    expect(await recordSubscriptionRefund(page, 59950, [], NOW)).toBe("issued");
    /* The second press was made from the same page, before it refreshed. */
    expect(await recordSubscriptionRefund(page, 59950, [], NOW)).toBe("taken");
    expect(drawn()).toBe(1);
  });

  it("draws one number for two tabs pressing at once", async () => {
    const tab = seed();
    const outcomes = await Promise.all([
      recordSubscriptionRefund(structuredClone(tab), 59950, [], NOW),
      recordSubscriptionRefund(structuredClone(tab), 30000, [], NOW),
    ]);
    expect(outcomes.sort()).toEqual(["issued", "taken"]);
    expect(drawn()).toBe(1);
    expect(stored().creditNote!.number).toBe("CN/2627/00001");
  });

  it("refuses more than was paid, nothing, and part paise, and draws nothing", async () => {
    const page = seed();
    expect(await recordSubscriptionRefund(page, PAID + 1, [], NOW)).toBe("badAmount");
    expect(await recordSubscriptionRefund(page, 0, [], NOW)).toBe("badAmount");
    expect(await recordSubscriptionRefund(page, 100.5, [], NOW)).toBe("badAmount");
    expect(await recordSubscriptionRefund(page, PAID, [], NOW)).toBe("issued");
    expect(drawn()).toBe(1);
  });

  it("refuses a subscription that is not cancelled, was never billed, or is already refunded", async () => {
    expect(await recordSubscriptionRefund(seed(cancelled({ status: "active" })), 100, [], NOW)).toBe(
      "refused",
    );
    expect(
      await recordSubscriptionRefund(seed(cancelled({ invoiceNo: null, tax: null })), 100, [], NOW),
    ).toBe("refused");
    const done = cancelled({ refund: { amount: 100, rows: [], recordedAt: "" } });
    expect(await recordSubscriptionRefund(seed(done), 100, [], NOW)).toBe("refused");
    expect(drawn()).toBe(0);
  });

  it("refuses while the month it would be issued in is in a filed return", async () => {
    const page = seed();
    /* December is in 2627-Q3: either return filed closes it. */
    expect(await recordSubscriptionRefund(page, 59950, filed("2627-Q3", "gstr1"), NOW)).toBe("locked");
    expect(await recordSubscriptionRefund(page, 59950, filed("2627-Q3", "gstr3b"), NOW)).toBe("locked");
    expect(stored().refund).toBeUndefined();
    expect(drawn()).toBe(0);
    /* The bill's own quarter being filed is no bar to a note in a later one. */
    const january = new Date("2027-01-05T06:00:00.000Z");
    expect(await recordSubscriptionRefund(page, 59950, filed("2627-Q3", "gstr3b"), january)).toBe("issued");
  });

  it("numbers the note in the financial year it is issued", async () => {
    const april = new Date("2027-04-01T00:00:00.000Z");
    expect(await recordSubscriptionRefund(seed(), 59950, [], april)).toBe("issued");
    expect(stored().creditNote!.number).toBe("CN/2728/00001");
  });
});

describe("a refund left owing its credit note", () => {
  /** Record a refund whose run dies before it draws. */
  async function stall(): Promise<Subscription> {
    db.failDraw = true;
    await expect(recordSubscriptionRefund(seed(), 59950, [], NOW)).rejects.toThrow();
    return structuredClone(stored());
  }

  it("is owed, and the number was not drawn", async () => {
    const sub = await stall();
    expect(owesSubscriptionCreditNote(sub)).toBe(true);
    expect(canRecordRefund(sub)).toBe(false);
    expect(drawn()).toBe(0);
  });

  it("is left alone while the lease is fresh, then finished by one press", async () => {
    const sub = await stall();
    expect(await finishSubscriptionCreditNote(sub, [], new Date(NOW.getTime() + 1000))).toBe("running");
    const later = new Date(NOW.getTime() + CREDIT_NOTE_LEASE_MS);
    const outcomes = await Promise.all([
      finishSubscriptionCreditNote(structuredClone(sub), [], later),
      finishSubscriptionCreditNote(structuredClone(sub), [], later),
    ]);
    expect(outcomes.sort()).toEqual(["issued", "taken"]);
    expect(drawn()).toBe(1);
    expect(stored().creditNote).toEqual({ number: "CN/2627/00001", issuedAt: later.toISOString() });
  });

  it("is refused while its month is filed, and needs no press once issued", async () => {
    const sub = await stall();
    const later = new Date(NOW.getTime() + CREDIT_NOTE_LEASE_MS);
    expect(await finishSubscriptionCreditNote(sub, filed("2627-Q3", "gstr1"), later)).toBe("locked");
    expect(await finishSubscriptionCreditNote(sub, [], later)).toBe("issued");
    expect(await finishSubscriptionCreditNote(structuredClone(stored()), [], later)).toBe("refused");
    expect(drawn()).toBe(1);
  });

  it("lets a run that lost its lease set nothing", async () => {
    const sub = await stall();
    const later = new Date(NOW.getTime() + CREDIT_NOTE_LEASE_MS);
    expect(await finishSubscriptionCreditNote(sub, [], later)).toBe("issued");
    /* The original run, waking late with its own lease, cannot overwrite. */
    const { setSubscriptionCreditNote } = await import("@/lib/repo/subscriptions");
    expect(
      await setSubscriptionCreditNote(sub.id, { number: "X", issuedAt: "" }, sub.creditNoteClaimedAt!),
    ).toBe(false);
    expect(stored().creditNote!.number).toBe("CN/2627/00001");
  });
});

describe("what the page offers", () => {
  it("suggests the Saturdays not delivered", () => {
    /* Two of four delivered: half of ₹1,199. */
    expect(undeliveredValue(cancelled())).toBe(59950);
    expect(undeliveredValue(cancelled({ deliveries: [] }))).toBe(PAID);
    expect(
      undeliveredValue(cancelled({ deliveries: cancelled().deliveries.concat(cancelled().deliveries) })),
    ).toBe(0);
  });

  it("offers a refund only on a cancelled, billed subscription with none recorded", () => {
    expect(canRecordRefund(cancelled())).toBe(true);
    expect(canRecordRefund(cancelled({ status: "paused" }))).toBe(false);
    expect(canRecordRefund(cancelled({ invoiceNo: null }))).toBe(false);
    expect(canRecordRefund(cancelled({ creditNote: { number: "CN/2627/00001", issuedAt: "" } }))).toBe(false);
  });
});

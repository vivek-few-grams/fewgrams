import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/types";
import { HOLDING_STATUSES, countedToStored, heldForOrders } from "./held-stock";
import { canCancel, type Order, type OrderLine } from "./order";

const line = (
  kind: OrderLine["kind"],
  key: string,
  units: number,
  extra: Partial<OrderLine> = {},
): OrderLine => ({
  kind,
  key,
  name: key,
  units,
  unitPrice: 100,
  lineTotal: 100 * units,
  grams: kind === "seed" ? units * 100 : null,
  readyDate: "2026-11-09",
  sourcing: null,
  parts: null,
  ...extra,
});

const parcel = (lines: string[], trackingNumber: string | null = null) =>
  ({
    lines,
    trackingNumber,
    bookingStartedAt: null,
    booking: null,
    quote: null,
  }) as unknown as Order["shipments"][number];

const order = (x: Partial<Order>): Order =>
  ({
    id: "FG1",
    status: "paid",
    lines: [],
    shipments: [],
    stockTaken: null,
    finishingAt: "2026-11-08T10:00:00Z",
    finishedAt: "2026-11-08T10:00:01Z",
    ...x,
  }) as Order;

describe("heldForOrders — stock paid orders took that is still here", () => {
  it("counts what each waiting order recorded taking, owed packs included", () => {
    const held = heldForOrders([
      order({
        lines: [line("tray", "pair", 3), line("seed", "dill", 2)],
        stockTaken: [
          { kind: "tray", key: "pair", amount: 3 },
          { kind: "seed", key: "dill", amount: 150 },
        ],
        shipments: [parcel(["tray:pair", "seed:dill"])],
      }),
      order({
        id: "FG2",
        status: "ready_for_delivery",
        lines: [line("tray", "pair", 1)],
        stockTaken: [{ kind: "tray", key: "pair", amount: 1 }],
        shipments: [parcel(["tray:pair"])],
      }),
    ]);
    expect(held.get("tray:pair")).toBe(4);
    // What the shelf actually gave, not the 200 g ordered.
    expect(held.get("seed:dill")).toBe(150);
  });

  it("leaves out orders that have left, and parcels already with a courier", () => {
    const taken = [{ kind: "tray" as const, key: "pair", amount: 2 }];
    const held = heldForOrders([
      order({ status: "out_for_delivery", lines: [line("tray", "pair", 2)], stockTaken: taken }),
      order({ status: "cancelled", lines: [line("tray", "pair", 2)], stockTaken: taken }),
      order({
        status: "ready_for_delivery",
        lines: [line("tray", "pair", 2), line("media", "coir", 1)],
        stockTaken: [...taken, { kind: "media", key: "coir", amount: 1 }],
        // The trays went by courier from our pickup; the block waits for our own run.
        shipments: [parcel(["tray:pair"], "XB123"), parcel(["media:coir"])],
      }),
    ]);
    expect(held.get("tray:pair")).toBeUndefined();
    expect(held.get("media:coir")).toBe(1);
  });

  it("follows a starter pack's parts to the pack's own parcel", () => {
    const pack = line("pack", "tray-pack~~dill.kale", 1, {
      parts: [
        { kind: "tray", key: "pair", units: 4 },
        { kind: "seed", key: "dill", units: 1 },
        { kind: "seed", key: "kale", units: 1 },
      ] as OrderLine["parts"],
    });
    const stockTaken = [
      { kind: "tray" as const, key: "pair", amount: 4 },
      { kind: "seed" as const, key: "dill", amount: 100 },
      { kind: "seed" as const, key: "kale", amount: 100 },
    ];
    const id = "pack:tray-pack~~dill.kale";
    expect([...heldForOrders([order({ lines: [pack], stockTaken, shipments: [parcel([id])] })])]).toEqual([
      ["tray:pair", 4],
      ["seed:dill", 100],
      ["seed:kale", 100],
    ]);
    expect(heldForOrders([order({ lines: [pack], stockTaken, shipments: [parcel([id], "XB9")] })]).size).toBe(
      0,
    );
  });

  it("holds only what an unfinished order has taken so far", () => {
    const held = heldForOrders([
      order({
        lines: [line("tray", "pair", 1), line("media", "coir", 2)],
        stockTaken: [{ kind: "tray", key: "pair", amount: 1 }],
        finishedAt: null,
      }),
      order({ id: "FG2", lines: [line("tray", "pair", 5)], stockTaken: null, finishedAt: null }),
    ]);
    expect([...held]).toEqual([["tray:pair", 1]]);
  });

  it("reads an order paid before the record existed by its lines", () => {
    const held = heldForOrders([
      order({ lines: [line("tray", "pair", 2)], stockTaken: null, finishingAt: null }),
    ]);
    expect(held.get("tray:pair")).toBe(2);
  });

  it("asks exactly the statuses a cancel is still allowed from", () => {
    expect([...HOLDING_STATUSES].sort()).toEqual(ORDER_STATUSES.filter(canCancel).sort());
  });
});

describe("countedToStored — a stocktake keeps what is owed", () => {
  it("takes what waiting orders hold back off the count", () => {
    // Hold 1, sell 3, nothing sent: the figure reads -2 and the shelf has 1.
    expect(countedToStored(1, 3, "packs")).toBe(-2);
    expect(countedToStored(10, 3, "packs")).toBe(7);
    expect(countedToStored(350, 150, "grams")).toBe(200);
  });

  it("never stores seed below zero, and rounds grams to the hundredth", () => {
    expect(countedToStored(50, 150, "grams")).toBe(0);
    expect(countedToStored(100.3, 0.1, "grams")).toBe(100.2);
  });
});

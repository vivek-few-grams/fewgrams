import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourierOption, QuoteInput, ShippingProvider } from "./provider";

/* The scan's own rules, with the couriers and the settings row stubbed. */
const providers: ShippingProvider[] = [];
vi.mock("./index", () => ({ shippingProviders: () => providers }));
const settings = {
  pickup: { name: "Fewgrams", phone: "9999999999", address: "x", city: "Home", pincode: "560034" },
  origins: [{ id: "trays-co", name: "Trays Co", phone: "8888888888", address: "y", city: "Chennai", pincode: "600001" }],
  vendorOf: { "rack:shelf": "trays-co" } as Record<string, string>,
  greenRunFee: 200,
  packing: { seedPackingGrams: 100 },
};
vi.mock("@/lib/repo/shipping", async (orig) => ({
  ...(await orig<typeof import("@/lib/repo/shipping")>()),
  getShippingSettings: async () => settings,
}));
const mat = { contentKey: "drain-cell-mat", packPieces: 5, pieceLengthCm: 50, pieceWidthCm: 25, pieceHeightCm: 3, pieceStackCm: 1, pieceGrams: 300 };
vi.mock("@/lib/repo/trays", () => ({ listTrays: async () => [mat] }));
vi.mock("@/lib/repo/grow-media", () => ({ listGrowMedia: async () => [] }));
/* A 6 ft, 5-shelf, 1 × 2 ft shelf rack: 2.5 kg, 183 × 30 × 15 cm, so
   16,723 g by size. */
vi.mock("@/lib/racks/catalogue", () => ({
  findSellableRack: async () => ({
    rack: { range: "shelf", heightFt: 6, shelves: 5, depthFt: 1, lengthFt: 2, gramsPerShelf: 500, packing: { kind: "plates", shelfCm: 3 } },
    colour: "orange",
  }),
}));

const { deliveryCharge, deliveryPlan } = await import("./charge");

/** A courier that answers every route with `answer`, or by origin PIN. */
function courier(
  name: ShippingProvider["name"],
  answer: CourierOption[] | Error | ((input: QuoteInput) => CourierOption[]),
): ShippingProvider & { calls: QuoteInput[] } {
  const p = {
    name,
    mode: "production" as const,
    calls: [] as QuoteInput[],
    async options(input: QuoteInput) {
      p.calls.push(input);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(input) : answer;
    },
  };
  return p;
}

const opt = (id: string, total: number, extra: Partial<CourierOption> = {}): CourierOption => ({
  id,
  courier: id.split(":")[0] as CourierOption["courier"],
  carrier: null,
  serviceId: null,
  total,
  beforeTax: total / 1.18,
  chargedGrams: 600,
  zone: "C",
  days: null,
  ...extra,
});

/* A different PIN per test, so the ten-minute scan cache never answers for
   an earlier test. */
let pin = 110000;
const seeds = [{ kind: "seed" as const, key: "radish", units: 5, grams: 500, lineTotal: 300 }];
const mats = { kind: "tray" as const, key: "drain-cell-mat", units: 1, grams: null, lineTotal: 300 };
const rack = { kind: "rack" as const, key: "rk-6f-5s-1x2-1.4-orange", units: 1, grams: null, lineTotal: 3550 };
const greens = { kind: "variety" as const, key: "radish", units: 1, grams: null, lineTotal: 80 };

beforeEach(() => {
  providers.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  pin += 1;
});

describe("deliveryPlan", () => {
  it("asks every courier and lists their options cheapest first, rounded up", async () => {
    providers.push(
      courier("delhivery", [opt("delhivery", 59.14)]),
      courier("ekart", [opt("ekart", 106.2)]),
      courier("shiprocket", [opt("shiprocket:43", 65.72, { carrier: "Xpressbees", serviceId: "43", days: 5 })]),
    );
    const r = await deliveryPlan(seeds, String(pin));
    expect(r.ok && r.ownRun).toBeNull();
    expect(r.ok && r.parcels.map((p) => [p.id, p.options.map((o) => [o.id, o.amount])])).toEqual([
      ["home", [["delhivery", 60], ["shiprocket:43", 66], ["ekart", 107]]],
    ]);
  });

  it("keeps the others' prices when one courier fails", async () => {
    providers.push(courier("delhivery", new Error("429")), courier("ekart", [opt("ekart", 106.2)]));
    const r = await deliveryPlan(seeds, String(pin));
    expect(r.ok && r.parcels[0].options.map((o) => o.id)).toEqual(["ekart"]);
  });

  it("gives no price, never a free one, when no courier answers", async () => {
    providers.push(courier("delhivery", new Error("down")));
    expect(await deliveryPlan(seeds, String(pin))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says no courier is connected rather than that one is down", async () => {
    expect(await deliveryPlan(seeds, String(pin))).toEqual({ ok: false, reason: "noCourier" });
  });

  it("puts greens on the own run without asking a courier", async () => {
    const d = courier("delhivery", [opt("delhivery", 59)]);
    providers.push(d);
    const r = await deliveryPlan([greens, ...seeds], String(pin));
    expect(r.ok && r.ownRun).toMatchObject({ amount: 200, lines: [greens, ...seeds] });
    expect(r.ok && r.parcels).toEqual([]);
    expect(d.calls).toHaveLength(0);
  });

  it("answers a repeat scan from the cache", async () => {
    const d = courier("delhivery", [opt("delhivery", 59)]);
    providers.push(d);
    await deliveryPlan(seeds, String(pin));
    await deliveryPlan(seeds, String(pin));
    expect(d.calls).toHaveLength(1);
  });

  /* The owner, 25 Sep 2026: everything ships from our pickup except shelf
     racks, which always ship from their vendor. */
  it("ships trays from our pickup and the shelf rack from its vendor", async () => {
    const d = courier("delhivery", (q) => [opt("delhivery", q.originPin === "600001" ? 480 : 100)]);
    providers.push(d);
    const r = await deliveryPlan([...seeds, mats, rack], String(pin));
    expect(r.ok && r.parcels.map((p) => [p.id, p.lines.map((l) => l.kind), p.options[0].amount])).toEqual([
      ["home", ["seed", "tray"], 100],
      ["trays-co", ["rack"], 480],
    ]);
    expect(d.calls.find((c) => c.originPin === "600001")?.grams).toBe(16723);
  });

  it("sends a shelf rack by courier from its vendor even with greens on the own run", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 480)]));
    const r = await deliveryPlan([greens, mats, rack], String(pin));
    expect(r.ok && r.ownRun?.lines).toEqual([greens, mats]);
    expect(r.ok && r.parcels.map((p) => p.id)).toEqual(["trays-co"]);
  });

  it("refuses the whole order when the rack maker's parcel cannot be carried", async () => {
    providers.push(courier("delhivery", (q) => (q.originPin === "600001" ? [] : [opt("delhivery", 60)])));
    expect(await deliveryPlan([...seeds, rack], String(pin))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("ships a shelf rack from our pickup until its vendor is set", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 60)]));
    const saved = settings.vendorOf["rack:shelf"];
    delete settings.vendorOf["rack:shelf"];
    try {
      const r = await deliveryPlan([...seeds, rack], String(pin));
      expect(r.ok && r.parcels.map((p) => p.id)).toEqual(["home"]);
    } finally {
      settings.vendorOf["rack:shelf"] = saved;
    }
  });

  it("refuses rather than guesses when the rack's vendor has been removed", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 60)]));
    settings.vendorOf["rack:shelf"] = "removed";
    try {
      expect(await deliveryPlan([rack], String(pin))).toEqual({ ok: false, reason: "notConfigured" });
    } finally {
      settings.vendorOf["rack:shelf"] = "trays-co";
    }
  });
});

describe("deliveryCharge", () => {
  it("charges the option chosen, not the cheapest", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 59.14)]), courier("ekart", [opt("ekart", 106.2)]));
    const r = await deliveryCharge(seeds, String(pin), { home: "ekart" });
    expect(r).toMatchObject({ ok: true, amount: 107, shipments: [{ method: "courier", quote: { courier: "ekart", quotedTotal: 106.2 } }] });
  });

  it("records Shiprocket's carrier and service id for booking", async () => {
    providers.push(courier("shiprocket", [opt("shiprocket:43", 65.72, { carrier: "Xpressbees", serviceId: "43" })]));
    const r = await deliveryCharge(seeds, String(pin), { home: "shiprocket:43" });
    expect(r.ok && r.shipments[0].quote).toMatchObject({ courier: "shiprocket", carrier: "Xpressbees", serviceId: "43" });
  });

  it("refuses an option that is no longer offered instead of charging another", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 59.14)]));
    expect(await deliveryCharge(seeds, String(pin), { home: "ekart" })).toEqual({ ok: false, reason: "optionGone" });
    expect(await deliveryCharge(seeds, String(pin), {})).toEqual({ ok: false, reason: "optionGone" });
  });

  it("adds each parcel's chosen price", async () => {
    providers.push(
      courier("delhivery", (q) => [opt("delhivery", q.originPin === "600001" ? 480 : 60)]),
      courier("ekart", (q) => [opt("ekart", q.originPin === "600001" ? 450.5 : 999)]),
    );
    const r = await deliveryCharge([...seeds, rack], String(pin), { home: "delhivery", "trays-co": "ekart" });
    expect(r.ok && r.amount).toBe(60 + 451);
    expect(r.ok && r.shipments.map((x) => [x.origin.id, x.method, x.amount])).toEqual([
      ["home", "courier", 60],
      ["trays-co", "courier", 451],
    ]);
  });

  it("charges the own-run fee for greens", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 60)]));
    const r = await deliveryCharge([greens, ...seeds], String(pin), {});
    expect(r).toMatchObject({ ok: true, amount: 200, shipments: [{ method: "own_run", amount: 200 }] });
  });

  it("needs a choice for every parcel", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 60)]));
    expect(await deliveryCharge([...seeds, rack], String(pin), { home: "delhivery" })).toEqual({
      ok: false,
      reason: "optionGone",
    });
  });
});


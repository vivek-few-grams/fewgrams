import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourierOption, ShippingProvider } from "./provider";

/* The scan's own rules, with the couriers and the settings row stubbed. */
const providers: ShippingProvider[] = [];
vi.mock("./index", () => ({ shippingProviders: () => providers }));
vi.mock("@/lib/repo/shipping", () => ({
  getShippingSettings: async () => ({
    pickup: { pincode: "560034" },
    greenRunFee: 200,
    packing: { seedPackingGrams: 100, shelfStackCm: 4 },
  }),
}));
vi.mock("@/lib/repo/trays", () => ({ listTrays: async () => [] }));
vi.mock("@/lib/repo/grow-media", () => ({ listGrowMedia: async () => [] }));
vi.mock("@/lib/racks/catalogue", () => ({ findSellableRack: async () => null }));

const { deliveryCharge, deliveryOptions } = await import("./charge");

function courier(name: ShippingProvider["name"], answer: CourierOption[] | Error): ShippingProvider & { calls: number } {
  const p = {
    name,
    mode: "production" as const,
    calls: 0,
    async options() {
      p.calls++;
      if (answer instanceof Error) throw answer;
      return answer;
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

beforeEach(() => {
  providers.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  pin += 1;
});

describe("deliveryOptions", () => {
  it("asks every courier and lists their options cheapest first, rounded up", async () => {
    providers.push(
      courier("delhivery", [opt("delhivery", 59.14)]),
      courier("ekart", [opt("ekart", 106.2)]),
      courier("shiprocket", [opt("shiprocket:43", 65.72, { carrier: "Xpressbees", serviceId: "43", days: 5 })]),
    );
    const r = await deliveryOptions(seeds, String(pin));
    expect(r.ok && r.method === "courier" && r.options.map((o) => [o.id, o.amount])).toEqual([
      ["delhivery", 60],
      ["shiprocket:43", 66],
      ["ekart", 107],
    ]);
  });

  it("keeps the others' prices when one courier fails", async () => {
    providers.push(courier("delhivery", new Error("429")), courier("ekart", [opt("ekart", 106.2)]));
    const r = await deliveryOptions(seeds, String(pin));
    expect(r.ok && r.method === "courier" && r.options.map((o) => o.id)).toEqual(["ekart"]);
  });

  it("gives no price, never a free one, when no courier answers", async () => {
    providers.push(courier("delhivery", new Error("down")));
    expect(await deliveryOptions(seeds, String(pin))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says no courier is connected rather than that one is down", async () => {
    expect(await deliveryOptions(seeds, String(pin))).toEqual({ ok: false, reason: "noCourier" });
  });

  it("puts any order with greens on the own run without asking a courier", async () => {
    const d = courier("delhivery", [opt("delhivery", 59)]);
    providers.push(d);
    const r = await deliveryOptions([{ kind: "variety", key: "radish", units: 1, grams: 100, lineTotal: 80 }], String(pin));
    expect(r).toEqual({ ok: true, method: "own_run", amount: 200 });
    expect(d.calls).toBe(0);
  });

  it("answers a repeat scan from the cache", async () => {
    const d = courier("delhivery", [opt("delhivery", 59)]);
    providers.push(d);
    await deliveryOptions(seeds, String(pin));
    await deliveryOptions(seeds, String(pin));
    expect(d.calls).toBe(1);
  });
});

describe("deliveryCharge", () => {
  it("charges the option chosen, not the cheapest", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 59.14)]), courier("ekart", [opt("ekart", 106.2)]));
    const r = await deliveryCharge(seeds, String(pin), "ekart");
    expect(r).toMatchObject({ ok: true, method: "courier", amount: 107, quote: { courier: "ekart", quotedTotal: 106.2 } });
  });

  it("records Shiprocket's carrier and service id for booking", async () => {
    providers.push(courier("shiprocket", [opt("shiprocket:43", 65.72, { carrier: "Xpressbees", serviceId: "43" })]));
    const r = await deliveryCharge(seeds, String(pin), "shiprocket:43");
    expect(r.ok && r.quote).toMatchObject({ courier: "shiprocket", carrier: "Xpressbees", serviceId: "43" });
  });

  it("refuses an option that is no longer offered instead of charging another", async () => {
    providers.push(courier("delhivery", [opt("delhivery", 59.14)]));
    expect(await deliveryCharge(seeds, String(pin), "ekart")).toEqual({ ok: false, reason: "optionGone" });
    expect(await deliveryCharge(seeds, String(pin), null)).toEqual({ ok: false, reason: "optionGone" });
  });
});

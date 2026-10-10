import { afterEach, describe, expect, it, vi } from "vitest";
import { EkartProvider } from "./ekart";
import { shippingProviders } from "./index";
import { ShiprocketProvider, carrierName } from "./shiprocket";
import { VelocityProvider, warehouseFor } from "./velocity";
import { boxForGrams, volumetricGrams } from "./weight";
import { courierArrival, courierPickup, fromIstDateISO, istDateISO } from "@/lib/delivery-date";

/* Bodies trimmed from live production responses, 24 Sep 2026. */
const EKART_TOKEN = { access_token: "ek-tok", token_type: "Bearer", expires_in: 3600 };
const EKART_500G = [
  {
    tat: { min: 4, max: 5 },
    forwardDeliveredCharges: {
      forwardFreight: "90.00",
      forwardFuelSurcharge: "0.00",
      codCharges: "0.00",
      deliveredTotalTax: "16.20",
      totalForwardDeliveredEstimate: "106.20",
    },
    isReverse: false,
  },
];
const SR_TOKEN = { token: "sr-tok" };
const SR_COMPANIES = {
  data: {
    available_courier_companies: [
      {
        courier_company_id: 55,
        courier_name: "Blue Dart Surface",
        rate: 93.96,
        estimated_delivery_days: "7",
        charge_weight: 0.5,
      },
      {
        courier_company_id: 43,
        courier_name: "Xpressbees Surface 2kg",
        rate: 65.72,
        estimated_delivery_days: "5",
        charge_weight: 0.5,
      },
      {
        courier_company_id: 44,
        courier_name: "Xpressbees Surface",
        rate: 70.1,
        estimated_delivery_days: "5",
        charge_weight: 0.5,
      },
      { courier_company_id: 99, courier_name: "Blocked Air", rate: 10, blocked: 1 },
    ],
  },
};

/* Trimmed from a live production response, 1 Oct 2026 (560072 → 400001, 500 g). */
const at = (d: string) => ({ datetime: `${d}T12:00:00.000+05:30`, human_readable: "" });
const VEL_COURIER = (id: string, name: string, rate: number, level = "road", delivery = "2026-10-07") => ({
  carrier_id: id,
  carrier_name: name,
  service_level: level,
  status: true,
  expected_delivery: { pickup: at("2026-10-02"), delivery: at(delivery) },
  charges: { forward_freight_charges: rate, cod_charges: 0, rto_charges: 26, total_forward_charges: rate },
  platform_fee: 0,
});
const VEL_RATES = {
  status: "SUCCESS",
  result: {
    serviceable_couriers: [
      VEL_COURIER("CAR0EPDPJXXL4", "DTDC Standard", 36),
      VEL_COURIER("CARISGEX1QMVB", "Bluedart Air", 30, "air", "2026-10-05"),
      VEL_COURIER("CARADCBTZMQMM", "Xpressbees Standard 250G", 34, "road", "2026-10-06"),
    ],
    shipment_details: { zone: "C", dead_weight: 500, volumetric_weight: 439.4, applicable_weight: 500 },
  },
};

/** Answers each call in turn. */
function stubFetchSequence(...bodies: Array<{ body: unknown; status?: number }>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const b of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(b.body), { status: b.status ?? 200 }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const INPUT = {
  originPin: "560001",
  destinationPin: "110001",
  grams: 500,
  speed: "surface" as const,
  value: 400,
};

describe("courier dates", () => {
  /* The owner's example, 24 Sep 2026: seed ordered on the 24th is ready off
     the shelf on the 25th, packed that day, and collected on the 26th. */
  it("collects the day after the cart is ready, leaving a day to pack", () => {
    expect(istDateISO(courierPickup(fromIstDateISO("2026-09-25")))).toBe("2026-09-26");
  });

  it("counts the courier's days on from the pickup day", () => {
    const pickup = fromIstDateISO("2026-09-26");
    expect(istDateISO(courierArrival(pickup, 3))).toBe("2026-09-29");
    expect(istDateISO(courierArrival(pickup, 0))).toBe("2026-09-26");
  });
});

describe("boxForGrams", () => {
  it("never declares a box whose size outweighs the parcel", () => {
    for (const g of [1, 100, 500, 1920, 5000, 12_000, 47_311]) {
      expect(volumetricGrams(boxForGrams(g))).toBeLessThanOrEqual(Math.max(g, 1));
    }
  });
  it("is a whole-centimetre cube", () => {
    expect(boxForGrams(500)).toEqual({ length: 13, width: 13, height: 13 });
  });
});

describe("Ekart", () => {
  it("signs in with the client id in the path, then asks price and transit time in one call", async () => {
    const f = stubFetchSequence({ body: EKART_TOKEN }, { body: EKART_500G });
    const [o] = await new EkartProvider("EKART_x", "u@x.in", "pw").options(INPUT);

    expect(String(f.mock.calls[0]![0])).toBe(
      "https://app.elite.ekartlogistics.in/integrations/v2/auth/token/EKART_x",
    );
    expect(String(f.mock.calls[1]![0])).toBe("https://app.elite.ekartlogistics.in/data/v3/serviceability");
    const sent = JSON.parse(String(f.mock.calls[1]![1]!.body));
    expect(sent).toMatchObject({
      pickupPincode: "560001",
      dropPincode: "110001",
      weight: "500",
      paymentType: "Prepaid",
      serviceType: "SURFACE",
      invoiceAmount: "400",
    });
    expect(new Headers(f.mock.calls[1]![1]!.headers).get("authorization")).toBe("Bearer ek-tok");
    /* The later of Ekart's two days, so the date promised is never its best case. */
    expect(o).toEqual({
      id: "ekart",
      courier: "ekart",
      carrier: null,
      serviceId: null,
      total: 106.2,
      beforeTax: 90,
      chargedGrams: 500,
      zone: "",
      days: 5,
    });
  });

  it("reuses its token for the next quote", async () => {
    const f = stubFetchSequence({ body: EKART_TOKEN }, { body: EKART_500G }, { body: EKART_500G });
    const ek = new EkartProvider("EKART_x", "u", "p");
    await ek.options(INPUT);
    await ek.options(INPUT);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("treats a quote with no total as a refusal, never as free", async () => {
    stubFetchSequence(
      { body: EKART_TOKEN },
      { body: [{ ...EKART_500G[0], forwardDeliveredCharges: { totalForwardDeliveredEstimate: "0.00" } }] },
    );
    await expect(new EkartProvider("c", "u", "p").options(INPUT)).rejects.toThrow(/no price/);
  });

  it("throws on a refused sign-in", async () => {
    stubFetchSequence({ body: { message: "bad" }, status: 401 });
    await expect(new EkartProvider("c", "u", "p").options(INPUT)).rejects.toThrow(/sign-in/);
  });
});

describe("Shiprocket", () => {
  it("keeps only the cheapest unblocked carrier, named as a carrier", async () => {
    const f = stubFetchSequence({ body: SR_TOKEN }, { body: SR_COMPANIES });
    const opts = await new ShiprocketProvider("api@x.in", "pw").options(INPUT);

    const q = new URL(String(f.mock.calls[1]![0])).searchParams;
    expect(q.get("weight")).toBe("0.5");
    expect(q.get("cod")).toBe("0");
    expect(opts).toEqual([
      {
        id: "shiprocket:43",
        courier: "shiprocket",
        carrier: "Xpressbees",
        serviceId: "43",
        total: 65.72,
        beforeTax: 55.69,
        chargedGrams: 500,
        zone: "",
        days: 5,
      },
    ]);
  });

  it("throws when no carrier is offered", async () => {
    stubFetchSequence({ body: SR_TOKEN }, { body: { data: { available_courier_companies: [] } } });
    await expect(new ShiprocketProvider("a", "p").options(INPUT)).rejects.toThrow(/no carrier/);
  });
});

describe("Velocity", () => {
  it("keeps the cheapest road carrier, adds GST, and counts days from pickup", async () => {
    const f = stubFetchSequence({ body: VEL_RATES });
    const opts = await new VelocityProvider("key").options(INPUT);

    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://shazam.velocity.in/custom/api/v1/rates");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer key");
    expect(JSON.parse(String(init!.body))).toEqual({
      journey_type: "forward",
      origin_pincode: "560001",
      destination_pincode: "110001",
      dead_weight: 500,
      length: 13,
      width: 13,
      height: 13,
      payment_method: "prepaid",
    });
    /* The ₹30 air option is cheaper but not surface, so it is not offered. */
    expect(opts).toEqual([
      {
        id: "velocity:CARADCBTZMQMM",
        courier: "velocity",
        carrier: "Xpressbees",
        serviceId: "CARADCBTZMQMM",
        total: 40.12,
        beforeTax: 34,
        chargedGrams: 500,
        zone: "C",
        days: 4,
      },
    ]);
  });

  it("throws on a refusal rather than offering nothing", async () => {
    stubFetchSequence({ body: { status: "ERROR", message: "Invalid pincode" }, status: 400 });
    await expect(new VelocityProvider("key").options(INPUT)).rejects.toThrow(/Invalid pincode/);
  });

  it("throws when only air carriers answer", async () => {
    stubFetchSequence({
      body: {
        ...VEL_RATES,
        result: { ...VEL_RATES.result, serviceable_couriers: [VEL_COURIER("A", "Bluedart Air", 30, "air")] },
      },
    });
    await expect(new VelocityProvider("key").options(INPUT)).rejects.toThrow(/no carrier/);
  });

  it("reads a pickup's warehouse id from VELOCITY_WAREHOUSES", () => {
    expect(warehouseFor("Fewgrams Home", '{"Fewgrams Home":"WH66DU"}')).toBe("WH66DU");
    expect(warehouseFor("Rack vendor", '{"Fewgrams Home":"WH66DU"}')).toBeNull();
    expect(warehouseFor("Fewgrams Home", "not json")).toBeNull();
    expect(warehouseFor("Fewgrams Home", undefined)).toBeNull();
  });
});

describe("carrierName", () => {
  it.each([
    ["Xpressbees Surface 2kg", "Xpressbees"],
    ["Delhivery Surface 10kg", "Delhivery"],
    ["Delhivery Surface 2 Kgs", "Delhivery"],
    ["Shadowfax Heavy 10Kg", "Shadowfax"],
    ["Blue Dart Surface", "Blue Dart"],
    ["DTDC 5kg", "DTDC"],
    ["Ekart", "Ekart"],
    ["Xpressbees Standard 250G", "Xpressbees"],
    ["Delhivery Standard 5 Kg", "Delhivery"],
    ["Amazon Standard 10KG", "Amazon"],
  ])("%s → %s", (raw, want) => {
    expect(carrierName(raw)).toBe(want);
  });
});

describe("shippingProviders()", () => {
  it("lists only the couriers with credentials, Delhivery first", () => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "t");
    vi.stubEnv("DELHIVERY_ENV", "production");
    vi.stubEnv("EKART_CLIENT_ID", "");
    vi.stubEnv("SHIPROCKET_EMAIL", "a@x.in");
    vi.stubEnv("SHIPROCKET_PASSWORD", "p");
    vi.stubEnv("VELOCITY_API_KEY", "");
    expect(shippingProviders().map((p) => p.name)).toEqual(["delhivery", "shiprocket"]);
  });

  it("adds Velocity last when its key is set", () => {
    for (const k of ["DELHIVERY_API_TOKEN", "EKART_CLIENT_ID", "SHIPROCKET_EMAIL"]) vi.stubEnv(k, "");
    vi.stubEnv("VELOCITY_API_KEY", "key");
    expect(shippingProviders().map((p) => p.name)).toEqual(["velocity"]);
  });

  it("is empty with nothing configured", () => {
    for (const k of ["DELHIVERY_API_TOKEN", "EKART_CLIENT_ID", "SHIPROCKET_EMAIL", "VELOCITY_API_KEY"])
      vi.stubEnv(k, "");
    expect(shippingProviders()).toEqual([]);
  });
});

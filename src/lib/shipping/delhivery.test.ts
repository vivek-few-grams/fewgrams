import { afterEach, describe, expect, it, vi } from "vitest";
import { DelhiveryProvider, delhiveryPickupDate } from "./delhivery";
import { shippingProvider } from "./index";
import { chargeableGrams, volumetricGrams } from "./weight";

/* Bodies below are trimmed from live production responses, 23 Sep 2026. */
const PIN_560001 = {
  delivery_codes: [
    {
      postal_code: {
        pin: 560001,
        pre_paid: "Y",
        pickup: "Y",
        is_oda: "N",
        district: "Bangalore",
        state_code: "KA",
      },
    },
  ],
};

const QUOTE_2KG = [
  {
    status: "Delivered",
    zone: "D2",
    charge_DL: 166,
    gross_amount: 179.12,
    total_amount: 211.36,
    charged_weight: 2000,
    divisor: 5000,
  },
];

const TAT = { success: true, msg: "", data: { tat: 6, expected_delivery_date: "2026-09-30" } };

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(String(fetchMock.mock.calls[0]![0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const prod = new DelhiveryProvider("tok", "production");

describe("host and auth", () => {
  it("sends production calls to track.delhivery.com with the token header", async () => {
    const f = stubFetch(PIN_560001);
    await prod.serviceability("560001");
    expect(calledUrl(f).origin).toBe("https://track.delhivery.com");
    const init = f.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Token tok");
  });

  it("sends staging calls to the staging host", async () => {
    const f = stubFetch(PIN_560001);
    await new DelhiveryProvider("tok", "staging").serviceability("560001");
    expect(calledUrl(f).origin).toBe("https://staging-express.delhivery.com");
  });

  it("throws on a refused token rather than reading it as unserviceable", async () => {
    stubFetch("Login or API Key Required", 401);
    await expect(prod.serviceability("560001")).rejects.toThrow(/401/);
  });
});

describe("serviceability", () => {
  it("normalises the Y/N flags", async () => {
    stubFetch(PIN_560001);
    expect(await prod.serviceability("560001")).toEqual({
      pincode: "560001",
      prepaid: true,
      pickup: true,
      remote: false,
    });
  });

  it("reads an empty list as not served", async () => {
    stubFetch({ delivery_codes: [] });
    expect(await prod.serviceability("560001")).toBeNull();
  });

  it("refuses a malformed PIN before calling out", async () => {
    const f = stubFetch(PIN_560001);
    await expect(prod.serviceability("121")).rejects.toThrow(/PIN/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("quote", () => {
  it("asks for a prepaid, delivered, surface price and reads the total", async () => {
    const f = stubFetch(QUOTE_2KG);
    const q = await prod.quote({ originPin: "160017", destinationPin: "560001", grams: 2000, speed: "surface" });
    expect(q).toEqual({ total: 211.36, beforeTax: 179.12, chargedGrams: 2000, zone: "D2" });
    const p = calledUrl(f).searchParams;
    expect(Object.fromEntries(p)).toEqual({
      md: "S",
      ss: "Delivered",
      o_pin: "160017",
      d_pin: "560001",
      cgm: "2000",
      pt: "Pre-paid",
    });
  });

  it("maps express to md=E", async () => {
    const f = stubFetch(QUOTE_2KG);
    await prod.quote({ originPin: "160017", destinationPin: "560001", grams: 2000, speed: "express" });
    expect(calledUrl(f).searchParams.get("md")).toBe("E");
  });

  it("treats a quote with no total as a refusal, never as free", async () => {
    stubFetch([{ zone: "A" }]);
    await expect(
      prod.quote({ originPin: "560001", destinationPin: "560102", grams: 500, speed: "surface" }),
    ).rejects.toThrow(/no price/);
  });

  it("refuses fractional or zero grams", async () => {
    const f = stubFetch(QUOTE_2KG);
    for (const grams of [0, -1, 12.5]) {
      await expect(
        prod.quote({ originPin: "560001", destinationPin: "560102", grams, speed: "surface" }),
      ).rejects.toThrow(/grams/);
    }
    expect(f).not.toHaveBeenCalled();
  });
});

describe("expected delivery", () => {
  it("sends the pickup time in the only format the live API accepts", async () => {
    const f = stubFetch(TAT);
    const est = await prod.expectedDelivery({
      originPin: "160017",
      destinationPin: "560001",
      speed: "surface",
      pickupAt: new Date("2026-09-24T04:30:00Z"),
    });
    expect(est).toEqual({ days: 6, date: "2026-09-30" });
    expect(calledUrl(f).searchParams.get("expected_pickup_date")).toBe("2026-09-24 10:00");
  });

  it("throws on the API's own failure body", async () => {
    stubFetch({ success: false, msg: "['121 is not valid pin']", data: "" });
    await expect(
      prod.expectedDelivery({
        originPin: "160017",
        destinationPin: "560001",
        speed: "surface",
        pickupAt: new Date(),
      }),
    ).rejects.toThrow(/not valid pin/);
  });
});

describe("delhiveryPickupDate", () => {
  it("formats in IST, crossing midnight from UTC", () => {
    expect(delhiveryPickupDate(new Date("2026-09-23T20:15:00Z"))).toBe("2026-09-24 01:45");
  });
});

describe("chargeable weight", () => {
  it("is L×W×H÷5000 kg for a box", () => {
    expect(volumetricGrams({ length: 100, width: 35, height: 14 })).toBe(9800);
  });

  it("bills a long light box by its size", () => {
    expect(chargeableGrams(4000, { length: 183, width: 30, height: 10 })).toBe(10980);
  });

  it("bills a dense box by its weight", () => {
    expect(chargeableGrams(10000, { length: 40, width: 30, height: 10 })).toBe(10000);
  });

  it("uses the dead weight when there is no box", () => {
    expect(chargeableGrams(499.2, null)).toBe(500);
  });
});

describe("shippingProvider()", () => {
  it("is null with no token", () => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "");
    expect(shippingProvider()).toBeNull();
  });

  it("refuses to guess the environment", () => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "tok");
    vi.stubEnv("DELHIVERY_ENV", "");
    expect(() => shippingProvider()).toThrow(/DELHIVERY_ENV/);
  });

  it("builds the configured mode", () => {
    vi.stubEnv("DELHIVERY_API_TOKEN", "tok");
    vi.stubEnv("DELHIVERY_ENV", "staging");
    expect(shippingProvider()?.mode).toBe("staging");
  });
});

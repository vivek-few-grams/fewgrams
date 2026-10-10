import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/orders/order";
import { bookingState, canBook } from "@/lib/orders/order";
import { bookShipment, bookingInput, parcelReference } from "./book";
import { DelhiveryProvider } from "./delhivery";
import { EkartProvider } from "./ekart";
import type { BookingInput } from "./provider";
import { ShiprocketProvider } from "./shiprocket";
import { VelocityProvider } from "./velocity";

/*
 * Booking — 27 Sep 2026. Every courier call is a stubbed `fetch`: these tests
 * never reach a courier, and nothing here can spend wallet money. Response
 * shapes follow each courier's published reference (see the adapters).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the COURIER_BOOKING switch", () => {
  it("refuses before reading anything when booking is not switched on", async () => {
    vi.stubEnv("COURIER_BOOKING", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    expect(await bookShipment("FG0000000001", 0, "2099-01-01")).toEqual({ ok: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

type Reply = { status?: number; body: unknown };

/** Answers each call in turn and records what was sent. */
function stubFetch(...replies: Reply[]) {
  const calls: { url: string; method: string; body: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const r = replies.shift();
    if (!r) throw new Error(`Unexpected call to ${String(url)}`);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const shipment = (over: Partial<Order["shipments"][number]> = {}): Order["shipments"][number] => ({
  origin: { id: "home", name: "Fewgrams Home", city: "Bengaluru", pincode: "560038" },
  method: "courier",
  lines: ["seed:radish", "tray:standard"],
  charge: 120,
  quote: { courier: "delhivery", quotedTotal: 111.4, chargedGrams: 1800, zone: "D2" },
  deliveryDate: "2026-10-02",
  trackingNumber: null,
  bookingStartedAt: null,
  booking: null,
  ...over,
});

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "FG0000000001",
    userId: "u1",
    email: "asha@example.com",
    status: "ready_for_delivery",
    lines: [
      {
        kind: "seed",
        key: "radish",
        name: "Radish seed",
        units: 2,
        unitPrice: 60,
        lineTotal: 120,
        grams: 100,
        readyDate: "2026-09-28",
        sourcing: "shelf",
      },
      {
        kind: "tray",
        key: "standard",
        name: "Standard tray",
        units: 1,
        unitPrice: 160,
        lineTotal: 160,
        grams: null,
        readyDate: "2026-09-28",
        sourcing: null,
      },
      {
        kind: "variety",
        key: "pea",
        name: "Pea shoots",
        units: 1,
        unitPrice: 200,
        lineTotal: 200,
        grams: 100,
        readyDate: "2026-09-30",
        sourcing: null,
      },
    ],
    total: 600,
    deliveryCharge: 120,
    deliveryMethod: "courier",
    shippingQuote: null,
    shipments: [shipment()],
    deliveryDate: "2026-10-02",
    address: {
      label: "Home",
      recipient: "Asha R",
      phone: "9876543210",
      line1: "12 3rd Cross",
      line2: "Indiranagar",
      district: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    },
    locale: "en",
    provider: "razorpay",
    providerOrderId: null,
    receiptNo: 12,
    paidAt: "2026-09-27T05:00:00.000Z",
    createdAt: "2026-09-27T04:58:00.000Z",
    updatedAt: "2026-09-27T05:00:00.000Z",
    expiresAt: "2026-09-27T05:28:00.000Z",
    ...over,
  }) as Order;

const PICKUP = {
  name: "Fewgrams Home",
  phone: "9000000000",
  address: "1 Main Rd",
  city: "Bengaluru",
  pincode: "560038",
};

describe("which parcels can be booked", () => {
  it("only a courier parcel of an order ready for delivery", () => {
    expect(canBook(order(), shipment())).toBe(true);
    expect(canBook(order({ status: "picked" }), shipment())).toBe(false);
    expect(canBook(order({ status: "out_for_delivery" }), shipment())).toBe(false);
    expect(canBook(order(), shipment({ method: "own_run", quote: null }))).toBe(false);
  });

  it("reads a parcel with a start mark and no tracking number as stuck", () => {
    expect(bookingState(shipment())).toBe("unbooked");
    expect(bookingState(shipment({ bookingStartedAt: "2026-09-27T06:00:00Z" }))).toBe("stuck");
    expect(bookingState(shipment({ trackingNumber: "AWB123456" }))).toBe("booked");
  });
});

describe("bookingInput — the parcel as a courier sees it", () => {
  it("carries only this parcel's lines, valued at what was paid for them", () => {
    const input = bookingInput(order(), 0, PICKUP, "2026-09-28");
    expect(input.items.map((i) => i.sku)).toEqual(["seed:radish", "tray:standard"]);
    expect(input.value).toBe(280);
    expect(input.reference).toBe("FG0000000001");
  });

  it("books at the quoted grams, in a box that bills at them", () => {
    const input = bookingInput(order(), 0, PICKUP, "2026-09-28");
    expect(input.grams).toBe(1800);
    const { length, width, height } = input.box;
    expect((length * width * height) / 5).toBeLessThanOrEqual(1800);
  });

  it("uses the district where an address has no city", () => {
    expect(bookingInput(order(), 0, PICKUP, "2026-09-28").drop.city).toBe("Pune");
  });

  it("gives an order's later parcels their own reference", () => {
    expect(parcelReference("FG0000000001", 0)).toBe("FG0000000001");
    expect(parcelReference("FG0000000001", 1)).toBe("FG0000000001-2");
  });
});

const INPUT: BookingInput = bookingInput(order(), 0, PICKUP, "2026-09-28");

describe("Delhivery book", () => {
  it("sends the form-encoded manifest, then the pickup, and returns the waybill", async () => {
    const calls = stubFetch(
      { body: { success: true, packages: [{ status: "Success", waybill: "1234567890123" }] } },
      { status: 201, body: { pickup_id: 42 } },
    );
    const r = await new DelhiveryProvider("t", "staging").book(INPUT);
    expect(r).toMatchObject({ trackingNumber: "1234567890123", pickupRequested: true, pickupError: null });
    expect(calls[0].url).toContain("/api/cmu/create.json");
    const data = JSON.parse(new URLSearchParams(calls[0].body).get("data")!);
    expect(data.pickup_location.name).toBe("Fewgrams Home");
    expect(data.shipments[0]).toMatchObject({
      order: "FG0000000001",
      payment_mode: "Prepaid",
      weight: "1800",
    });
    expect(JSON.parse(calls[1].body)).toMatchObject({
      pickup_date: "2026-09-28",
      pickup_location: "Fewgrams Home",
    });
  });

  it("treats a 200 whose package failed as a refusal, and throws", async () => {
    stubFetch({
      body: {
        success: false,
        rmk: "ClientWarehouse matching query does not exist",
        packages: [{ status: "Fail" }],
      },
    });
    await expect(new DelhiveryProvider("t", "staging").book(INPUT)).rejects.toThrow(/ClientWarehouse/);
  });

  it("keeps the waybill when only the pickup request fails", async () => {
    stubFetch(
      { body: { success: true, packages: [{ status: "Success", waybill: "1234567890123" }] } },
      { status: 400, body: { error: "Pickup already scheduled" } },
    );
    const r = await new DelhiveryProvider("t", "staging").book(INPUT);
    expect(r.trackingNumber).toBe("1234567890123");
    expect(r.pickupRequested).toBe(false);
    expect(r.pickupError).toMatch(/already scheduled/);
  });
});

describe("Ekart book", () => {
  it("creates with a PUT in grams and returns the tracking id; the pickup comes with it", async () => {
    const calls = stubFetch(
      { body: { access_token: "tok", expires_in: 3600 } },
      { body: { status: true, tracking_id: "500999A3408005" } },
    );
    const r = await new EkartProvider("c", "u", "p").book(INPUT);
    expect(r).toMatchObject({ trackingNumber: "500999A3408005", pickupRequested: true });
    expect(calls[1].method).toBe("PUT");
    const body = JSON.parse(calls[1].body);
    expect(body).toMatchObject({ weight: 1800, service: "SURFACE", preferred_dispatch_date: "2026-09-28" });
    expect(body.pickup_location).toEqual({ name: "Fewgrams Home" });
  });

  it("throws when no tracking id comes back", async () => {
    stubFetch(
      { body: { access_token: "tok", expires_in: 3600 } },
      { status: 400, body: { statusCode: 400, message: "Invalid pickup location" } },
    );
    await expect(new EkartProvider("c", "u", "p").book(INPUT)).rejects.toThrow(/Invalid pickup location/);
  });
});

describe("Shiprocket book", () => {
  const input = { ...INPUT, serviceId: "142" };

  it("creates the order, assigns the chosen carrier, requests the pickup and fetches a label", async () => {
    const calls = stubFetch(
      { body: { token: "tok" } },
      { body: { order_id: 1, shipment_id: 15151515, status: "NEW" } },
      { body: { awb_assign_status: 1, response: { data: { awb_code: "SR123456789" } } } },
      { body: { pickup_status: 1 } },
      { body: { label_created: 1, label_url: "https://example.test/label.pdf" } },
    );
    const r = await new ShiprocketProvider("e", "p").book(input);
    expect(r).toEqual({
      trackingNumber: "SR123456789",
      courierRef: "15151515",
      pickupRequested: true,
      pickupError: null,
      labelUrl: "https://example.test/label.pdf",
    });
    expect(JSON.parse(calls[1].body)).toMatchObject({
      order_id: "FG0000000001",
      weight: 1.8,
      pickup_location: "Fewgrams Home",
    });
    expect(JSON.parse(calls[2].body)).toEqual({ shipment_id: 15151515, courier_id: 142 });
  });

  it("throws when no courier is assigned — the low-wallet case", async () => {
    stubFetch(
      { body: { token: "tok" } },
      { body: { order_id: 1, shipment_id: 15151515 } },
      {
        body: {
          awb_assign_status: 0,
          response: { data: { awb_assign_error: "Insufficient wallet balance" } },
        },
      },
    );
    await expect(new ShiprocketProvider("e", "p").book(input)).rejects.toThrow(/wallet/);
  });

  it("on a retry, carries on with the order the first attempt made instead of making another", async () => {
    const calls = stubFetch(
      { body: { token: "tok" } },
      { status: 422, body: { message: "Oops! Invalid Data.", errors: { order_id: ["already exists"] } } },
      { body: { data: [{ channel_order_id: "FG0000000001", shipments: [{ id: 15151515, awb: null }] }] } },
      { body: { awb_assign_status: 1, response: { data: { awb_code: "SR123456789" } } } },
      { body: { pickup_status: 1 } },
      { body: { label_created: 0 } },
    );
    const r = await new ShiprocketProvider("e", "p").book(input);
    expect(r.trackingNumber).toBe("SR123456789");
    expect(calls[2].url).toContain("search=FG0000000001");
    expect(calls.filter((c) => c.url.includes("create/adhoc"))).toHaveLength(1);
  });
});

describe("Velocity book", () => {
  const input = { ...INPUT, serviceId: "CARADCBTZMQMM" };
  const warehouses = () => vi.stubEnv("VELOCITY_WAREHOUSES", '{"Fewgrams Home":"WH66DU"}');

  it("books in one call with the chosen carrier and the pickup's warehouse", async () => {
    warehouses();
    const calls = stubFetch({
      body: {
        status: 1,
        payload: {
          order_created: 1,
          awb_generated: 1,
          pickup_generated: 1,
          shipment_id: "SHIHB0BMT4DYM",
          awb_code: "34812010700125",
          label_url: "https://example.test/label.pdf",
        },
      },
    });
    const r = await new VelocityProvider("key").book(input);
    expect(r).toEqual({
      trackingNumber: "34812010700125",
      courierRef: "SHIHB0BMT4DYM",
      pickupRequested: true,
      pickupError: null,
      labelUrl: "https://example.test/label.pdf",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://shazam.velocity.in/custom/api/v1/forward-order-orchestration");
    expect(JSON.parse(calls[0].body)).toMatchObject({
      order_id: "FG0000000001",
      carrier_id: "CARADCBTZMQMM",
      payment_method: "PREPAID",
      cod_collectible: 0,
      weight: 1.8,
      pickup_location: "Fewgrams Home",
      warehouse_id: "WH66DU",
    });
  });

  it("refuses before calling Velocity when the pickup has no warehouse id", async () => {
    vi.stubEnv("VELOCITY_WAREHOUSES", "");
    const calls = stubFetch();
    await expect(new VelocityProvider("key").book(input)).rejects.toThrow(/VELOCITY_WAREHOUSES/);
    expect(calls).toHaveLength(0);
  });

  it("throws when the order is refused and no earlier attempt shipped it", async () => {
    warehouses();
    stubFetch(
      { status: 422, body: { status: "ERROR", message: "Insufficient wallet balance" } },
      { body: { data: [] } },
    );
    await expect(new VelocityProvider("key").book(input)).rejects.toThrow(/wallet/);
  });

  it("on a retry, returns the AWB the first attempt got instead of booking again", async () => {
    warehouses();
    const calls = stubFetch(
      { status: 422, body: { status: "ERROR", message: "Order id already exists" } },
      {
        body: {
          data: [
            { attributes: { tracking_number: "34812010700125", order: { external_id: "FG0000000001" } } },
          ],
        },
      },
    );
    const r = await new VelocityProvider("key").book(input);
    expect(r.trackingNumber).toBe("34812010700125");
    expect(JSON.parse(calls[1].body)).toMatchObject({ search: "FG0000000001" });
    expect(calls.filter((c) => c.url.includes("orchestration"))).toHaveLength(1);
  });
});

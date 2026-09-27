import { brand } from "@/lib/brand";
import type {
  BookingInput,
  BookingResult,
  CourierOption,
  DeliveryEstimate,
  Quote,
  QuoteInput,
  Serviceability,
  ShippingProvider,
  ShippingSpeed,
} from "./provider";

/**
 * Delhivery (Delhivery One) adapter — SPEC §7.
 *
 * Plain `fetch` against the Express API, as for Cashfree. Contract checked
 * against one.delhivery.com/developer-portal and against live calls on
 * 23 Sep 2026:
 *
 * - `GET /c/api/pin-codes/json/?filter_codes=<pin>` — an empty
 *   `delivery_codes` list means the PIN is not served.
 * - `GET /api/kinko/v1/invoice/charges/.json` — an array of one quote;
 *   `total_amount` includes GST. Delhivery calls it approximate, because the
 *   final charge follows its own weighing at the hub.
 * - `GET /api/dc/expected_tat` — `expected_pickup_date` must be
 *   `YYYY-MM-DD HH:MM`. The format shown in the portal's example is rejected
 *   by the live API with a 400.
 *
 * **Staging and production take different tokens.** A production token is
 * refused by staging with a 401, so a mismatch between `DELHIVERY_ENV` and
 * the token fails loudly rather than quoting from the wrong system.
 *
 * Booking (27 Sep 2026, `book`), from the Express API reference
 * (delhivery-express-api-doc.readme.io):
 *
 * - `POST /api/cmu/create.json` — the body is the literal form string
 *   `format=json&data=<JSON>`. **A refusal still answers 200**: success is
 *   `packages[0].status === "Success"`, and the AWB is `packages[0].waybill`.
 *   `pickup_location.name` must match a warehouse registered on the account
 *   exactly ("ClientWarehouse matching query does not exist" otherwise).
 * - `POST /fm/request/new/` — the pickup, JSON, 201 on success. One open
 *   pickup per warehouse at a time, so a second parcel on the same day is
 *   refused here while already covered by the first; that is reported, not
 *   raised.
 */

const HOSTS = {
  staging: "https://staging-express.delhivery.com",
  production: "https://track.delhivery.com",
} as const;

/** A quote sits on the checkout path; a courier that does not answer in this
 *  long is treated as down rather than left to hang the page. */
const TIMEOUT_MS = 10_000;

const MODE: Record<ShippingSpeed, "S" | "E"> = { surface: "S", express: "E" };

/** Inside Delhivery's working hours; the day is the operator's pick. */
const PICKUP_TIME = "11:00:00";

type Created = {
  success?: boolean;
  rmk?: string;
  packages?: Array<{ status?: string; waybill?: string; remarks?: string[] | string }>;
};

type PinCodes = {
  delivery_codes?: Array<{
    postal_code?: { pin?: number | string; pre_paid?: string; pickup?: string; is_oda?: string };
  }>;
};

type Charges = Array<{
  total_amount?: number;
  gross_amount?: number;
  charged_weight?: number;
  zone?: string;
}>;

type Tat = { success?: boolean; msg?: string; data?: { tat?: number; expected_delivery_date?: string } | "" };

/** `YYYY-MM-DD HH:MM` in IST, the only date format `expected_tat` accepts. */
export function delhiveryPickupDate(at: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const PIN = /^[1-9]\d{5}$/;

function assertPin(pin: string): void {
  if (!PIN.test(pin)) throw new Error(`Not a PIN code: ${JSON.stringify(pin)}`);
}

export class DelhiveryProvider implements ShippingProvider {
  readonly name = "delhivery" as const;

  constructor(
    private readonly token: string,
    readonly mode: "staging" | "production",
  ) {}

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = `${HOSTS[this.mode]}${path}?${new URLSearchParams(query)}`;
    const res = await fetch(url, {
      headers: { authorization: `Token ${this.token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      /* The token is in a header and never echoed back, so the body is safe
         to log. It names the failing field. */
      const detail = await res.text().catch(() => "");
      throw new Error(`Delhivery GET ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Create the shipment, then ask for its pickup. Throws only while no
   * waybill exists; a refused pickup comes back in the result.
   */
  async book(input: BookingInput): Promise<BookingResult> {
    assertPin(input.pickup.pincode);
    assertPin(input.drop.pincode);
    const gstin = process.env.SELLER_GSTIN;
    const data = {
      pickup_location: { name: input.pickup.name },
      shipments: [
        {
          order: input.reference,
          order_date: `${delhiveryPickupDate(new Date(input.orderDate))}:00`,
          name: input.drop.name,
          add: [input.drop.line1, input.drop.line2, input.drop.landmark].filter(Boolean).join(", "),
          pin: input.drop.pincode,
          city: input.drop.city,
          state: input.drop.state,
          country: "India",
          phone: input.drop.phone,
          payment_mode: "Prepaid",
          cod_amount: 0,
          total_amount: input.value,
          products_desc: input.items.map((i) => i.name).join(", ").slice(0, 200),
          quantity: String(input.items.reduce((n, i) => n + i.units, 0)),
          seller_name: brand.name,
          ...(gstin ? { seller_gst_tin: gstin } : {}),
          weight: String(input.grams),
          shipment_length: input.box.length,
          shipment_width: input.box.width,
          shipment_height: input.box.height,
          shipping_mode: input.speed === "express" ? "Express" : "Surface",
        },
      ],
    };
    const res = await fetch(`${HOSTS[this.mode]}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        authorization: `Token ${this.token}`,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ format: "json", data: JSON.stringify(data) }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Created;
    const pkg = body.packages?.[0];
    if (!res.ok || pkg?.status !== "Success" || !pkg.waybill) {
      const why = [pkg?.remarks, body.rmk].flat().filter(Boolean).join("; ");
      throw new Error(`Delhivery refused the shipment: ${res.status} ${why || "no reason given"}`.slice(0, 500));
    }

    /* The waybill exists: from here nothing may throw. */
    let pickupError: string | null = null;
    try {
      const pick = await fetch(`${HOSTS[this.mode]}/fm/request/new/`, {
        method: "POST",
        headers: {
          authorization: `Token ${this.token}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          pickup_time: PICKUP_TIME,
          pickup_date: input.pickupDate,
          pickup_location: input.pickup.name,
          expected_package_count: 1,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!pick.ok) pickupError = `${pick.status} ${(await pick.text().catch(() => "")).slice(0, 300)}`;
    } catch (e) {
      pickupError = e instanceof Error ? e.message : String(e);
    }
    return {
      trackingNumber: pkg.waybill,
      courierRef: null,
      pickupRequested: pickupError === null,
      pickupError,
      labelUrl: null,
    };
  }

  async serviceability(pincode: string): Promise<Serviceability | null> {
    assertPin(pincode);
    const res = await this.get<PinCodes>("/c/api/pin-codes/json/", { filter_codes: pincode });
    const row = res.delivery_codes?.[0]?.postal_code;
    if (!row) return null;
    return {
      pincode,
      prepaid: row.pre_paid === "Y",
      pickup: row.pickup === "Y",
      remote: row.is_oda === "Y",
    };
  }

  async quote(input: QuoteInput): Promise<Quote> {
    assertPin(input.originPin);
    assertPin(input.destinationPin);
    if (!Number.isInteger(input.grams) || input.grams <= 0) {
      throw new Error(`Chargeable grams must be a positive integer, got ${input.grams}`);
    }
    const res = await this.get<Charges>("/api/kinko/v1/invoice/charges/.json", {
      md: MODE[input.speed],
      ss: "Delivered",
      o_pin: input.originPin,
      d_pin: input.destinationPin,
      cgm: String(input.grams),
      pt: "Pre-paid",
    });
    const q = Array.isArray(res) ? res[0] : undefined;
    /* A quote with no total is a refusal, not a free delivery. */
    if (!q || typeof q.total_amount !== "number" || !(q.total_amount > 0)) {
      throw new Error(`Delhivery returned no price for ${input.originPin} → ${input.destinationPin}`);
    }
    return {
      total: q.total_amount,
      beforeTax: q.gross_amount ?? q.total_amount,
      chargedGrams: q.charged_weight ?? input.grams,
      zone: q.zone ?? "",
    };
  }

  /** Delhivery carries its own parcels, so one option: the quote itself,
   *  with its transit time. A price with no transit time still stands — the
   *  date is the one thing checkout can do without — so a failed TAT call
   *  leaves `days` null rather than dropping Delhivery from the comparison. */
  async options(input: QuoteInput): Promise<CourierOption[]> {
    const [q, tat] = await Promise.all([
      this.quote(input),
      this.expectedDelivery({ ...input, pickupAt: new Date() }).catch(() => null),
    ]);
    return [
      {
        id: "delhivery",
        courier: "delhivery",
        carrier: null,
        serviceId: null,
        total: q.total,
        beforeTax: q.beforeTax,
        chargedGrams: q.chargedGrams,
        zone: q.zone,
        days: tat && tat.days > 0 ? tat.days : null,
      },
    ];
  }

  async expectedDelivery(input: {
    originPin: string;
    destinationPin: string;
    speed: ShippingSpeed;
    pickupAt: Date;
  }): Promise<DeliveryEstimate> {
    assertPin(input.originPin);
    assertPin(input.destinationPin);
    const res = await this.get<Tat>("/api/dc/expected_tat", {
      origin_pin: input.originPin,
      destination_pin: input.destinationPin,
      mot: MODE[input.speed],
      pdt: "B2C",
      expected_pickup_date: delhiveryPickupDate(input.pickupAt),
    });
    const data = res.data || undefined;
    if (!res.success || typeof data?.tat !== "number" || !data.expected_delivery_date) {
      throw new Error(`Delhivery gave no delivery estimate: ${res.msg ?? "no message"}`);
    }
    return { days: data.tat, date: data.expected_delivery_date };
  }
}

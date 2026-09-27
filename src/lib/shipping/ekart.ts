import { brand } from "@/lib/brand";
import type { BookingInput, BookingResult, CourierOption, QuoteInput, ShippingProvider } from "./provider";
import { boxForGrams } from "./weight";

/**
 * Ekart (Ekart Elite, app.elite.ekartlogistics.in) — SPEC §7.
 *
 * Contract checked against live calls on 24 Sep 2026:
 *
 * - `POST /integrations/v2/auth/token/{client_id}` with `{ username,
 *   password }` returns `{ access_token, expires_in }`. Cached per process
 *   until shortly before it lapses.
 * - `POST /data/v3/serviceability` answers price **and transit time** in one
 *   call: an array of one, with `tat: { min, max }` in days and
 *   `forwardDeliveredCharges` in strings — `totalForwardDeliveredEstimate`
 *   (GST included) and `deliveredTotalTax`. Weight is grams, as a string.
 *   It replaced `/data/pricing/estimate`, which has no transit time.
 * - **`tat.max` is the days used**, so the date promised is the courier's
 *   later one, never its best case.
 *
 * Booking (27 Sep 2026, `book`), from the Elite OpenAPI spec v3.8.10
 * (app.elite.ekartlogistics.in/api/docs):
 *
 * - **`PUT`** `/api/v1/package/create` — weight in integer grams, the box in
 *   integer cm, `service` required. Pickup and return addresses are the
 *   **alias** registered on the account (`{ name }`). Answers `tracking_id`.
 * - There is no separate pickup call: creating the shipment books its pickup,
 *   and `preferred_dispatch_date` says which day.
 *
 * The account is on the Flat plan (₹90 to 2 kg anywhere, ₹35 a kg after,
 * RTO free), so the estimate is the plan's price and the declared value
 * only sets liability.
 */

const HOST = "https://app.elite.ekartlogistics.in";
const TIMEOUT_MS = 10_000;
/** Refresh this long before the token says it expires. */
const REFRESH_MARGIN_MS = 5 * 60_000;

type Token = { access_token?: string; expires_in?: number };
type Created = { status?: boolean; remark?: string; tracking_id?: string; message?: string; description?: string };
type Serviceable = {
  tat?: { min?: number; max?: number };
  forwardDeliveredCharges?: { deliveredTotalTax?: string; totalForwardDeliveredEstimate?: string };
};

export class EkartProvider implements ShippingProvider {
  readonly name = "ekart" as const;
  readonly mode = "production" as const;
  private token: { value: string; until: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private async bearer(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const res = await fetch(`${HOST}/integrations/v2/auth/token/${encodeURIComponent(this.clientId)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Token;
    if (!res.ok || !body.access_token) throw new Error(`Ekart sign-in failed: ${res.status}`);
    const life = (body.expires_in ?? 3600) * 1000;
    this.token = { value: body.access_token, until: Date.now() + life - REFRESH_MARGIN_MS };
    return body.access_token;
  }

  async options(input: QuoteInput): Promise<CourierOption[]> {
    const box = boxForGrams(input.grams);
    const res = await fetch(`${HOST}/data/v3/serviceability`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${await this.bearer()}`,
      },
      body: JSON.stringify({
        pickupPincode: input.originPin,
        dropPincode: input.destinationPin,
        weight: String(input.grams),
        length: String(box.length),
        width: String(box.width),
        height: String(box.height),
        paymentType: "Prepaid",
        serviceType: input.speed === "express" ? "EXPRESS" : "SURFACE",
        invoiceAmount: String(input.value ?? 0),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 401) this.token = null;
      throw new Error(`Ekart serviceability failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    const [e] = ((await res.json()) as Serviceable[] | null) ?? [];
    const total = Number(e?.forwardDeliveredCharges?.totalForwardDeliveredEstimate);
    /* A quote with no total is a refusal, not a free delivery. */
    if (!(total > 0)) throw new Error(`Ekart returned no price for ${input.originPin} → ${input.destinationPin}`);
    const days = Number(e?.tat?.max);
    return [
      {
        id: "ekart",
        courier: "ekart",
        carrier: null,
        serviceId: null,
        total,
        beforeTax: total - (Number(e?.forwardDeliveredCharges?.deliveredTotalTax) || 0),
        chargedGrams: input.grams,
        zone: "",
        days: Number.isFinite(days) && days > 0 ? days : null,
      },
    ];
  }

  /** One call: the shipment and its pickup together. Throws when Ekart
   *  answers with no tracking id, which means nothing was created. */
  async book(input: BookingInput): Promise<BookingResult> {
    const gstin = process.env.SELLER_GSTIN;
    const units = input.items.reduce((n, i) => n + i.units, 0);
    const invoice = input.reference;
    const res = await fetch(`${HOST}/api/v1/package/create`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${await this.bearer()}`,
      },
      body: JSON.stringify({
        order_number: input.reference,
        invoice_number: invoice,
        invoice_date: input.orderDate.slice(0, 10),
        seller_name: brand.name,
        seller_address: `${input.pickup.address}, ${input.pickup.city} ${input.pickup.pincode}`,
        ...(gstin ? { seller_gst_tin: gstin } : {}),
        consignee_name: input.drop.name,
        consignee_gst_amount: 0,
        products_desc: input.items.map((i) => i.name).join(", ").slice(0, 200),
        payment_mode: "Prepaid",
        cod_amount: 0,
        total_amount: input.value,
        taxable_amount: input.value,
        tax_value: 0,
        commodity_value: String(input.value),
        quantity: units,
        weight: Math.ceil(input.grams),
        length: Math.ceil(input.box.length),
        width: Math.ceil(input.box.width),
        height: Math.ceil(input.box.height),
        service: input.speed === "express" ? "EXPRESS" : "SURFACE",
        drop_location: {
          name: input.drop.name,
          address: [input.drop.line1, input.drop.line2, input.drop.landmark].filter(Boolean).join(", "),
          city: input.drop.city,
          state: input.drop.state,
          country: "India",
          phone: Number(input.drop.phone.replace(/\D/g, "").slice(-10)),
          pin: Number(input.drop.pincode),
        },
        pickup_location: { name: input.pickup.name },
        return_location: { name: input.pickup.name },
        preferred_dispatch_date: input.pickupDate,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Created;
    if (!res.ok || !body.tracking_id) {
      if (res.status === 401) this.token = null;
      const why = body.description || body.message || body.remark || "no reason given";
      throw new Error(`Ekart refused the shipment: ${res.status} ${why}`.slice(0, 500));
    }
    return {
      trackingNumber: body.tracking_id,
      courierRef: null,
      pickupRequested: true,
      pickupError: null,
      labelUrl: null,
    };
  }
}

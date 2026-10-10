import { contact } from "@/lib/content/contact";
import type { BookingInput, BookingResult, CourierOption, QuoteInput, ShippingProvider } from "./provider";
import { boxForGrams } from "./weight";

/**
 * Shiprocket — SPEC §7. An aggregator: one call returns every carrier it can
 * hand the parcel to, each with its own price and days on the road.
 *
 * Contract checked against live calls on 24 Sep 2026:
 *
 * - `POST /v1/external/auth/login` with the **API user** (Settings → API
 *   Users, a different email from the account's own) returns a token valid
 *   for ten days. Cached per process for nine.
 * - `GET /v1/external/courier/serviceability/` with weight in **kg** and the
 *   box in cm returns `data.available_courier_companies[]`, each with `rate`,
 *   `courier_name`, `courier_company_id`, `estimated_delivery_days` and
 *   `blocked`.
 *
 * **`rate` is taken as GST-inclusive.** The response has no tax field, and
 * Shiprocket prices its panel inclusive; its Delhivery rate also lands within
 * 2% of Delhivery's own GST-inclusive quote, where an exclusive rate would put
 * it 20% above. Confirm against the first invoice — if it turns out to be
 * exclusive, `GST_INCLUSIVE` flips and every Shiprocket option gets dearer.
 *
 * Booking (27 Sep 2026, `book`), from the official Postman collection
 * (apidocs.shiprocket.in) — three calls, then a label:
 *
 * 1. `POST /v1/external/orders/create/adhoc` — weight in **kg**, box in cm;
 *    `pickup_location` is the nickname registered on the account. Answers
 *    `shipment_id`. An `order_id` can never be reused, so a retry after a
 *    later step failed finds the order it already made (`findShipment`)
 *    instead of making a second.
 * 2. `POST /v1/external/courier/assign/awb` with the carrier the customer
 *    chose (`serviceId`). This is the step that spends wallet money; anything
 *    but `awb_assign_status: 1` is a refusal.
 * 3. `POST /v1/external/courier/generate/pickup` — reported, never raised,
 *    once the AWB exists.
 *
 * **Only the cheapest carrier is kept** (the owner, 24 Sep 2026). Shiprocket
 * is one partner in the comparison, beside Delhivery and Ekart, not a list of
 * its own; a customer choosing between eleven prices is not helped by the
 * ninth.
 */

const HOST = "https://apiv2.shiprocket.in";
const TIMEOUT_MS = 10_000;
const TOKEN_LIFE_MS = 9 * 24 * 60 * 60_000;
const GST_INCLUSIVE = true;
const GST = 0.18;
/** Carriers kept per scan, cheapest first. */
export const SHIPROCKET_MAX_OPTIONS = 1;

type Envelope = { message?: string; errors?: Record<string, string[]>; status_code?: number };
type AdhocCreated = Envelope & { order_id?: number; shipment_id?: number; awb_code?: string | null };
type AwbAssigned = Envelope & {
  awb_assign_status?: number;
  response?: { data?: { awb_code?: string; awb_assign_error?: string } };
};
type OrderList = {
  data?: Array<{ channel_order_id?: string; shipments?: Array<{ id?: number; awb?: string | null }> }>;
};

/** The first thing Shiprocket said was wrong, in its own words. */
function reason(body: Envelope): string {
  const field = body.errors && Object.values(body.errors).flat()[0];
  return field || body.message || "no reason given";
}

type Company = {
  courier_company_id?: number;
  courier_name?: string;
  rate?: number | string;
  estimated_delivery_days?: number | string;
  charge_weight?: number;
  zone?: string;
  blocked?: number;
};

/**
 * "Xpressbees Surface 2kg" → "Xpressbees". Shiprocket names a carrier by its
 * service and weight band; a customer is choosing a carrier.
 */
export function carrierName(courierName: string): string {
  const cut = courierName
    .replace(/\b(surface|air|heavy|express|lite|premium|reverse|standard)\b.*$/i, "")
    .replace(/\b\d+(\.\d+)?\s*(kg|kgs|g)\b.*$/i, "")
    .trim();
  return cut || courierName.trim();
}

export class ShiprocketProvider implements ShippingProvider {
  readonly name = "shiprocket" as const;
  readonly mode = "production" as const;
  private token: { value: string; until: number } | null = null;

  constructor(
    private readonly email: string,
    private readonly password: string,
  ) {}

  private async bearer(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const res = await fetch(`${HOST}/v1/external/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string };
    if (!res.ok || !body.token) throw new Error(`Shiprocket sign-in failed: ${res.status}`);
    this.token = { value: body.token, until: Date.now() + TOKEN_LIFE_MS };
    return body.token;
  }

  async options(input: QuoteInput): Promise<CourierOption[]> {
    const box = boxForGrams(input.grams);
    const query = new URLSearchParams({
      pickup_postcode: input.originPin,
      delivery_postcode: input.destinationPin,
      cod: "0",
      weight: String(input.grams / 1000),
      length: String(box.length),
      breadth: String(box.width),
      height: String(box.height),
      declared_value: String(input.value ?? 0),
    });
    const res = await fetch(`${HOST}/v1/external/courier/serviceability/?${query}`, {
      headers: { accept: "application/json", authorization: `Bearer ${await this.bearer()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 401) this.token = null;
      throw new Error(`Shiprocket serviceability failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { data?: { available_courier_companies?: Company[] } };
    const priced = (body.data?.available_courier_companies ?? [])
      .filter((c) => c.blocked !== 1 && c.courier_company_id !== undefined && c.courier_name)
      .map((c): CourierOption | null => {
        const rate = Number(c.rate);
        if (!(rate > 0)) return null;
        const total = GST_INCLUSIVE ? rate : rate * (1 + GST);
        const days = Number(c.estimated_delivery_days);
        return {
          id: `shiprocket:${c.courier_company_id}`,
          courier: "shiprocket",
          carrier: carrierName(c.courier_name!),
          serviceId: String(c.courier_company_id),
          total: Math.round(total * 100) / 100,
          beforeTax: Math.round((total / (1 + GST)) * 100) / 100,
          chargedGrams: Math.ceil((c.charge_weight ?? input.grams / 1000) * 1000),
          zone: c.zone ?? "",
          days: Number.isFinite(days) && days > 0 ? days : null,
        };
      })
      .filter((o): o is CourierOption => o !== null)
      .sort((a, b) => a.total - b.total);

    /* One row per carrier: Shiprocket lists "Delhivery Surface" and
       "Delhivery Surface 2 Kgs" separately, and only the cheaper is a choice. */
    const seen = new Set<string>();
    const kept = priced.filter((o) => {
      const k = o.carrier!.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (kept.length === 0) {
      throw new Error(`Shiprocket offered no carrier for ${input.originPin} → ${input.destinationPin}`);
    }
    return kept.slice(0, SHIPROCKET_MAX_OPTIONS);
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; body: T }> {
    const res = await fetch(`${HOST}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${await this.bearer()}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) this.token = null;
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T };
  }

  /** The shipment an earlier attempt already created for `reference`, with
   *  its AWB if one was assigned. */
  private async findShipment(reference: string): Promise<{ id: number; awb: string | null } | null> {
    const { body } = await this.call<OrderList>(
      "GET",
      `/v1/external/orders?${new URLSearchParams({ search: reference })}`,
    );
    const order = body.data?.find((o) => o.channel_order_id === reference);
    const shipment = order?.shipments?.[0];
    return shipment?.id ? { id: shipment.id, awb: shipment.awb || null } : null;
  }

  async book(input: BookingInput): Promise<BookingResult> {
    const created = await this.call<AdhocCreated>("POST", "/v1/external/orders/create/adhoc", {
      order_id: input.reference,
      order_date: input.orderDate.slice(0, 16).replace("T", " "),
      pickup_location: input.pickup.name,
      billing_customer_name: input.drop.name,
      billing_last_name: "",
      billing_address: input.drop.line1,
      ...(input.drop.line2 || input.drop.landmark
        ? { billing_address_2: [input.drop.line2, input.drop.landmark].filter(Boolean).join(", ") }
        : {}),
      billing_city: input.drop.city,
      billing_pincode: input.drop.pincode,
      billing_state: input.drop.state,
      billing_country: "India",
      /* Required. A magic-link or Google sign-in always has an email; the
         fallback is our own care inbox, never an invented address. */
      billing_email: input.drop.email ?? contact.email,
      billing_phone: input.drop.phone.replace(/\D/g, "").slice(-10),
      shipping_is_billing: true,
      order_items: input.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        selling_price: i.unitPrice,
      })),
      payment_method: "Prepaid",
      sub_total: input.value,
      length: input.box.length,
      breadth: input.box.width,
      height: input.box.height,
      weight: input.grams / 1000,
    });

    let shipment: { id: number; awb: string | null } | null = created.body.shipment_id
      ? { id: created.body.shipment_id, awb: created.body.awb_code || null }
      : null;
    /* A 422 on `order_id` is an earlier attempt's order: carry on with it. */
    if (!shipment && created.status === 422 && created.body.errors?.order_id) {
      shipment = await this.findShipment(input.reference);
    }
    if (!shipment) {
      throw new Error(
        `Shiprocket refused the order: ${created.status} ${reason(created.body)}`.slice(0, 500),
      );
    }

    let awb = shipment.awb;
    if (!awb) {
      const assigned = await this.call<AwbAssigned>("POST", "/v1/external/courier/assign/awb", {
        shipment_id: shipment.id,
        ...(input.serviceId ? { courier_id: Number(input.serviceId) } : {}),
      });
      awb = assigned.body.awb_assign_status === 1 ? assigned.body.response?.data?.awb_code || null : null;
      if (!awb) {
        /* The order stays in Shiprocket unshipped and unpaid; the next
           attempt finds it rather than making another. */
        const why = assigned.body.response?.data?.awb_assign_error || reason(assigned.body);
        throw new Error(`Shiprocket could not assign a courier: ${assigned.status} ${why}`.slice(0, 500));
      }
    }

    /* The AWB exists: from here nothing may throw. */
    let pickupError: string | null = null;
    let labelUrl: string | null = null;
    try {
      const pick = await this.call<Envelope & { pickup_status?: number }>(
        "POST",
        "/v1/external/courier/generate/pickup",
        {
          shipment_id: [shipment.id],
          pickup_date: [input.pickupDate],
        },
      );
      if (pick.body.pickup_status !== 1) pickupError = `${pick.status} ${reason(pick.body)}`;
    } catch (e) {
      pickupError = e instanceof Error ? e.message : String(e);
    }
    try {
      const label = await this.call<{ label_created?: number; label_url?: string }>(
        "POST",
        "/v1/external/courier/generate/label",
        { shipment_id: [shipment.id] },
      );
      if (label.body.label_created === 1 && label.body.label_url) labelUrl = label.body.label_url;
    } catch {
      /* The label can be printed from the dashboard; not worth a failure. */
    }
    return {
      trackingNumber: awb,
      courierRef: String(shipment.id),
      pickupRequested: pickupError === null,
      pickupError,
      labelUrl,
    };
  }
}

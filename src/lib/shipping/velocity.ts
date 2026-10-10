import { contact } from "@/lib/content/contact";
import type { BookingInput, BookingResult, CourierOption, QuoteInput, ShippingProvider } from "./provider";
import { carrierName } from "./shiprocket";
import { boxForGrams } from "./weight";

/**
 * Velocity Shipping — SPEC §7 (the owner, 1 Oct 2026). An aggregator like
 * Shiprocket: one call returns every carrier it can hand the parcel to.
 * Added after a 380-quote comparison (19 items × 20 cities from our pickup)
 * found it cheapest in 346 — mostly through Xpressbees.
 *
 * Contract checked against live calls on 1 Oct 2026 (docs:
 * velocity.in/shipping-faq/api):
 *
 * - **Auth is a long-lived API key**, sent as `Authorization: Bearer <key>`
 *   (dashboard → Settings → API Keys, up to 365 days). No sign-in call, so
 *   nothing here can lock the account by retrying a bad password.
 * - `POST /custom/api/v1/rates` with weight in **grams** and the box in cm
 *   returns `result.serviceable_couriers[]`, each with `carrier_id`,
 *   `carrier_name`, `service_level` (`road` | `air`), `charges.
 *   total_forward_charges`, `platform_fee` and `expected_delivery.{pickup,
 *   delivery}.datetime`. It bills the larger of dead and volumetric weight
 *   (`shipment_details.applicable_weight`), so `boxForGrams` prices the grams
 *   we send, as with the others.
 *
 * **Prices are taken as before GST, and 18% is added.** Neither the response
 * nor the docs say; the finance API reports every wallet debit both with and
 * without GST. Charging the customer GST we turn out not to owe is the
 * recoverable mistake; under-charging is not. Confirm against the first
 * wallet debit — if Velocity's figure already includes GST, flip
 * `GST_INCLUSIVE` and every Velocity option gets 15% cheaper.
 *
 * Booking (`book`) is one call, `POST /custom/api/v1/forward-order-
 * orchestration`: it creates the order, assigns the carrier the customer chose
 * (`carrier_id`), generates the AWB and label and requests a pickup. It needs
 * the pickup's Velocity **warehouse id** as well as its name, and Velocity has
 * no call that lists warehouses — so the ids are set per pickup name in
 * `VELOCITY_WAREHOUSES`, a JSON object (`{"Fewgrams Home":"WH66DU"}`), copied
 * from the dashboard once each pickup is registered there. Velocity sets the
 * pickup day itself; there is no field for ours.
 *
 * **Only the cheapest road carrier is kept**, the Shiprocket rule (the owner,
 * 24 Sep 2026): Velocity is one partner in the comparison, not a list.
 */

const HOST = "https://shazam.velocity.in";
const TIMEOUT_MS = 10_000;
const GST_INCLUSIVE = false;
const GST = 0.18;
const DAY_MS = 86_400_000;
/** Carriers kept per scan, cheapest first. */
export const VELOCITY_MAX_OPTIONS = 1;

type When = { datetime?: string } | string | undefined;
type Courier = {
  carrier_id?: string;
  carrier_name?: string;
  service_level?: string;
  status?: boolean | string;
  expected_delivery?: { pickup?: When; delivery?: When };
  charges?: { total_forward_charges?: number | string };
  platform_fee?: number | string;
};
type Rates = {
  status?: string;
  message?: string;
  result?: {
    serviceable_couriers?: Courier[];
    shipment_details?: { zone?: string; applicable_weight?: number };
  };
};
type Orchestrated = {
  status?: number | string;
  message?: string;
  payload?: {
    shipment_id?: string;
    awb_code?: string | null;
    awb_generated?: number;
    pickup_generated?: number;
    label_url?: string | null;
  };
};
type ShipmentList = {
  data?: Array<{
    attributes?: { tracking_number?: string | null; order?: { external_id?: string; display_id?: string } };
  }>;
};

const at = (w: When) => Date.parse(typeof w === "string" ? w : (w?.datetime ?? ""));

/** Days on the road: pickup to delivery, as Velocity estimates them. */
function roadDays(c: Courier): number | null {
  const days = Math.round((at(c.expected_delivery?.delivery) - at(c.expected_delivery?.pickup)) / DAY_MS);
  return Number.isFinite(days) && days > 0 ? days : null;
}

/** The warehouse id registered for this pickup name, or null. */
export function warehouseFor(pickupName: string, raw = process.env.VELOCITY_WAREHOUSES): string | null {
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const id = map[pickupName];
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

export class VelocityProvider implements ShippingProvider {
  readonly name = "velocity" as const;
  readonly mode = "production" as const;

  constructor(private readonly apiKey: string) {}

  private async call<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: T }> {
    const res = await fetch(`${HOST}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as T };
  }

  async options(input: QuoteInput): Promise<CourierOption[]> {
    const box = boxForGrams(input.grams);
    const { ok, status, body } = await this.call<Rates>("/custom/api/v1/rates", {
      journey_type: "forward",
      origin_pincode: input.originPin,
      destination_pincode: input.destinationPin,
      dead_weight: input.grams,
      length: box.length,
      width: box.width,
      height: box.height,
      payment_method: "prepaid",
    });
    if (!ok || body.status !== "SUCCESS") {
      throw new Error(
        `Velocity rates failed: ${status} ${(body.message ?? JSON.stringify(body)).slice(0, 300)}`,
      );
    }
    const chargedGrams = Math.ceil(body.result?.shipment_details?.applicable_weight ?? input.grams);
    const zone = body.result?.shipment_details?.zone ?? "";
    const priced = (body.result?.serviceable_couriers ?? [])
      /* Surface only, as checkout asks every courier for (`speed: "surface"`). */
      .filter((c) => c.service_level === "road" && c.status !== false && c.carrier_id && c.carrier_name)
      .map((c): CourierOption | null => {
        const rate = Number(c.charges?.total_forward_charges) + Number(c.platform_fee ?? 0);
        if (!(rate > 0)) return null;
        const total = GST_INCLUSIVE ? rate : rate * (1 + GST);
        return {
          id: `velocity:${c.carrier_id}`,
          courier: "velocity",
          carrier: carrierName(c.carrier_name!),
          serviceId: c.carrier_id!,
          total: Math.round(total * 100) / 100,
          beforeTax: Math.round((total / (1 + GST)) * 100) / 100,
          chargedGrams,
          zone,
          days: roadDays(c),
        };
      })
      .filter((o): o is CourierOption => o !== null)
      .sort((a, b) => a.total - b.total);
    if (priced.length === 0) {
      throw new Error(`Velocity offered no carrier for ${input.originPin} → ${input.destinationPin}`);
    }
    return priced.slice(0, VELOCITY_MAX_OPTIONS);
  }

  /** The AWB an earlier attempt already got for `reference`, if any. */
  private async findAwb(reference: string): Promise<string | null> {
    const { body } = await this.call<ShipmentList>("/custom/api/v1/shipments", {
      page: 1,
      per_page: 20,
      search: reference,
    });
    const hit = body.data?.find(
      (s) => s.attributes?.order?.external_id === reference || s.attributes?.order?.display_id === reference,
    );
    return hit?.attributes?.tracking_number || null;
  }

  async book(input: BookingInput): Promise<BookingResult> {
    const warehouse = warehouseFor(input.pickup.name);
    if (!warehouse) {
      throw new Error(
        `No Velocity warehouse id for pickup "${input.pickup.name}" — add it to VELOCITY_WAREHOUSES`,
      );
    }
    const created = await this.call<Orchestrated>("/custom/api/v1/forward-order-orchestration", {
      order_id: input.reference,
      order_date: input.orderDate.slice(0, 16).replace("T", " "),
      ...(input.serviceId ? { carrier_id: input.serviceId } : {}),
      billing_customer_name: input.drop.name,
      billing_address: [input.drop.line1, input.drop.line2, input.drop.landmark].filter(Boolean).join(", "),
      billing_city: input.drop.city,
      billing_pincode: input.drop.pincode,
      billing_state: input.drop.state,
      billing_country: "India",
      /* Optional for Velocity, but the customer's tracking messages go to
         it; the fallback is our care inbox, never an invented address. */
      billing_email: input.drop.email ?? contact.email,
      billing_phone: input.drop.phone.replace(/\D/g, "").slice(-10),
      shipping_is_billing: true,
      print_label: true,
      order_items: input.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        selling_price: i.unitPrice,
      })),
      payment_method: "PREPAID",
      sub_total: input.value,
      cod_collectible: 0,
      length: input.box.length,
      breadth: input.box.width,
      height: input.box.height,
      weight: input.grams / 1000,
      pickup_location: input.pickup.name,
      warehouse_id: warehouse,
    });

    const p = created.body.payload;
    let awb = p?.awb_code || null;
    if (!awb) {
      /* Refused, or an order without an AWB. A repeat `order_id` is an
         earlier attempt's order: if that one got its AWB, carry on with it
         rather than book again. Otherwise nothing was shipped — say why. */
      awb = await this.findAwb(input.reference).catch(() => null);
      if (!awb) {
        const why = created.body.message ?? JSON.stringify(created.body).slice(0, 300);
        throw new Error(`Velocity did not ship the order: ${created.status} ${why}`.slice(0, 500));
      }
    }

    /* The AWB exists: from here nothing may throw. */
    const pickupRequested = p?.pickup_generated === 1;
    return {
      trackingNumber: awb,
      courierRef: p?.shipment_id ?? null,
      pickupRequested,
      pickupError: pickupRequested
        ? null
        : "Velocity did not confirm the pickup — request it from the dashboard",
      labelUrl: p?.label_url ?? null,
    };
  }
}

import type { CourierOption, QuoteInput, ShippingProvider } from "./provider";
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
}

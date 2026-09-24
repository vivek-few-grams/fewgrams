import type { CourierOption, QuoteInput, ShippingProvider } from "./provider";
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
 * The account is on the Flat plan (₹90 to 2 kg anywhere, ₹35 a kg after,
 * RTO free), so the estimate is the plan's price and the declared value
 * only sets liability.
 */

const HOST = "https://app.elite.ekartlogistics.in";
const TIMEOUT_MS = 10_000;
/** Refresh this long before the token says it expires. */
const REFRESH_MARGIN_MS = 5 * 60_000;

type Token = { access_token?: string; expires_in?: number };
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
}

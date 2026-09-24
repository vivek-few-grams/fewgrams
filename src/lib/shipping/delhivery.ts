import type {
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
 * Nothing here books a shipment, fetches a waybill or raises a pickup. Those
 * spend wallet money and arrive with the admin "Create shipment" step.
 */

const HOSTS = {
  staging: "https://staging-express.delhivery.com",
  production: "https://track.delhivery.com",
} as const;

/** A quote sits on the checkout path; a courier that does not answer in this
 *  long is treated as down rather than left to hang the page. */
const TIMEOUT_MS = 10_000;

const MODE: Record<ShippingSpeed, "S" | "E"> = { surface: "S", express: "E" };

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

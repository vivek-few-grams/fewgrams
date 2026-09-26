import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateOrderInput,
  CreatedOrder,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentProvider,
  ProviderOrderRef,
  ProviderOrderStatus,
} from "./provider";

/**
 * Razorpay adapter — SPEC §9. Contract checked against razorpay.com/docs on
 * 26 Sep 2026:
 *
 * - `POST /v1/orders` takes the amount in **paise** and a `receipt` of at most
 *   40 characters; ours is the order id, and it is also put in `notes` so a
 *   webhook's payment entity names it without a second call.
 * - `GET /v1/orders/{id}/payments` lists every attempt on the order. A
 *   payment goes `created → authorized → captured`, or `failed`.
 * - **An authorized payment is not money.** Razorpay refunds it on its own
 *   after a few days unless it is captured. Auto-capture is a dashboard
 *   setting and is not relied on: `fetchOrder` captures any authorized
 *   payment for exactly the order's amount itself (`POST
 *   /v1/payments/{id}/capture`), then reads the order again. The amount is the
 *   one the server put on the Razorpay order, never one from the browser.
 * - Webhooks are signed `hex(HMAC-SHA256(rawBody, webhookSecret))` in
 *   `X-Razorpay-Signature`. The webhook secret is set per webhook in the
 *   dashboard and is **not** the API key secret. As with Cashfree, a webhook
 *   only names the order to re-fetch.
 * - Checkout is the browser script `checkout.razorpay.com/v1/checkout.js`,
 *   opened with the public key id and the Razorpay order id. Its success
 *   handler's signature is not checked here, because nothing trusts the
 *   browser: the return route settles against the API, as for Cashfree.
 *
 * A Razorpay order takes several attempts until one is captured, so a failed
 * card followed by a successful UPI payment is still one order.
 */

const API = "https://api.razorpay.com/v1";

/** Razorpay's payment statuses, mapped onto ours. `authorized` is pending:
 *  it becomes a success only once captured. */
const STATUS: Record<string, PaymentAttemptStatus> = {
  captured: "success",
  failed: "failed",
  refunded: "failed",
  authorized: "pending",
  created: "pending",
};

type RazorpayPayment = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string | null;
  created_at?: number | null;
};

type RazorpayOrder = { id: string; amount: number; currency: string; status?: string };

/** The events that are about a payment on one of our orders. */
const PAYMENT_EVENTS = new Set(["payment.captured", "payment.failed", "payment.authorized", "order.paid"]);

/** Rupees to paise. Totals are whole rupees today; rounding keeps a
 *  fractional one from sending 12345.000000001. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Exported for the tests, which sign a body the same way Razorpay does. */
export function razorpaySignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** `rzp_test_…` is test mode and `rzp_live_…` is live, so the mode is read off
 *  the key and can never disagree with it. */
export function razorpayMode(keyId: string): "sandbox" | "production" | null {
  if (keyId.startsWith("rzp_test_")) return "sandbox";
  if (keyId.startsWith("rzp_live_")) return "production";
  return null;
}

function toAttempt(p: RazorpayPayment, orderId: string): PaymentAttempt | null {
  if (!p.id) return null;
  return {
    providerPaymentId: p.id,
    orderId,
    status: STATUS[p.status ?? ""] ?? "pending",
    amount: Number(p.amount ?? 0) / 100,
    currency: p.currency ?? "INR",
    method: p.method ?? null,
    at: p.created_at ? new Date(p.created_at * 1000).toISOString() : null,
  };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly mode: "sandbox" | "production";

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    /** Null until a webhook is set up in the dashboard; every webhook is then
     *  refused, and the return route alone settles orders. */
    private readonly webhookSecret: string | null,
  ) {
    const mode = razorpayMode(keyId);
    if (!mode) throw new Error("RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_");
    this.mode = mode;
  }

  private async call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (!res.ok) {
      /* The body names the failing field; the secret travels in a header and
         is never echoed back, so logging the body is safe. */
      const detail = await res.text().catch(() => "");
      throw new Error(`Razorpay ${init.method} ${path} failed: ${res.status} ${detail.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await this.call<RazorpayOrder>("/orders", {
      method: "POST",
      body: {
        amount: toPaise(input.amount),
        currency: "INR",
        receipt: input.orderId,
        notes: { order_id: input.orderId },
      },
    });
    /* Razorpay orders do not expire on their own, so the payment window is
       held by the checkout's own timeout instead. */
    const timeoutSeconds = Math.max(60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
    return {
      providerOrderId: order.id,
      checkout: {
        gateway: "razorpay",
        keyId: this.keyId,
        razorpayOrderId: order.id,
        amountPaise: order.amount,
        prefill: {
          contact: input.customer.phone,
          email: input.customer.email,
          name: input.customer.name,
        },
        /* Razorpay does not append our id the way Cashfree does, so it goes
           on here. */
        returnUrl: `${input.returnUrl}?order_id=${encodeURIComponent(input.orderId)}`,
        timeoutSeconds,
      },
    };
  }

  async fetchOrder(ref: ProviderOrderRef) {
    if (!ref.providerOrderId) return { status: "active" as const, attempts: [] };
    const path = `/orders/${encodeURIComponent(ref.providerOrderId)}`;

    let [order, payments] = await this.readOrder(path);
    const toCapture = payments.filter(
      (p) => p.status === "authorized" && p.amount === order.amount && p.currency === order.currency,
    );
    if (toCapture.length > 0) {
      for (const p of toCapture) {
        try {
          await this.call(`/payments/${encodeURIComponent(p.id!)}/capture`, {
            method: "POST",
            body: { amount: p.amount, currency: p.currency },
          });
        } catch (e) {
          /* Already captured by a racing call or by auto-capture, or the
             order is already paid by another attempt. Re-reading below shows
             which; a genuine failure leaves the payment pending. */
          console.warn(`[payments] ${ref.orderId}: capture of ${p.id} did not go through`, e);
        }
      }
      [order, payments] = await this.readOrder(path);
    }

    const status: ProviderOrderStatus = order.status === "paid" ? "paid" : "active";
    return {
      status,
      attempts: payments
        .map((p) => toAttempt(p, ref.orderId))
        .filter((a): a is PaymentAttempt => a !== null),
    };
  }

  private async readOrder(path: string): Promise<[RazorpayOrder, RazorpayPayment[]]> {
    const [order, payments] = await Promise.all([
      this.call<RazorpayOrder>(path, { method: "GET" }),
      this.call<{ items?: RazorpayPayment[] }>(`${path}/payments`, { method: "GET" }),
    ]);
    return [order, payments.items ?? []];
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const signature = headers.get("x-razorpay-signature");
    if (!this.webhookSecret || !signature) return false;
    const expected = Buffer.from(razorpaySignature(rawBody, this.webhookSecret));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  webhookOrderId(rawBody: string): string | null {
    let event: {
      event?: string;
      payload?: {
        payment?: { entity?: { notes?: Record<string, string> | unknown[] } };
        order?: { entity?: { receipt?: string } };
      };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!PAYMENT_EVENTS.has(event.event ?? "")) return null;
    /* `notes` is an empty array, not an object, when a payment has none. */
    const notes = event.payload?.payment?.entity?.notes;
    const fromNotes = notes && !Array.isArray(notes) ? (notes as Record<string, string>).order_id : undefined;
    return fromNotes ?? event.payload?.order?.entity?.receipt ?? null;
  }
}

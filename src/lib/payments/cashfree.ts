import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateOrderInput,
  CreatedOrder,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentProvider,
  ProviderOrderStatus,
} from "./provider";

/**
 * Cashfree Payment Gateway adapter — SPEC §9.
 *
 * Plain `fetch` against the REST API rather than the vendor's Node SDK: four
 * calls do not justify a dependency, and the SDK's global configuration
 * object is awkward to keep per-request. Contract checked against
 * cashfree.com/docs on 23 Sep 2026:
 *
 * - `POST /pg/orders` returns `payment_session_id`, which the browser SDK
 *   (`@cashfreepayments/cashfree-js`) opens.
 * - `GET /pg/orders/{id}` gives `order_status`; fulfil only on `PAID`.
 * - `GET /pg/orders/{id}/payments` lists every attempt on the order.
 * - Webhooks are signed `base64(HMAC-SHA256(timestamp + rawBody, secret))`,
 *   delivered at least once, and retried. The vendor's own rule is not to
 *   act on a webhook payload alone, so a webhook only names the order to
 *   re-fetch.
 * - Cashfree appends `?order_id=<id>` to `return_url` itself, so the URL
 *   passed in carries no query string.
 *
 * A Cashfree order stays payable until it expires, so a failed card followed
 * by a successful UPI payment is two attempts on one order, not two orders.
 */

/** Pinned so a dashboard default change cannot reshape responses under us.
 *  The webhook version is set separately in the dashboard; use the same. */
export const CASHFREE_API_VERSION = "2025-01-01";

const HOSTS = {
  sandbox: "https://sandbox.cashfree.com/pg",
  production: "https://api.cashfree.com/pg",
} as const;

/** Cashfree's own statuses, mapped onto ours. Anything unlisted is treated as
 *  still in flight, which is the safe reading: it never marks an order paid. */
const STATUS: Record<string, PaymentAttemptStatus> = {
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "failed",
  VOID: "failed",
  USER_DROPPED: "dropped",
  PENDING: "pending",
  NOT_ATTEMPTED: "pending",
};

const ORDER_STATUS: Record<string, ProviderOrderStatus> = {
  PAID: "paid",
  ACTIVE: "active",
  EXPIRED: "expired",
  TERMINATED: "terminated",
  TERMINATION_REQUESTED: "terminated",
};

const PAYMENT_WEBHOOKS = new Set([
  "PAYMENT_SUCCESS_WEBHOOK",
  "PAYMENT_FAILED_WEBHOOK",
  "PAYMENT_USER_DROPPED_WEBHOOK",
]);

type CashfreePayment = {
  cf_payment_id?: string | number;
  order_id?: string;
  payment_status?: string;
  payment_amount?: number;
  payment_currency?: string;
  payment_group?: string | null;
  payment_time?: string | null;
};

/** Cashfree's `customer_id` is alphanumeric, 3–50 characters. An Auth.js id
 *  is a UUID, so dropping the hyphens leaves 32 hex characters. */
export function cashfreeCustomerId(userId: string): string {
  return userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 50);
}

/** Exported for the tests, which sign a body the same way Cashfree does. */
export function cashfreeSignature(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

function toAttempt(p: CashfreePayment, orderId: string): PaymentAttempt | null {
  if (p.cf_payment_id === undefined || p.cf_payment_id === null) return null;
  return {
    providerPaymentId: String(p.cf_payment_id),
    orderId,
    status: STATUS[p.payment_status ?? ""] ?? "pending",
    amount: Number(p.payment_amount ?? 0),
    currency: p.payment_currency ?? "INR",
    method: p.payment_group ?? null,
    at: p.payment_time ?? null,
  };
}

export class CashfreeProvider implements PaymentProvider {
  readonly name = "cashfree" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    readonly mode: "sandbox" | "production",
  ) {}

  private async call<T>(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
    const res = await fetch(`${HOSTS[this.mode]}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        "x-api-version": CASHFREE_API_VERSION,
        "x-client-id": this.clientId,
        "x-client-secret": this.clientSecret,
        ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (!res.ok) {
      /* The body names the failing field; the secret is in a header, never
         echoed back, so logging the body is safe. */
      const detail = await res.text().catch(() => "");
      throw new Error(`Cashfree ${init.method} ${path} failed: ${res.status} ${detail.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = {
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: cashfreeCustomerId(input.customer.id),
        customer_phone: input.customer.phone,
        ...(input.customer.email ? { customer_email: input.customer.email } : {}),
        ...(input.customer.name && input.customer.name.length >= 3
          ? { customer_name: input.customer.name.slice(0, 100) }
          : {}),
      },
      order_meta: {
        return_url: input.returnUrl,
        ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
      },
      order_expiry_time: input.expiresAt.toISOString(),
    };
    /* Deterministic per order, so a retried request cannot open a second
       gateway order for one of ours. Cashfree asks for 32–64 characters. */
    const res = await this.call<{ payment_session_id: string; cf_order_id: string | number }>(
      "/orders",
      { method: "POST", body, idempotencyKey: `fewgrams-order-${input.orderId}-create-v1` },
    );
    return { sessionId: res.payment_session_id, providerOrderId: String(res.cf_order_id) };
  }

  async fetchOrder(orderId: string) {
    const path = `/orders/${encodeURIComponent(orderId)}`;
    const [order, payments] = await Promise.all([
      this.call<{ order_status?: string }>(path, { method: "GET" }),
      this.call<CashfreePayment[]>(`${path}/payments`, { method: "GET" }),
    ]);
    return {
      /* Unknown reads as still open — never as paid. */
      status: ORDER_STATUS[order.order_status ?? ""] ?? ("active" as const),
      attempts: payments
        .map((p) => toAttempt(p, orderId))
        .filter((a): a is PaymentAttempt => a !== null),
    };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const timestamp = headers.get("x-webhook-timestamp");
    const signature = headers.get("x-webhook-signature");
    if (!timestamp || !signature) return false;
    const expected = Buffer.from(cashfreeSignature(timestamp, rawBody, this.clientSecret));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  webhookOrderId(rawBody: string): string | null {
    let event: { type?: string; data?: { order?: { order_id?: string } } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!PAYMENT_WEBHOOKS.has(event.type ?? "")) return null;
    return event.data?.order?.order_id ?? null;
  }
}

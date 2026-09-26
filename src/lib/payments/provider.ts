/**
 * The payment gateway seam — SPEC §2.1, §9.
 *
 * Business logic talks to this interface and never to a vendor. Two adapters
 * implement it — Razorpay (`razorpay.ts`) and Cashfree (`cashfree.ts`) — and
 * `paymentProvider()` picks the one whose keys are set. The only thing that
 * differs downstream is how the browser opens the payment screen
 * (`GatewayCheckout`).
 *
 * Everything crossing the seam is normalised: rupees as a number, our own
 * order id, and a four-value status. A vendor's own vocabulary
 * (`USER_DROPPED`, `PAYMENT_SUCCESS_WEBHOOK`, …) stops at the adapter.
 */

/** What the gateway says happened to one payment attempt. An order can
 *  collect several — a failed card, then a successful UPI. */
export type PaymentAttemptStatus = "success" | "failed" | "dropped" | "pending";

export type PaymentAttempt = {
  /** The gateway's id for this attempt. With `status`, it identifies an
   *  event: the same attempt can be reported pending and then success. */
  providerPaymentId: string;
  /** Our order id, echoed back by the gateway. */
  orderId: string;
  status: PaymentAttemptStatus;
  /** Rupees, as the gateway reports them. Compared against the order total
   *  before anything is marked paid. */
  amount: number;
  currency: string;
  /** `upi`, `credit_card`, `net_banking` … for the admin screen only. */
  method: string | null;
  /** ISO timestamp from the gateway, or null when it gave none. */
  at: string | null;
};

export type CreateOrderInput = {
  orderId: string;
  /** Rupees. Computed on the server from the catalogue, never from the
   *  browser (SPEC §9). */
  amount: number;
  customer: { id: string; phone: string; email: string | null; name: string | null };
  /** Where the gateway sends the customer afterwards. Arriving there proves
   *  nothing about payment — see `settle.ts`. */
  returnUrl: string;
  /** Per-order webhook target. Omitted when the app has no HTTPS origin
   *  (local dev); the dashboard-level webhook then applies, if set. */
  notifyUrl: string | null;
  expiresAt: Date;
};

export type GatewayName = "cashfree" | "razorpay";

/** How each gateway is named in copy ("You pay on Razorpay's secure screen").
 *  A brand, the same in every language, so not a message. */
export const GATEWAY_LABEL: Record<GatewayName, string> = { cashfree: "Cashfree", razorpay: "Razorpay" };

/**
 * What the browser needs to open the gateway's payment screen. None of it is
 * a secret: a Razorpay key id is public by design, and each of these can pay
 * only this one order, for the amount the server set.
 */
export type GatewayCheckout =
  | { gateway: "cashfree"; sessionId: string; mode: "sandbox" | "production" }
  | {
      gateway: "razorpay";
      keyId: string;
      razorpayOrderId: string;
      /** Must match the Razorpay order's own amount, in paise. */
      amountPaise: number;
      prefill: { contact: string; email: string | null; name: string | null };
      /** Our return route with `?order_id=` on it, opened once the payment
       *  succeeds. */
      returnUrl: string;
      /** What is left of the payment window, for the checkout's timeout. */
      timeoutSeconds: number;
    };

export type CreatedOrder = {
  providerOrderId: string;
  checkout: GatewayCheckout;
};

/** Which order to ask about: ours, and the gateway's own id for it — Cashfree
 *  is asked by ours, Razorpay only knows its own. */
export type ProviderOrderRef = { orderId: string; providerOrderId: string | null };

/** The gateway's verdict on the order as a whole. Only `paid` lets an order
 *  be fulfilled; the attempts are then checked for the amount. */
export type ProviderOrderStatus = "paid" | "active" | "expired" | "terminated";

export interface PaymentProvider {
  /** Which gateway this is, recorded on every order and payment row. */
  readonly name: GatewayName;
  /** Browser SDK mode — sandbox or production. */
  readonly mode: "sandbox" | "production";

  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;

  /** The order's status and every attempt on it, fetched server to server.
   *  **This is the only source a payment is confirmed from** — neither the
   *  browser redirect nor a webhook payload is trusted on its own. */
  fetchOrder(ref: ProviderOrderRef): Promise<{ status: ProviderOrderStatus; attempts: PaymentAttempt[] }>;

  /** True only when the body was signed by the gateway. Takes the **raw**
   *  body: a signature over re-serialised JSON will not match. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;

  /** Which of our orders a verified payment webhook is about, or null for an
   *  event this app does not act on. A trigger to re-fetch, not a verdict. */
  webhookOrderId(rawBody: string): string | null;
}

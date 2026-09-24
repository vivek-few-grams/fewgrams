/**
 * The payment gateway seam — SPEC §2.1, §9.
 *
 * Business logic talks to this interface and never to a vendor. Cashfree is
 * the one adapter today (`cashfree.ts`); a second gateway is a second file
 * implementing these four methods, not a change to checkout or to the order
 * lifecycle.
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

export type CreatedOrder = {
  /** Handed to the browser SDK to open the gateway's checkout. Not a secret:
   *  it can only pay this one order, for the amount the server set. */
  sessionId: string;
  providerOrderId: string;
};

/** The gateway's verdict on the order as a whole. Only `paid` lets an order
 *  be fulfilled; the attempts are then checked for the amount. */
export type ProviderOrderStatus = "paid" | "active" | "expired" | "terminated";

export interface PaymentProvider {
  /** Which gateway this is, recorded on every order and payment row. */
  readonly name: "cashfree";
  /** Browser SDK mode — sandbox or production. */
  readonly mode: "sandbox" | "production";

  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;

  /** The order's status and every attempt on it, fetched server to server.
   *  **This is the only source a payment is confirmed from** — neither the
   *  browser redirect nor a webhook payload is trusted on its own. */
  fetchOrder(orderId: string): Promise<{ status: ProviderOrderStatus; attempts: PaymentAttempt[] }>;

  /** True only when the body was signed by the gateway. Takes the **raw**
   *  body: a signature over re-serialised JSON will not match. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;

  /** Which of our orders a verified payment webhook is about, or null for an
   *  event this app does not act on. A trigger to re-fetch, not a verdict. */
  webhookOrderId(rawBody: string): string | null;
}

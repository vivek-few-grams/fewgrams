import { CashfreeProvider } from "./cashfree";
import { RazorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./provider";

export { GATEWAY_LABEL } from "./provider";
export type { GatewayCheckout, GatewayName, PaymentAttempt, PaymentProvider } from "./provider";

/**
 * The configured gateway, or **null when no keys are set**.
 *
 * Null rather than a throw, because an unconfigured gateway is a normal state
 * in development and during merchant onboarding: the checkout page says
 * payment is not open yet instead of rendering a button that can only fail.
 *
 * **Razorpay when its keys are set, else Cashfree** (the owner moved to
 * Razorpay on 26 Sep 2026; the Cashfree adapter stays for its orders and in
 * case of a move back). Razorpay's mode is read off the key itself —
 * `rzp_test_` or `rzp_live_` — so it cannot disagree with the key.
 * `RAZORPAY_WEBHOOK_SECRET` is optional: without it webhooks are refused and
 * the return route settles every order.
 *
 * `CASHFREE_ENV` must be spelled out. Defaulting to production would let a
 * missing variable send sandbox keys to the live API, or worse, the reverse.
 */
export function paymentProvider(): PaymentProvider | null {
  const rzpId = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  if (rzpId && rzpSecret) {
    return new RazorpayProvider(rzpId, rzpSecret, process.env.RAZORPAY_WEBHOOK_SECRET || null);
  }

  const id = process.env.CASHFREE_CLIENT_ID;
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  const env = process.env.CASHFREE_ENV;
  if (!id || !secret) return null;
  if (env !== "sandbox" && env !== "production") {
    throw new Error('CASHFREE_ENV must be "sandbox" or "production"');
  }
  return new CashfreeProvider(id, secret, env);
}

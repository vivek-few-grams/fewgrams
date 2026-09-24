import { CashfreeProvider } from "./cashfree";
import type { PaymentProvider } from "./provider";

export type { PaymentAttempt, PaymentProvider } from "./provider";

/**
 * The configured gateway, or **null when no keys are set**.
 *
 * Null rather than a throw, because an unconfigured gateway is a normal state
 * in development and during merchant onboarding: the checkout page says
 * payment is not open yet instead of rendering a button that can only fail.
 *
 * `CASHFREE_ENV` must be spelled out. Defaulting to production would let a
 * missing variable send sandbox keys to the live API, or worse, the reverse.
 */
export function paymentProvider(): PaymentProvider | null {
  const id = process.env.CASHFREE_CLIENT_ID;
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  const env = process.env.CASHFREE_ENV;
  if (!id || !secret) return null;
  if (env !== "sandbox" && env !== "production") {
    throw new Error('CASHFREE_ENV must be "sandbox" or "production"');
  }
  return new CashfreeProvider(id, secret, env);
}

import { DelhiveryProvider } from "./delhivery";
import type { ShippingProvider } from "./provider";

export type { DeliveryEstimate, Quote, QuoteInput, Serviceability, ShippingProvider, ShippingSpeed } from "./provider";
export { chargeableGrams, volumetricGrams, type BoxCm } from "./weight";

/**
 * The configured courier, or **null when no token is set** — the same rule as
 * `paymentProvider()`: an unconfigured courier is a normal state in
 * development, and callers decide what to show instead.
 *
 * `DELHIVERY_ENV` must be spelled out. Staging and production take different
 * tokens, and defaulting either way would let a missing variable send a
 * token to the system it does not belong to.
 */
export function shippingProvider(): ShippingProvider | null {
  const token = process.env.DELHIVERY_API_TOKEN;
  const env = process.env.DELHIVERY_ENV;
  if (!token) return null;
  if (env !== "staging" && env !== "production") {
    throw new Error('DELHIVERY_ENV must be "staging" or "production"');
  }
  return new DelhiveryProvider(token, env);
}

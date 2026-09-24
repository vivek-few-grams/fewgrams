import { DelhiveryProvider } from "./delhivery";
import { EkartProvider } from "./ekart";
import { ShiprocketProvider } from "./shiprocket";
import type { ShippingProvider } from "./provider";

export type {
  CourierName,
  CourierOption,
  DeliveryEstimate,
  Quote,
  QuoteInput,
  Serviceability,
  ShippingProvider,
  ShippingSpeed,
} from "./provider";
export { boxForGrams, chargeableGrams, volumetricGrams, type BoxCm } from "./weight";

/**
 * Delhivery, or **null when no token is set** — the same rule as
 * `paymentProvider()`: an unconfigured courier is a normal state in
 * development, and callers decide what to show instead.
 *
 * `DELHIVERY_ENV` must be spelled out. Staging and production take different
 * tokens, and defaulting either way would let a missing variable send a
 * token to the system it does not belong to.
 *
 * Returned as the concrete class because admin → delivery also asks it the
 * questions only Delhivery answers (does it collect from the pickup PIN).
 */
export function shippingProvider(): DelhiveryProvider | null {
  const token = process.env.DELHIVERY_API_TOKEN;
  const env = process.env.DELHIVERY_ENV;
  if (!token) return null;
  if (env !== "staging" && env !== "production") {
    throw new Error('DELHIVERY_ENV must be "staging" or "production"');
  }
  return new DelhiveryProvider(token, env);
}

/* One instance per process, so each keeps its sign-in token between quotes. */
let ekart: EkartProvider | null = null;
let shiprocket: ShiprocketProvider | null = null;

/**
 * Every courier with credentials set, in a fixed order, for checkout to ask
 * at once (SPEC §7, 24 Sep 2026). Each is optional; none configured is an
 * empty list, and checkout then shows no price rather than a free one.
 */
export function shippingProviders(): ShippingProvider[] {
  const out: ShippingProvider[] = [];
  const delhivery = shippingProvider();
  if (delhivery) out.push(delhivery);

  const { EKART_CLIENT_ID, EKART_USERNAME, EKART_PASSWORD } = process.env;
  if (EKART_CLIENT_ID && EKART_USERNAME && EKART_PASSWORD) {
    ekart ??= new EkartProvider(EKART_CLIENT_ID, EKART_USERNAME, EKART_PASSWORD);
    out.push(ekart);
  }

  const { SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } = process.env;
  if (SHIPROCKET_EMAIL && SHIPROCKET_PASSWORD) {
    shiprocket ??= new ShiprocketProvider(SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD);
    out.push(shiprocket);
  }
  return out;
}

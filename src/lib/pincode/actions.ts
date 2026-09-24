"use server";

import { checkDeliveryArea } from "./place";

/**
 * The public "do you deliver to me?" — for `PinCheck`, which a visitor can
 * use before signing in. Returns a yes or no and nothing else.
 *
 * Unauthenticated, so anyone can make it spend a lookup; the cache bounds
 * that at one India Post call per PIN, ever, and there are ~19,000 PINs.
 */
export async function isDeliverablePinAction(raw: string): Promise<boolean> {
  const pincode = String(raw ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pincode)) return false;
  return (await checkDeliveryArea(pincode)).served;
}

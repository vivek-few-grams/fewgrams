import { getPinPlace, putPinPlace } from "@/lib/repo/pin-place";
import { inDeliveryArea } from "./area";
import { fetchPinPlace, type PinPlace } from "./india-post";

export type { PinPlace } from "./india-post";

/**
 * District and state for a PIN — the cache first, then India Post.
 *
 * **Null is always an acceptable answer.** It means "type them yourself":
 * no key configured (`DATA_GOV_IN_API_KEY` — a normal state in development,
 * like the payment and courier keys), a PIN the directory does not know, or
 * a directory that did not answer in time. Nothing that calls this may treat
 * null as a reason to refuse an address; the fields are a convenience.
 *
 * Only a found answer is cached. A miss or a failure is asked again next
 * time, because both can be wrong tomorrow and neither is expensive to
 * repeat.
 */
export async function placeForPin(pincode: string): Promise<PinPlace | null> {
  if (!/^\d{6}$/.test(pincode)) return null;

  try {
    const cached = await getPinPlace(pincode);
    if (cached) return cached;
  } catch (e) {
    console.error("PIN place cache read failed", e);
  }

  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey) return null;

  let place: PinPlace | null;
  try {
    place = await fetchPinPlace(pincode, apiKey);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return null;
  }
  if (place) {
    await putPinPlace(pincode, place).catch((e) => console.error("PIN place cache write failed", e));
  }
  return place;
}

export type AreaCheck = { served: boolean; place: PinPlace | null };

/**
 * Is this PIN in the delivery area, and what is it? One lookup answers both
 * — the place that fills the form is the place that decides — and it is
 * cached, so the checkout page asking again costs a read, not a call.
 */
export async function checkDeliveryArea(pincode: string): Promise<AreaCheck> {
  const place = await placeForPin(pincode);
  return { served: inDeliveryArea(pincode, place), place };
}

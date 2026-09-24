import { READ_OPTS } from "@/lib/db/client";
import { PinPlaceEntity } from "@/lib/db/entities";
import type { PinPlace } from "@/lib/pincode/india-post";

/** The cached India Post answer for a PIN, or null if it was never asked. */
export async function getPinPlace(pincode: string): Promise<PinPlace | null> {
  const { data } = await PinPlaceEntity.get({ pincode }).go(READ_OPTS);
  return data ? { district: data.district, state: data.state } : null;
}

export async function putPinPlace(pincode: string, place: PinPlace): Promise<void> {
  await PinPlaceEntity.put({ pincode, ...place, fetchedAt: new Date().toISOString() }).go();
}

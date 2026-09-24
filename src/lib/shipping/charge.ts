import type { CartKind } from "@/lib/cart/cart";
import type { ShippingQuote } from "@/lib/orders/order";
import { findSellableRack } from "@/lib/racks/catalogue";
import { getShippingSettings } from "@/lib/repo/shipping";
import { listTrays } from "@/lib/repo/trays";
import type { Tray } from "@/lib/types";
import { shippingProvider } from "./index";
import { parcelGrams, travelsOnOwnRun, type ParcelLine, type TrayPacking } from "./parcel";

/**
 * The delivery charge for one order to one PIN — SPEC §7. Two rules, both the
 * owner's (23 Sep 2026):
 *
 * - **Any order with greens in it** goes on the owner's own same-day run and
 *   pays the **fixed fee** set on admin → delivery, whatever else is in it.
 *   A bike quote a week ahead is not a price anybody can hold — it moves
 *   with the day's surge and with how many drops share the route — so the
 *   fee is set from the average cost per drop and reviewed, not quoted.
 * - **Everything else** goes by courier and pays the courier's live surface
 *   price, rounded up to the rupee. A courier prices from a rate card, not
 *   from demand, so today's quote holds for a shipment made next week.
 *
 * A subscription pays none — its price includes delivery — and does not come
 * through this path.
 *
 * Never falls back to free. With no settings saved, an item not yet measured,
 * no courier token, or a courier that does not answer, the result says so
 * and checkout does not open, because an order placed at ₹0 delivery is a
 * charge nobody can take back after payment.
 */
export type DeliveryCharge =
  | { ok: true; method: "own_run"; amount: number; quote: null }
  | { ok: true; method: "courier"; amount: number; quote: ShippingQuote }
  | { ok: false; reason: "notConfigured" | "noCourier" | "notMeasured" | "unavailable" };

/** What checkout and the order hold for a line — enough to find its packing. */
export type ChargeLine = { kind: CartKind; key: string; units: number; grams: number | null };

function trayPacking(t: Tray | undefined): TrayPacking | null {
  if (
    !t ||
    t.packPieces === undefined ||
    t.pieceLengthCm === undefined ||
    t.pieceWidthCm === undefined ||
    t.pieceHeightCm === undefined ||
    t.pieceStackCm === undefined ||
    t.pieceGrams === undefined
  ) {
    return null;
  }
  return {
    packPieces: t.packPieces,
    pieceLengthCm: t.pieceLengthCm,
    pieceWidthCm: t.pieceWidthCm,
    pieceHeightCm: t.pieceHeightCm,
    pieceStackCm: t.pieceStackCm,
    pieceGrams: t.pieceGrams,
  };
}

/** Joins each line to where its measurements live: a tray to its row, a
 *  rack to its model and shelf size. */
async function toParcelLines(lines: readonly ChargeLine[]): Promise<ParcelLine[]> {
  const trays = lines.some((l) => l.kind === "tray")
    ? new Map((await listTrays()).map((t) => [t.contentKey, t]))
    : new Map<string, Tray>();

  return Promise.all(
    lines.map(async (l): Promise<ParcelLine> => {
      switch (l.kind) {
        case "variety":
          return { kind: "variety", units: l.units };
        case "seed":
          return { kind: "seed", units: l.units, grams: l.grams };
        case "tray":
          return { kind: "tray", units: l.units, packing: trayPacking(trays.get(l.key)) };
        case "rack": {
          const found = await findSellableRack(l.key);
          const r = found?.rack;
          return {
            kind: "rack",
            units: l.units,
            packing:
              r && r.gramsPerShelf !== null
                ? {
                    heightFt: r.heightFt,
                    shelves: r.shelves,
                    depthFt: r.depthFt,
                    lengthFt: r.lengthFt,
                    gramsPerShelf: r.gramsPerShelf,
                  }
                : null,
          };
        }
        default: {
          const never: never = l.kind;
          throw new Error(`No parcel rule for kind ${String(never)}`);
        }
      }
    }),
  );
}

export async function deliveryCharge(lines: readonly ChargeLine[], pincode: string): Promise<DeliveryCharge> {
  const settings = await getShippingSettings();
  if (!settings) return { ok: false, reason: "notConfigured" };

  if (travelsOnOwnRun(lines)) {
    return { ok: true, method: "own_run", amount: settings.greenRunFee, quote: null };
  }

  const provider = shippingProvider();
  /* Its own reason, not `notConfigured`: "no fee saved" and "no courier
     token" are fixed in different places, and the admin note has to say which. */
  if (!provider) return { ok: false, reason: "noCourier" };

  const grams = parcelGrams(await toParcelLines(lines), settings.packing);
  if (grams === null) {
    console.error(`[shipping] an item in this order has no packing measurements`, lines);
    return { ok: false, reason: "notMeasured" };
  }
  if (grams <= 0) return { ok: false, reason: "notConfigured" };

  try {
    const q = await provider.quote({
      originPin: settings.pickup.pincode,
      destinationPin: pincode,
      grams,
      speed: "surface",
    });
    return {
      ok: true,
      method: "courier",
      amount: Math.ceil(q.total),
      quote: { courier: provider.name, quotedTotal: q.total, chargedGrams: q.chargedGrams, zone: q.zone },
    };
  } catch (e) {
    console.error(`[shipping] no quote to ${pincode} for ${grams} g`, e);
    return { ok: false, reason: "unavailable" };
  }
}

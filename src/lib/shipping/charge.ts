import type { CartKind } from "@/lib/cart/cart";
import type { ShippingQuote } from "@/lib/orders/order";
import { findSellableRack, type SellableRack } from "@/lib/racks/catalogue";
import { allOrigins, getShippingSettings, type Origin, type ShippingSettings } from "@/lib/repo/shipping";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import type { GrowMedium, Tray } from "@/lib/types";
import { shippingProviders, type CourierName, type CourierOption } from "./index";
import { HOME_ORIGIN, lineOrigin, splitShipments } from "./origin";
import { parcelGrams, type ParcelLine, type RackPacking, type TrayPacking } from "./parcel";
import { customerDelivery, type CustomerDelivery } from "./fee";

/**
 * The delivery charge for one order to one PIN — SPEC §7. The owner's rules
 * (23–25 Sep 2026):
 *
 * - **Everything ships from our pickup, except shelf racks, which ship from
 *   their vendor** (`lineOrigin`). The order is split by pickup
 *   (`splitShipments`) and each parcel priced on its own route; the charge
 *   is the sum.
 * - **Greens go on the owner's own same-day run** at the **fixed fee** set on
 *   admin → delivery, with everything else from our own pickup. A bike quote
 *   a week ahead is not a price anybody can hold — it moves with the day's
 *   surge and with how many drops share the route — so the fee is set from
 *   the average cost per drop and reviewed, not quoted. A supplier's items in
 *   the same order still go by courier from the supplier.
 * - **Every courier parcel** is booked at the courier's live surface price,
 *   rounded up to the rupee. A courier prices from a rate card, not from
 *   demand, so today's quote holds for a shipment made next week. What the
 *   *customer* pays is a separate rule (`fee.ts`, 4 Oct 2026): free from ₹999
 *   of goods, otherwise that price capped at ₹79.
 *
 * A subscription pays none — its price includes delivery — and does not come
 * through this path.
 *
 * **Every connected courier is asked at once** (the owner, 24 Sep 2026) —
 * Delhivery, Ekart and Shiprocket's carriers — and the cheapest is booked
 * (the customer chose among them until 4 Oct 2026). No single courier wins
 * everywhere: Ekart's flat rate beats Delhivery on a 2 kg tray pack in every
 * city tested and loses on a 500 g seed packet in every one.
 *
 * Never falls back to free. With no settings saved, an item not yet measured,
 * no courier token, or no courier that answers, the result says so and
 * checkout does not open, because an order placed at ₹0 delivery is a charge
 * nobody can take back after payment. One courier failing is not that: the
 * others' prices still stand.
 */
export type DeliveryFailure = "notConfigured" | "noCourier" | "notMeasured" | "unavailable";

/** One courier option as checkout shows and charges it: rupees, rounded up. */
export type DeliveryOption = {
  id: string;
  courier: CourierName;
  carrier: string | null;
  amount: number;
  days: number | null;
  quote: ShippingQuote;
};

/** One courier parcel: what is in it, where it is collected, and every
 *  courier's price for it, cheapest first. Its `id` is its pickup's id. */
export type ParcelPlan = { id: string; origin: Origin; lines: ChargeLine[]; options: DeliveryOption[] };

/**
 * How an order travels: the own run, if it has greens, carrying everything
 * from home at the fixed fee; and one courier parcel per other pickup. An
 * order with no greens is courier parcels only.
 */
export type DeliveryPlan =
  | {
      ok: true;
      ownRun: { amount: number; origin: Origin; lines: ChargeLine[] } | null;
      parcels: ParcelPlan[];
    }
  | { ok: false; reason: DeliveryFailure };

/** One shipment as charged and recorded on the order. */
export type ChargedShipment = {
  origin: Origin;
  lines: ChargeLine[];
  method: "own_run" | "courier";
  /** The customer's share of the delivery charge for this shipment
   *  (`customerDelivery`) — not what the courier costs, which is the
   *  quote's `quotedTotal`. */
  amount: number;
  /** Null for the own run, whose fee is fixed. */
  quote: ShippingQuote | null;
  /** The courier's days on the road; null for the own run or when the
   *  courier gave none. */
  days: number | null;
};

export type DeliveryCharge =
  | { ok: true; amount: number; shipments: ChargedShipment[] }
  | { ok: false; reason: DeliveryFailure | "optionGone" };

/** What checkout and the order hold for a line — enough to find its packing. */
export type ChargeLine = {
  kind: CartKind;
  key: string;
  units: number;
  grams: number | null;
  lineTotal: number;
};

/** A tray's or a grow medium's six packing figures, or null until all six
 *  are measured. Both rows carry the same fields (SPEC §24). */
function trayPacking(t: Tray | GrowMedium | undefined): TrayPacking | null {
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

/** A rack's packing, or null until every figure it needs is measured —
 *  its weight, and either its plate's thickness or the angle or pipe
 *  bundle's section (SPEC §7). */
function rackPacking(r: SellableRack): RackPacking | null {
  if (r.grams === null) return null;
  const base = {
    heightFt: r.heightFt,
    shelves: r.shelves,
    depthFt: r.depthFt,
    lengthFt: r.lengthFt,
    grams: r.grams,
  };
  const p = r.packing;
  if (p.kind === "plates") {
    return p.shelfCm === null ? null : { ...base, stack: { kind: "plates", shelfCm: p.shelfCm } };
  }
  if (p.kind === "pipes") {
    return p.diameterCm === null
      ? null
      : { ...base, stack: { kind: "pipes", piecesFt: p.piecesFt, diameterCm: p.diameterCm } };
  }
  if (p.widthCm === null || p.stackCm === null) return null;
  return { ...base, stack: { kind: "bundle", pieces: p.pieces, widthCm: p.widthCm, stackCm: p.stackCm } };
}

/** Joins each line to where its measurements live: a tray to its row, a
 *  rack to its model and shelf size. */
async function toParcelLines(lines: readonly ChargeLine[]): Promise<ParcelLine[]> {
  const trays = lines.some((l) => l.kind === "tray")
    ? new Map((await listTrays()).map((t) => [t.contentKey, t]))
    : new Map<string, Tray>();
  const media = lines.some((l) => l.kind === "media")
    ? new Map((await listGrowMedia()).map((m) => [m.contentKey, m]))
    : new Map<string, GrowMedium>();

  return Promise.all(
    lines.map(async (l): Promise<ParcelLine> => {
      switch (l.kind) {
        case "variety":
          return { kind: "variety", units: l.units };
        case "seed":
          return { kind: "seed", units: l.units, grams: l.grams };
        case "tray":
          return { kind: "tray", units: l.units, packing: trayPacking(trays.get(l.key)) };
        case "media":
          return { kind: "media", units: l.units, packing: trayPacking(media.get(l.key)) };
        case "rack": {
          const found = await findSellableRack(l.key);
          return { kind: "rack", units: l.units, packing: found ? rackPacking(found.rack) : null };
        }
        default: {
          const never: never = l.kind;
          throw new Error(`No parcel rule for kind ${String(never)}`);
        }
      }
    }),
  );
}

/**
 * A scan is kept for ten minutes per origin, destination and weight. The
 * customer sees a scan's prices and pays against them a minute later; a
 * fresh scan at that moment would ask three couriers again, and if one of
 * them had stopped answering in between, the option the customer chose would
 * vanish under them. Rate cards do not move in ten minutes. Per process, so
 * a cold instance simply scans again.
 */
const SCAN_TTL_MS = 10 * 60_000;
const scans = new Map<string, { until: number; options: CourierOption[] }>();
/* Scans in progress, so plans that share a parcel ask the couriers once. */
const inFlight = new Map<string, Promise<CourierOption[]>>();

async function scanCouriers(originPin: string, destinationPin: string, grams: number, value: number) {
  const key = `${originPin}>${destinationPin}:${grams}`;
  const hit = scans.get(key);
  if (hit && hit.until > Date.now()) return hit.options;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const scan = askCouriers(key, originPin, destinationPin, grams, value).finally(() => inFlight.delete(key));
  inFlight.set(key, scan);
  return scan;
}

async function askCouriers(
  key: string,
  originPin: string,
  destinationPin: string,
  grams: number,
  value: number,
) {
  const providers = shippingProviders();
  const settled = await Promise.allSettled(
    providers.map((p) => p.options({ originPin, destinationPin, grams, speed: "surface", value })),
  );
  const options = settled
    .flatMap((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(
        `[shipping] ${providers[i].name} gave no price to ${destinationPin} for ${grams} g`,
        r.reason,
      );
      return [];
    })
    .sort((a, b) => a.total - b.total);
  /* Only a scan with an answer is kept: an empty one would hold a courier
     outage in place for ten minutes. */
  if (options.length > 0) {
    if (scans.size > 500) scans.clear();
    scans.set(key, { until: Date.now() + SCAN_TTL_MS, options });
  }
  return options;
}

/**
 * Every way to deliver this order to this PIN (the owner, 25 Sep 2026):
 * everything ships from our Bengaluru pickup, except **shelf racks, which
 * always ship from their vendor** (`lineOrigin`). So an order is at most two
 * courier parcels — ours and the rack maker's — each measured and priced on
 * its own route. A live test that day showed one box from our pickup beats
 * vendor parcels for everything else once the stock is held here.
 *
 * One parcel no courier will carry means the order cannot be priced; the
 * customer is never charged for part of it.
 */
export async function deliveryPlan(lines: readonly ChargeLine[], pincode: string): Promise<DeliveryPlan> {
  const settings = await getShippingSettings();
  if (!settings) return { ok: false, reason: "notConfigured" };
  return planFor(lines, pincode, settings, (l) => lineOrigin(l, settings.vendorOf));
}

async function planFor(
  lines: readonly ChargeLine[],
  pincode: string,
  settings: ShippingSettings,
  originOf: (line: ChargeLine) => string,
): Promise<DeliveryPlan> {
  const origins = new Map(allOrigins(settings).map((o) => [o.id, o]));
  const split = splitShipments(lines, originOf);
  const own = split.find((s) => s.ownRun);
  const courier = split.filter((s) => !s.ownRun);

  /* Its own reason, not `notConfigured`: "no fee saved" and "no courier
     token" are fixed in different places, and the admin note has to say which. */
  if (courier.length > 0 && shippingProviders().length === 0) return { ok: false, reason: "noCourier" };

  const parcels: (ParcelPlan & { grams: number })[] = [];
  for (const group of courier) {
    /* A pickup removed in admin while something still named it. Admin
       refuses that save, so this is a stale row — refused, not guessed. */
    const origin = origins.get(group.origin);
    if (!origin) {
      console.error(`[shipping] no pickup "${group.origin}" for`, group.lines);
      return { ok: false, reason: "notConfigured" };
    }
    const grams = parcelGrams(await toParcelLines(group.lines), settings.packing);
    if (grams === null) {
      console.error(`[shipping] an item in this order has no packing measurements`, group.lines);
      return { ok: false, reason: "notMeasured" };
    }
    if (grams <= 0) return { ok: false, reason: "notConfigured" };
    parcels.push({ id: origin.id, origin, lines: group.lines, grams, options: [] });
  }

  /* Every parcel's scan at once: three couriers times three parcels in the
     time of the slowest one. The goods' worth rides along for couriers that
     ask for a declared value. */
  const scanned = await Promise.all(
    parcels.map((p) =>
      scanCouriers(
        p.origin.pincode,
        pincode,
        p.grams,
        p.lines.reduce((sum, l) => sum + l.lineTotal, 0),
      ),
    ),
  );
  if (scanned.some((found) => found.length === 0)) return { ok: false, reason: "unavailable" };

  return {
    ok: true,
    ownRun: own
      ? { amount: settings.greenRunFee, origin: origins.get(HOME_ORIGIN)!, lines: own.lines }
      : null,
    parcels: parcels.map((p, i) => ({
      id: p.id,
      origin: p.origin,
      lines: p.lines,
      options: scanned[i].map(toOption),
    })),
  };
}

function toOption(o: CourierOption): DeliveryOption {
  return {
    id: o.id,
    courier: o.courier,
    carrier: o.carrier,
    amount: Math.ceil(o.total),
    days: o.days,
    quote: {
      courier: o.courier,
      ...(o.carrier ? { carrier: o.carrier } : {}),
      ...(o.serviceId ? { serviceId: o.serviceId } : {}),
      quotedTotal: o.total,
      chargedGrams: o.chargedGrams,
      zone: o.zone,
    },
  };
}

/**
 * What a plan costs the customer, with the cheapest option on every parcel
 * — the courier checkout books (SPEC §7.4). `goods` is the lines' total.
 */
export function planDelivery(plan: Extract<DeliveryPlan, { ok: true }>, goods: number): CustomerDelivery {
  return customerDelivery(
    goods,
    plan.ownRun?.amount ?? null,
    plan.parcels.map((p) => p.options[0].amount),
  );
}

/**
 * The charge for the options checkout booked, one per parcel, keyed by the
 * parcel's id — the cheapest the scan offered (SPEC §7.4; until 4 Oct 2026
 * the customer picked). `optionGone` when any parcel's option is no longer
 * offered — checkout then refuses and re-scans rather than booking a
 * different courier. The courier is paid its quote; the customer pays
 * `customerDelivery` — free from ₹999 of goods, otherwise the couriers'
 * cost capped at ₹79, plus the own-run fee.
 */
export async function deliveryCharge(
  lines: readonly ChargeLine[],
  pincode: string,
  choices: Readonly<Record<string, string>>,
): Promise<DeliveryCharge> {
  const plan = await deliveryPlan(lines, pincode);
  if (!plan.ok) return plan;

  const chosen: DeliveryOption[] = [];
  for (const p of plan.parcels) {
    const option = p.options.find((o) => o.id === choices[p.id]);
    if (!option) return { ok: false, reason: "optionGone" };
    chosen.push(option);
  }
  const goods = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const fee = customerDelivery(
    goods,
    plan.ownRun?.amount ?? null,
    chosen.map((o) => o.amount),
  );

  const shipments: ChargedShipment[] = [];
  if (plan.ownRun) {
    shipments.push({
      origin: plan.ownRun.origin,
      lines: plan.ownRun.lines,
      method: "own_run",
      amount: fee.ownRun ?? 0,
      quote: null,
      days: null,
    });
  }
  plan.parcels.forEach((p, i) => {
    shipments.push({
      origin: p.origin,
      lines: p.lines,
      method: "courier",
      amount: fee.parcels[i],
      quote: chosen[i].quote,
      days: chosen[i].days,
    });
  });
  return { ok: true, amount: fee.total, shipments };
}

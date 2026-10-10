import { randomBytes } from "node:crypto";
import { fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import type { OrderAddress } from "@/lib/orders/order";
import type { GatewayName } from "@/lib/payments/provider";
import { rotationWeek, subscriptionSchedule } from "./rotation";

/**
 * A subscription — SPEC §5, §5.2.1. Pure logic only; storage is
 * `src/lib/repo/subscriptions.ts` and the payment handshake is `settle.ts`
 * beside this file.
 *
 * **One checkout, one subscription, any number of boxes.** A customer can take
 * two Everyday Essentials and one Rare & Exotic in one go (the owner, 26 Sep
 * 2026): that is one payment, so it is one row with two lines, and each
 * Saturday it is three boxes to one door. One box per bundle, every week, for
 * four Saturdays.
 *
 * Pick Your Own is **not** subscribable (the owner, same day). A plan with no
 * `monthlyPrice` is refused by `startSubscription`, not just hidden.
 */

/** `paused` and `cancelled` are set from admin only (the owner, 27 Sep 2026);
 *  a customer asks on WhatsApp or by email. */
export type SubscriptionStatus = "pending_payment" | "active" | "paused" | "cancelled";

export type SubscriptionLine = {
  planId: string;
  /** The plan's content key, e.g. `essential`. */
  planKey: string;
  /** In the locale the customer subscribed in — a snapshot, like an order
   *  line's name. */
  name: string;
  /** Bundles taken: this many boxes arrive every Saturday. */
  boxes: number;
  /** ₹ per bundle for the term, as charged. */
  monthlyPrice: number;
  /** `boxes × monthlyPrice`. */
  lineTotal: number;
  /** The box weight promised at checkout. The tray plan counts from this
   *  rather than from the live plan, so retuning a plan's weight changes new
   *  subscribers' boxes, not the ones already paid for. */
  gramsPerBox: number;
};

/** One Saturday of the term. `week` is the rotation week (1–4) that Saturday
 *  falls on — the calendar is shared, see `rotation.ts`. */
export type SubscriptionDelivery = { date: string; week: number };

export type Subscription = {
  id: string;
  userId: string;
  email: string | null;
  status: SubscriptionStatus;
  lines: SubscriptionLine[];
  /** Rupees for the whole term; delivery is included (plan copy says so). */
  total: number;
  /** Every Saturday of the term, `YYYY-MM-DD` IST, first box first. Moved on
   *  a week if it is paid after the cutoff it was priced against. A skip
   *  moves one to the end, a pause takes the future ones off until resumed,
   *  and a cancel drops them — so this is always the boxes that did or will
   *  arrive, and the tray plan can keep reading it as it is. */
  deliveries: SubscriptionDelivery[];
  /** Saturdays taken off by a skip, for the record on both screens. */
  skipped: string[];
  /** Boxes owed while `paused`, put back on the calendar by a resume. 0
   *  otherwise. */
  held: number;
  address: OrderAddress;
  locale: string;
  provider: GatewayName;
  providerOrderId: string | null;
  receiptNo: number | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export { MAX_BOXES_PER_PLAN } from "./limits";

/** Crockford base32, as for order ids. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `FS` and ten random characters. A different prefix from an order's `FG`,
 *  because the gateway's return route and webhook name only an id, and the
 *  prefix is what says which of the two to settle. */
export function newSubscriptionId(bytes: Uint8Array = randomBytes(10)): string {
  let id = "FS";
  for (let i = 0; i < 10; i++) id += ALPHABET[bytes[i] % 32];
  return id;
}

export function isSubscriptionId(raw: string): boolean {
  return /^FS[0-9A-HJKMNP-TV-Z]{10}$/.test(raw);
}

export function boxesPerWeek(sub: Pick<Subscription, "lines">): number {
  return sub.lines.reduce((n, l) => n + l.boxes, 0);
}

/**
 * Where a subscription stands on `now`, for the customer's list and the
 * admin dashboard. **Expired is derived, never stored**: a stored status would
 * need a job to flip it the morning after the last box, and the dates already
 * say it.
 *
 * - `upcoming` — paid, first box still ahead.
 * - `active` — at least one box delivered, at least one to come.
 * - `expired` — the last Saturday has passed.
 */
export type SubscriptionState = "pending" | "cancelled" | "paused" | "upcoming" | "active" | "expired";

export function subscriptionState(
  sub: Pick<Subscription, "status" | "deliveries">,
  now: Date = new Date(),
): SubscriptionState {
  if (sub.status === "pending_payment") return "pending";
  if (sub.status === "cancelled") return "cancelled";
  if (sub.status === "paused") return "paused";
  const today = istDateISO(now);
  const dates = sub.deliveries.map((d) => d.date).sort();
  if (dates.length === 0 || dates.at(-1)! < today) return "expired";
  return dates[0] > today ? "upcoming" : "active";
}

/** The next Saturday still to come (today counts), or null once expired. */
export function nextDelivery(
  sub: Pick<Subscription, "deliveries">,
  now: Date = new Date(),
): SubscriptionDelivery | null {
  const today = istDateISO(now);
  return (
    [...sub.deliveries].sort((a, b) => a.date.localeCompare(b.date)).find((d) => d.date >= today) ?? null
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The term, moved on a whole week per cutoff missed between opening the
 * payment screen and paying.
 *
 * The Saturdays were worked out when the checkout opened. Paid after the
 * Friday-night cutoff, the first of them is already being sown for without
 * this subscriber, so the whole term starts a week later — and each Saturday
 * keeps a rotation week one on, since the calendar is shared.
 */
export function shiftForCutoff(
  deliveries: SubscriptionDelivery[],
  expected: string,
  actual: string,
  weeksInRotation: number,
): SubscriptionDelivery[] {
  const weeks = Math.round((Date.parse(actual) - Date.parse(expected)) / (7 * DAY_MS));
  if (weeks <= 0) return deliveries;
  return deliveries.map((d) => ({
    date: new Date(Date.parse(d.date) + weeks * 7 * DAY_MS).toISOString().slice(0, 10),
    week: ((d.week - 1 + weeks) % weeksInRotation) + 1,
  }));
}

/* ─────────────── Skip, pause, resume, cancel — admin, 27 Sep 2026 ───────────────
 *
 * A Saturday can be changed while it is still ahead: strictly after today.
 * Today's boxes are already cut and on the road. Whether a Saturday that is
 * already sown for should still be skipped is the owner's call, so it is not
 * refused here; the screen says which Saturdays are locked.
 */

const WEEK_MS = 7 * DAY_MS;

const byDate = (a: SubscriptionDelivery, b: SubscriptionDelivery) => a.date.localeCompare(b.date);

/** The Saturdays still ahead of `now` — the ones a skip, pause or cancel may
 *  touch. */
export function changeableDeliveries(
  sub: Pick<Subscription, "deliveries">,
  now: Date = new Date(),
): SubscriptionDelivery[] {
  const today = istDateISO(now);
  return sub.deliveries.filter((d) => d.date > today).sort(byDate);
}

export type ScheduleChange = Pick<Subscription, "status" | "deliveries" | "skipped" | "held">;

/**
 * Skip one Saturday. The box is not lost: it moves to the Saturday after the
 * last one, on whatever rotation week that is, so the customer still gets
 * every box they paid for. Null when that Saturday cannot be skipped.
 */
export function skipDelivery(
  sub: Pick<Subscription, "status" | "deliveries" | "skipped" | "held">,
  date: string,
  now: Date = new Date(),
): ScheduleChange | null {
  if (sub.status !== "active") return null;
  if (!changeableDeliveries(sub, now).some((d) => d.date === date)) return null;
  const kept = sub.deliveries.filter((d) => d.date !== date).sort(byDate);
  const last = kept.at(-1)?.date ?? date;
  const added = new Date(fromIstDateISO(last).getTime() + WEEK_MS);
  return {
    status: "active",
    deliveries: [...kept, { date: istDateISO(added), week: rotationWeek(added) }],
    skipped: [...sub.skipped, date].sort(),
    held: 0,
  };
}

/** Pause: every Saturday still ahead comes off the calendar and is held.
 *  Null when there is nothing left to pause. */
export function pauseDeliveries(
  sub: Pick<Subscription, "status" | "deliveries" | "skipped" | "held">,
  now: Date = new Date(),
): ScheduleChange | null {
  if (sub.status !== "active") return null;
  const ahead = changeableDeliveries(sub, now);
  if (ahead.length === 0) return null;
  const today = istDateISO(now);
  return {
    status: "paused",
    deliveries: sub.deliveries.filter((d) => d.date <= today).sort(byDate),
    skipped: sub.skipped,
    held: ahead.length,
  };
}

/** Resume: the held boxes go back on the calendar from the first Saturday
 *  still open to new boxes (SPEC §5.3), each on its own rotation week. */
export function resumeDeliveries(
  sub: Pick<Subscription, "status" | "deliveries" | "skipped" | "held">,
  now: Date = new Date(),
): ScheduleChange | null {
  if (sub.status !== "paused" || sub.held <= 0) return null;
  const added = subscriptionSchedule(now, sub.held).map((b) => ({ date: istDateISO(b.date), week: b.week }));
  return {
    status: "active",
    deliveries: [...sub.deliveries, ...added].sort(byDate),
    skipped: sub.skipped,
    held: 0,
  };
}

/**
 * Cancel: the Saturdays still ahead are dropped, so what is left is what
 * was delivered. The refund, for however many boxes that leaves undelivered
 * (`undeliveredBoxes`), is made in the gateway's dashboard. Null once
 * expired or already cancelled.
 */
export function cancelDeliveries(
  sub: Pick<Subscription, "status" | "deliveries" | "skipped" | "held">,
  now: Date = new Date(),
): ScheduleChange | null {
  if (sub.status !== "active" && sub.status !== "paused") return null;
  if (sub.status === "active" && changeableDeliveries(sub, now).length === 0) return null;
  const today = istDateISO(now);
  return {
    status: "cancelled",
    deliveries: sub.deliveries.filter((d) => d.date <= today).sort(byDate),
    skipped: sub.skipped,
    held: 0,
  };
}

/** Saturdays not yet delivered — ahead on the calendar, or held by a pause.
 *  What a cancel leaves to refund, in Saturdays (each is `boxesPerWeek`
 *  boxes). */
export function undeliveredSaturdays(
  sub: Pick<Subscription, "status" | "deliveries" | "held">,
  now: Date = new Date(),
): number {
  return changeableDeliveries(sub, now).length + (sub.status === "paused" ? sub.held : 0);
}

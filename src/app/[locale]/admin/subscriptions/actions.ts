"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { err, type FormState } from "@/lib/forms";
import { listFilings } from "@/lib/repo/gst";
import { changeSubscriptionSchedule, getSubscription } from "@/lib/repo/subscriptions";
import { subscriptionOpening } from "@/lib/subscriptions/opening";
import { finishSubscriptionCreditNote, recordSubscriptionRefund } from "@/lib/subscriptions/refund";
import {
  cancelDeliveries,
  isSubscriptionId,
  pauseDeliveries,
  resumeDeliveries,
  skipDelivery,
  type ScheduleChange,
  type Subscription,
} from "@/lib/subscriptions/subscription";

/**
 * Skip, pause, resume and cancel a subscription — admin only (the owner, 27
 * Sep 2026) — and record the refund after a cancel (8 Nov 2026). A customer
 * asks on WhatsApp or by email; nothing here is reachable from the
 * customer's screens. What each move does to the calendar is decided in
 * `subscription.ts`, and the refund's credit note in `refund.ts`; these only
 * load, check and write.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function change(
  fd: FormData,
  decide: (sub: Subscription, now: Date, open: Date) => ScheduleChange | null,
): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isSubscriptionId(id)) throw new Error("Bad subscription request");
  const sub = await getSubscription(id);
  if (!sub) throw new Error(`No subscription ${id}`);

  const now = new Date();
  const next = decide(sub, now, (await subscriptionOpening(now)).first);
  if (!next) throw new Error(`That change is not possible for ${id} as it stands`);
  /* False means someone else changed it first; the refreshed page shows the
     result, and the operator can decide again from there. */
  await changeSubscriptionSchedule(sub, next);

  revalidatePath("/[locale]/admin/subscriptions", "page");
  revalidatePath(`/[locale]/admin/subscriptions/${id}`, "page");
  revalidatePath("/[locale]/account/subscriptions", "page");
}

/** A typed rupee amount in paise — `600`, `1,199.50`, `₹600` — or null for
 *  anything else, including more than two decimals. */
function rupeesToPaise(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/**
 * Record the refund made in the gateway's dashboard for a cancelled
 * subscription — the amount, in rupees — and issue its credit note
 * (`recordSubscriptionRefund`, 8 Nov 2026). Nothing is sent to the gateway
 * from here. A second press, or a second tab, finds the refund recorded and
 * does nothing; the refreshed page shows the one note issued.
 */
export async function recordRefund(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isSubscriptionId(id)) return err("refused");
  const sub = await getSubscription(id);
  if (!sub) return err("refused");
  const amount = rupeesToPaise(fd.get("amount"));
  if (amount === null || amount <= 0) return err("amountInvalid", "amount");

  const outcome = await recordSubscriptionRefund(sub, amount, await listFilings());
  revalidateRefund(id);
  switch (outcome) {
    case "issued":
    case "taken":
      return { status: "saved" };
    case "badAmount":
      return err("amountTooHigh", "amount");
    case "locked":
      return err("locked");
    case "running":
    case "refused":
      return err("refused");
  }
}

/** Issue the credit note a recorded refund still owes — its run died before
 *  the number was drawn (`finishSubscriptionCreditNote`). Does nothing while
 *  another press holds a fresh lease; the refreshed page says so. */
export async function finishCreditNote(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isSubscriptionId(id)) throw new Error("Bad credit note request");
  const sub = await getSubscription(id);
  if (!sub) throw new Error(`No subscription ${id}`);
  await finishSubscriptionCreditNote(sub, await listFilings());
  revalidateRefund(id);
}

/** A credit note changes the subscription's page and the GST returns. */
function revalidateRefund(id: string) {
  revalidatePath(`/[locale]/admin/subscriptions/${id}`, "page");
  revalidatePath("/[locale]/admin/gst", "page");
}

export async function skipSaturday(fd: FormData): Promise<void> {
  const date = String(fd.get("date") ?? "");
  if (!ISO_DATE.test(date)) throw new Error("Bad date");
  await change(fd, (sub, now, open) => skipDelivery(sub, date, now, open));
}

export async function pauseSubscription(fd: FormData): Promise<void> {
  await change(fd, pauseDeliveries);
}

export async function resumeSubscription(fd: FormData): Promise<void> {
  await change(fd, (sub, _now, open) => resumeDeliveries(sub, open));
}

export async function cancelSubscription(fd: FormData): Promise<void> {
  await change(fd, cancelDeliveries);
}

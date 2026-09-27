"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { changeSubscriptionSchedule, getSubscription } from "@/lib/repo/subscriptions";
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
 * Sep 2026). A customer asks on WhatsApp or by email; nothing here is
 * reachable from the customer's screens. What each move does to the calendar
 * is decided in `subscription.ts`; these only load, check and write.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function change(
  fd: FormData,
  decide: (sub: Subscription, now: Date) => ScheduleChange | null,
): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "");
  if (!isSubscriptionId(id)) throw new Error("Bad subscription request");
  const sub = await getSubscription(id);
  if (!sub) throw new Error(`No subscription ${id}`);

  const next = decide(sub, new Date());
  if (!next) throw new Error(`That change is not possible for ${id} as it stands`);
  /* False means someone else changed it first; the refreshed page shows the
     result, and the operator can decide again from there. */
  await changeSubscriptionSchedule(sub, next);

  revalidatePath("/[locale]/admin/subscriptions", "page");
  revalidatePath(`/[locale]/admin/subscriptions/${id}`, "page");
  revalidatePath("/[locale]/account/subscriptions", "page");
}

export async function skipSaturday(fd: FormData): Promise<void> {
  const date = String(fd.get("date") ?? "");
  if (!ISO_DATE.test(date)) throw new Error("Bad date");
  await change(fd, (sub, now) => skipDelivery(sub, date, now));
}

export async function pauseSubscription(fd: FormData): Promise<void> {
  await change(fd, pauseDeliveries);
}

export async function resumeSubscription(fd: FormData): Promise<void> {
  await change(fd, resumeDeliveries);
}

export async function cancelSubscription(fd: FormData): Promise<void> {
  await change(fd, cancelDeliveries);
}

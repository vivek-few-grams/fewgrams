"use server";

import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { assertRole } from "@/lib/auth/guard";
import { addressSnapshot, PAYMENT_WINDOW_MINUTES } from "@/lib/orders/order";
import { paymentProvider } from "@/lib/payments";
import { checkDeliveryArea } from "@/lib/pincode/place";
import { getAddress, getProfile } from "@/lib/repo/profile";
import { createSubscription, setSubscriptionProviderOrderId } from "@/lib/repo/subscriptions";
import { istDateISO } from "@/lib/delivery-date";
import { subscribablePlans } from "@/lib/subscriptions/catalogue";
import { subscriptionSchedule } from "@/lib/subscriptions/rotation";
import {
  MAX_BOXES_PER_PLAN,
  newSubscriptionId,
  type Subscription,
  type SubscriptionLine,
} from "@/lib/subscriptions/subscription";
import type { CheckoutState } from "../checkout/state";
import { boxesField } from "./fields";

const fail = (code: string, values?: Record<string, string>): CheckoutState => ({
  status: "error",
  code,
  ...(values ? { values } : {}),
});

/**
 * Take a subscription and open a gateway session for it — SPEC §5, §9.2.
 *
 * The same rules as `startCheckout`, for the same reasons: **every figure is
 * recomputed here** from the plans as stored, the browser's total is used
 * only to refuse a price the customer was not shown, and the row is written
 * as `pending_payment` before the gateway is asked, so a gateway failure
 * leaves an unpaid row that expires rather than a payment we cannot match.
 *
 * Greens travel on the owner's own run, so the delivery-area check always
 * applies (SPEC §7). Delivery is included in the plan price.
 */
export async function startSubscription(_prev: CheckoutState, fd: FormData): Promise<CheckoutState> {
  const actor = await assertRole("customer");

  const provider = paymentProvider();
  if (!provider) return fail("paymentsClosed");

  const rawLocale = String(fd.get("locale") ?? "");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;

  const plans = await subscribablePlans(locale);
  const lines: SubscriptionLine[] = [];
  for (const { plan, text } of plans) {
    const boxes = Number(fd.get(boxesField(plan.contentKey)) ?? 0);
    if (!Number.isInteger(boxes) || boxes < 0 || boxes > MAX_BOXES_PER_PLAN) return fail("boxesInvalid");
    if (boxes === 0) continue;
    lines.push({
      planId: plan.id,
      planKey: plan.contentKey,
      name: text.name,
      boxes,
      monthlyPrice: plan.monthlyPrice!,
      lineTotal: boxes * plan.monthlyPrice!,
      gramsPerBox: plan.gramsPerBox,
    });
  }
  if (lines.length === 0) return fail("nothingChosen");

  const address = await getAddress(actor.userId, String(fd.get("addrId") ?? ""));
  if (!address) return fail("addressMissing");
  if (!(await checkDeliveryArea(address.pincode)).served) {
    return fail("pincodeNotServed", { pincode: address.pincode });
  }

  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (Number(fd.get("total")) !== total) return fail("priceChanged");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);
  const profile = await getProfile(actor.userId);

  const sub: Subscription = {
    id: newSubscriptionId(),
    userId: actor.userId,
    email: actor.email,
    status: "pending_payment",
    lines,
    total,
    deliveries: subscriptionSchedule(now).map((b) => ({ date: istDateISO(b.date), week: b.week })),
    address: addressSnapshot(address),
    locale,
    provider: provider.name,
    providerOrderId: null,
    receiptNo: null,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await createSubscription(sub);

  if (!process.env.AUTH_URL) throw new Error("AUTH_URL must be set to the app's public origin");
  const origin = new URL(process.env.AUTH_URL).origin;

  try {
    const created = await provider.createOrder({
      orderId: sub.id,
      amount: total,
      customer: {
        id: actor.userId,
        phone: address.phone,
        email: actor.email,
        name: profile?.name ?? address.recipient,
      },
      returnUrl: `${origin}/api/payments/return/${locale}`,
      notifyUrl: origin.startsWith("https://") ? `${origin}/api/payments/${provider.name}/webhook` : null,
      expiresAt,
    });
    await setSubscriptionProviderOrderId(sub.id, created.providerOrderId);
    return { status: "ready", orderId: sub.id, checkout: created.checkout };
  } catch (e) {
    console.error(`[payments] could not open a gateway order for ${sub.id}`, e);
    return fail("gatewayError");
  }
}

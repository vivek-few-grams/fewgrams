import { paymentProvider } from "@/lib/payments";
import type { GatewayName } from "@/lib/payments/provider";
import { isOrderId, isUnfinished } from "@/lib/orders/order";
import { settleOrder } from "@/lib/orders/settle";
import { isSubscriptionId } from "@/lib/subscriptions/subscription";
import { settleSubscription } from "@/lib/subscriptions/settle";

/**
 * A gateway's payment webhook — SPEC §9. Each gateway has its own URL,
 * `/api/payments/<gateway>/webhook`, and a delivery to the URL of a gateway
 * that is not the configured one is refused rather than checked with the
 * wrong secret.
 *
 * The signature is checked over the **raw** body before anything is parsed.
 * A verified webhook is then only a trigger: it names the order, and
 * `settleOrder` asks the gateway what actually happened (both vendors' own
 * rule — do not fulfil from the payload alone).
 *
 * Responses: 200 for anything handled or deliberately ignored, 401 for a
 * bad signature, 500 when settling failed, so that the gateway's retry gets
 * another go. Settling is idempotent, so a retry of an event already applied
 * changes nothing.
 *
 * **503 while the order is paid but its after-payment work is unfinished**
 * (8 Nov 2026). Until then a webhook that arrived while another run held the
 * lease was answered 200 — and if that run then died (the return page
 * swallows its own failure), no retry ever came and the order sat paid with
 * its stock untaken and possibly no invoice. A retry after the lease goes
 * stale finishes it (`settleOrder`). In the ordinary race the run finishes
 * in a second and the retry finds nothing to do.
 */
export async function handlePaymentWebhook(gateway: GatewayName, request: Request): Promise<Response> {
  const provider = paymentProvider();
  if (!provider || provider.name !== gateway) return new Response("payments not configured", { status: 503 });

  const raw = await request.text();
  if (!provider.verifyWebhook(raw, request.headers)) {
    return new Response("bad signature", { status: 401 });
  }

  const orderId = provider.webhookOrderId(raw);
  /* The dashboard's "test" ping and event types we do not act on. Not
     ours to retry, so acknowledged. */
  /* An order is `FG…` and a subscription `FS…`; the prefix is the only
     thing that says which one the gateway is talking about. */
  const isSub = Boolean(orderId && isSubscriptionId(orderId));
  if (!orderId || (!isOrderId(orderId) && !isSub)) return new Response("ignored", { status: 200 });

  let settled: Parameters<typeof isUnfinished>[0] | null;
  try {
    settled = isSub
      ? await settleSubscription(orderId, "webhook", provider)
      : await settleOrder(orderId, "webhook", provider);
  } catch (e) {
    console.error(`[payments] webhook settle failed for ${orderId}`, e);
    return new Response("settle failed", { status: 500 });
  }
  if (settled && isUnfinished(settled)) return new Response("still finishing", { status: 503 });
  return new Response("ok", { status: 200 });
}

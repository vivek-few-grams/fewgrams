import { paymentProvider } from "@/lib/payments";
import { isOrderId } from "@/lib/orders/order";
import { settleOrder } from "@/lib/orders/settle";

/**
 * Cashfree's payment webhook — SPEC §9. Configure it in the dashboard as
 * `https://<domain>/api/payments/cashfree/webhook`, version `2025-01-01`.
 *
 * The signature is checked over the **raw** body before anything is parsed.
 * A verified webhook is then only a trigger: it names the order, and
 * `settleOrder` asks the gateway what actually happened (the vendor's own
 * rule — do not fulfil from the payload alone).
 *
 * Responses: 200 for anything handled or deliberately ignored, 401 for a
 * bad signature, 500 when settling failed, so that Cashfree's retry (2, 10
 * and 30 minutes) gets another go. Settling is idempotent, so a retry of an
 * event already applied changes nothing.
 */
export async function POST(request: Request) {
  const provider = paymentProvider();
  if (!provider) return new Response("payments not configured", { status: 503 });

  const raw = await request.text();
  if (!provider.verifyWebhook(raw, request.headers)) {
    return new Response("bad signature", { status: 401 });
  }

  const orderId = provider.webhookOrderId(raw);
  /* The dashboard's "test" ping and event types we do not act on. Not
     ours to retry, so acknowledged. */
  if (!orderId || !isOrderId(orderId)) return new Response("ignored", { status: 200 });

  try {
    await settleOrder(orderId, "webhook");
  } catch (e) {
    console.error(`[payments] webhook settle failed for ${orderId}`, e);
    return new Response("settle failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

import { handlePaymentWebhook } from "@/lib/payments/webhook";

/**
 * Razorpay's payment webhook. Configure it in the dashboard (Accounts &
 * Settings → Webhooks) as `https://<domain>/api/payments/razorpay/webhook`
 * with the `payment.captured`, `payment.failed` and `order.paid` events, and
 * put the secret chosen there in `RAZORPAY_WEBHOOK_SECRET` — it is not the API
 * key secret. The handling is `handlePaymentWebhook`.
 */
export async function POST(request: Request) {
  return handlePaymentWebhook("razorpay", request);
}

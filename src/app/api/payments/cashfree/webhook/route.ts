import { handlePaymentWebhook } from "@/lib/payments/webhook";

/**
 * Cashfree's payment webhook. Configure it in the dashboard as
 * `https://<domain>/api/payments/cashfree/webhook`, version `2025-01-01`.
 * Retried at 2, 10 and 30 minutes. The handling is `handlePaymentWebhook`.
 */
export async function POST(request: Request) {
  return handlePaymentWebhook("cashfree", request);
}

import { brand } from "@/lib/brand";
import type { GatewayCheckout } from "@/lib/payments/provider";

/**
 * Open the gateway's own payment screen in the browser — SPEC §9.2.
 *
 * Resolves `"notCompleted"` when the screen was closed or could not open.
 * On success it never resolves: the page is being replaced by the return
 * route, and a promise left pending keeps the pay button in its pending state
 * until it is.
 *
 * "Not completed", never "failed": a payment may still be in flight, and the
 * return route and the webhook are what decide.
 *
 * Each vendor's script is loaded here, on submit, rather than at the top of
 * the page, so a visit to checkout does not load a third-party script.
 */
export async function openGateway(
  checkout: GatewayCheckout,
  /** Called the moment the gateway reports a payment, before the page starts
   *  leaving for the return route — which settles the order server to server
   *  and takes a few seconds, so the page shows it is working meanwhile. */
  onPaid?: () => void,
): Promise<"notCompleted"> {
  if (checkout.gateway === "cashfree") {
    const { load } = await import("@cashfreepayments/cashfree-js");
    const cashfree = await load({ mode: checkout.mode });
    if (!cashfree) return "notCompleted";
    const result = await cashfree.checkout({ paymentSessionId: checkout.sessionId, redirectTarget: "_self" });
    /* On success the redirect has already replaced the page. */
    return result.error ? "notCompleted" : new Promise<never>(() => {});
  }

  if (!(await loadRazorpay())) return "notCompleted";
  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amountPaise,
      currency: "INR",
      name: brand.name,
      prefill: {
        contact: checkout.prefill.contact,
        ...(checkout.prefill.email ? { email: checkout.prefill.email } : {}),
        ...(checkout.prefill.name ? { name: checkout.prefill.name } : {}),
      },
      /* The brand forest, so the screen reads as ours. */
      theme: { color: "#033923" },
      timeout: checkout.timeoutSeconds,
      /* The response carries a signature, deliberately not checked here or
         sent anywhere: the return route asks Razorpay itself. */
      handler: () => {
        onPaid?.();
        window.location.assign(checkout.returnUrl);
      },
      modal: { ondismiss: () => resolve("notCompleted") },
    });
    /* A failed attempt keeps the screen open for another try, so it is not
       an outcome here. */
    rzp.open();
  });
}

const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

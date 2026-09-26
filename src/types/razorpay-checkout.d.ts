/** Razorpay's `checkout.js` ships no types. This covers the options checkout
 *  passes and the one call it makes (razorpay.com/docs, 26 Sep 2026). */
type RazorpayCheckoutOptions = {
  key: string;
  order_id: string;
  /** Paise. */
  amount: number;
  currency: string;
  name: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  /** Seconds. */
  timeout?: number;
  handler?: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => { open(): void };
}

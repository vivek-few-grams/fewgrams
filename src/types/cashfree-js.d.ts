/** `@cashfreepayments/cashfree-js` ships no types. This covers the one call
 *  checkout makes. */
declare module "@cashfreepayments/cashfree-js" {
  type CheckoutResult = {
    error?: { message?: string; code?: string };
    redirect?: boolean;
    paymentDetails?: unknown;
  };
  type Cashfree = {
    checkout(options: {
      paymentSessionId: string;
      redirectTarget?: "_self" | "_blank" | "_top" | "_modal" | HTMLElement;
    }): Promise<CheckoutResult>;
  };
  /** Resolves to null on the server. */
  export function load(options: { mode: "sandbox" | "production" }): Promise<Cashfree | null>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { dropUnavailable } from "@/app/[locale]/cart/actions";

export type RemovedNotice = { heading: string; body: string };

/**
 * Takes lines that went off sale out of the cart cookie, and says once what
 * went (7 Nov 2026). The cart and checkout pages render it first inside the
 * same wrapper in every branch, with `notice` null when nothing is off sale.
 *
 * A page cannot write a cookie while it renders, so this asks the server to
 * (`dropUnavailable`) once it is on screen. Writing the cookie re-renders the
 * page without those lines, and `notice` arrives as null on that render —
 * the words are held in state from the first one, which a server action's
 * re-render keeps, so the customer still reads what was taken out. That is
 * also why the pages keep it at the same place in the tree whether or not
 * anything is left in the cart.
 *
 * The strings arrive translated (`removedNotice`), so this reads no messages.
 */
export function CartCleanup({ notice }: { notice: RemovedNotice | null }) {
  const [shown] = useState(notice);
  /* Once per mount, Strict Mode's second effect run included. */
  const asked = useRef(false);

  useEffect(() => {
    if (!notice || asked.current) return;
    asked.current = true;
    void dropUnavailable();
  }, [notice]);

  if (!shown) return null;
  return (
    <div className="mx-auto max-w-[1400px] px-6 pt-8 md:px-12 md:pt-10">
      <div role="status" className="rounded-2xl border border-terracotta/25 bg-terracotta/[0.04] p-5">
        <h2 className="font-display text-base font-semibold text-terracotta">{shown.heading}</h2>
        <p className="mt-1.5 font-body text-sm text-ink">{shown.body}</p>
      </div>
    </div>
  );
}

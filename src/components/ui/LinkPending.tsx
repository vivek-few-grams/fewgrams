"use client";

import type { CSSProperties } from "react";
import { useLinkStatus } from "next/link";

/**
 * A card's own loading state while the page it links to is on its way (the
 * owner, 20 Oct 2026: "when i click on any of this, there should be some sort
 * of loading state"). A forest disc opens from the middle of the card — the
 * navigation curtain's circle (SPEC §17.5), at the size of the one thing that
 * was pressed — carrying a cream spinner.
 *
 * **Not the full-screen curtain.** That one is for changing section, from the
 * header only; on the way into a page from a card it was a 1.2 second toll on
 * browsing (the owner, 17 Sep 2026; `curtain-anchor.ts`). This is shown only
 * while the page is actually late, and costs nothing when it is not.
 *
 * Place it **inside a `Link`**, in a box that is `position: relative` — it
 * covers that box (`absolute`, the box's own corners). `useLinkStatus` reads
 * the link it sits in, and is false whenever the route was already prefetched,
 * so a quick page never shows it. It waits 120ms before opening as well
 * (`.link-pending` in globals.css), so one that lands at once never flashes.
 * Always rendered and shown by CSS, so nothing in the card moves when it
 * appears.
 *
 * Decorative: the browser does not announce a client navigation either, and
 * text here would change the link's name while it was pending.
 */
export function LinkPending({ spinner = 36, className = "" }: { spinner?: number; className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? "" : undefined}
      className={`link-pending pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-forest/90 ${className}`}
    >
      <span
        style={{ "--spinner": `${spinner}px` } as CSSProperties}
        className="size-(--spinner) rounded-full border-2 border-cream/25 border-t-cream motion-safe:animate-spin"
      />
    </span>
  );
}

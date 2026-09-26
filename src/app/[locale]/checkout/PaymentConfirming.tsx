"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/** A leaf, base at the origin, pointing up. */
const LEAF = "M0 0 C-6 -5 -7 -14 0 -22 C7 -14 6 -5 0 0 Z";

/** Where each sprout stands in the tray, how tall it grows and when it starts. */
const SPROUTS = [
  { x: 44, h: 34, delay: 0 },
  { x: 62, h: 44, delay: 0.18 },
  { x: 80, h: 38, delay: 0.36 },
  { x: 98, h: 46, delay: 0.54 },
  { x: 116, h: 36, delay: 0.72 },
] as const;

/**
 * The screen between a successful payment and the order's confirmation page
 * (the owner, 26 Sep 2026: the checkout sat unchanged for 3–4 seconds while
 * the return route settled the order with the gateway).
 *
 * Shown from the gateway's success callback until the confirmation page
 * replaces the document, so it needs no way out and no timeout of its own: a
 * navigation that fails leaves the browser's own error page, not this one.
 *
 * Portalled to `<body>`: `<main>` is `isolate`, so anything inside it, at
 * any z-index, stays under the sticky header.
 *
 * A tray of sprouts coming up one after another and opening their leaves, on
 * a loop. The motion is CSS, under "Payment confirming" in `globals.css`, and
 * only under `prefers-reduced-motion: no-preference`; otherwise the tray
 * stands grown. `role="status"` so a screen reader announces the words.
 */
export function PaymentConfirming({ title, body }: { title: string; body: string }) {
  /* Nothing behind it should scroll or take a click while the page leaves. */
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div role="status" aria-live="assertive" className="fixed inset-0 z-[90] grid place-items-center bg-cream px-6">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="grid size-56 place-items-center rounded-full bg-sage/20">
          <svg aria-hidden viewBox="20 -8 120 92" className="confirm-tray w-44" focusable="false">
            <ellipse cx="80" cy="80" rx="58" ry="3.5" className="fill-forest/10" />
            {SPROUTS.map(({ x, h, delay }) => (
              <g key={x} className="confirm-sprout" style={{ animationDelay: `${delay}s` }}>
                <path
                  d={`M${x} 66 C${x - 2} ${66 - h / 2} ${x + 2} ${66 - h / 1.4} ${x} ${66 - h}`}
                  className="stroke-forest"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
                <g transform={`translate(${x} ${66 - h})`}>
                  <g className="confirm-leaf confirm-leaf--l" style={{ animationDelay: `${delay}s` }}>
                    <path
                      d={LEAF}
                      transform="rotate(-55) scale(0.85)"
                      className="fill-sage stroke-forest"
                      strokeWidth="1.5"
                    />
                  </g>
                  <g className="confirm-leaf confirm-leaf--r" style={{ animationDelay: `${delay}s` }}>
                    <path
                      d={LEAF}
                      transform="rotate(55) scale(0.85)"
                      className="fill-sage stroke-forest"
                      strokeWidth="1.5"
                    />
                  </g>
                </g>
              </g>
            ))}
            <rect x="30" y="62" width="100" height="8" rx="2" className="fill-bark" />
            <rect x="26" y="67" width="108" height="12" rx="3" className="fill-ink" />
          </svg>
        </span>

        <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">{title}</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-stone">{body}</p>
        <span aria-hidden className="mt-5 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="confirm-dot size-1.5 rounded-full bg-forest"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
      </div>
    </div>,
    document.body,
  );
}

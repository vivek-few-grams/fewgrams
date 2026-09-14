"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { NAV_CATEGORIES, t, type Variety } from "@/lib/types";
import { Sprout } from "@/components/ui/Sprout";

/**
 * The two-level PRODUCTS overlay — SPEC §18.2. RipePlanet pattern: full-bleed
 * forest, oversized Quicksand, with a quiet secondary column on the right.
 *
 * Level 2 shows grow days on every variety block. Per SPEC §18.2 this is the
 * cheapest fix for the biggest expectation problem in the model — it tells the
 * visitor this is not next-day delivery before they reach a product page.
 */
export function ProductsOverlay({
  onClose,
  varieties,
}: {
  onClose: () => void;
  varieties: Variety[];
}) {
  const [level, setLevel] = useState<1 | 2>(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (level === 2) setLevel(1);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [level, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Products"
      className="fixed inset-0 z-[80] overflow-y-auto bg-forest text-cream"
    >
      {/* Leaf-vein texture — plays the role RipePlanet's contour lines do */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="veins" width="220" height="220" patternUnits="userSpaceOnUse">
            <path
              d="M0 110 Q55 60 110 110 T220 110 M110 0 Q60 55 110 110 T110 220"
              fill="none"
              stroke="#FBF9F3"
              strokeWidth="1.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#veins)" />
      </svg>

      <div className="relative mx-auto flex min-h-full max-w-[1400px] flex-col px-6 py-6 md:px-12">
        <div className="flex items-center justify-between">
          {level === 1 ? (
            <span className="font-display text-lg font-bold tracking-tight">{brand.name}</span>
          ) : (
            <button
              onClick={() => setLevel(1)}
              className="flex items-center gap-2 font-body text-sm uppercase tracking-widest text-mint transition-colors hover:text-cream"
            >
              <ArrowLeft size={16} strokeWidth={1.5} /> Back
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-11 place-items-center rounded-full transition-colors hover:bg-forest-deep"
          >
            <X size={26} strokeWidth={1.5} />
          </button>
        </div>

        {level === 1 ? (
          <div className="grid flex-1 grid-cols-1 gap-12 py-12 md:grid-cols-[1.6fr_1fr] md:py-20">
            <nav>
              <ul>
                {NAV_CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <button
                      onClick={() => (c.slug === "microgreens" ? setLevel(2) : onClose())}
                      className="group flex w-full items-baseline gap-5 py-1.5 text-left"
                    >
                      <span className="font-display text-[clamp(2.4rem,7vw,5rem)] font-bold uppercase leading-[1.02] tracking-tight transition-colors group-hover:text-sage">
                        {c.label}
                      </span>
                      {c.slug === "microgreens" && varieties.length > 0 && (
                        <span className="hidden font-body text-xs text-mint/60 md:inline">
                          {varieties.length} varieties
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-14 max-w-xs">
                <p className="group cursor-pointer font-body text-sm text-mint">
                  <span className="group-hover:hidden">Like our website?</span>
                  <span className="hidden group-hover:inline text-sage">
                    We can build one for you →
                  </span>
                </p>
              </div>
            </nav>

            <div className="flex flex-col gap-8 font-body text-sm md:items-end md:text-right">
              <ul className="space-y-2.5">
                {[
                  ["Our story", "/story"],
                  ["How we grow", "/how-we-grow"],
                  ["Recipes", "/recipes"],
                  ["FAQ", "/faq"],
                  ["Contact", "/contact"],
                  ["Account", "/account"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-mint transition-colors hover:text-cream">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5 text-mint/70">
                <p className="uppercase tracking-widest text-[11px] text-sage">Get in touch</p>
                <p>{brand.instagram}</p>
                <p>{brand.email}</p>
                <p>{brand.city}</p>
                <p>{brand.fssai ? `FSSAI ${brand.fssai}` : "FSSAI registration pending"}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 py-10 md:py-14">
            <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-bold uppercase tracking-tight">
              Microgreens
            </h2>
            <p className="mt-3 max-w-xl font-body text-sm text-mint">
              Grown to order. The number under each is the days from sowing to your
              door, so you know when it can arrive.
            </p>

            {varieties.length === 0 && (
              <p className="mt-10 rounded-2xl border border-dashed border-mint/30 p-6 font-body text-sm text-mint/70">
                No varieties yet. Add them in{" "}
                <Link href="/admin/varieties" className="underline underline-offset-4">
                  admin → varieties
                </Link>
                .
              </p>
            )}

            <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-9 md:grid-cols-4">
              {varieties.map((v, i) => (
                <li key={v.slug}>
                  <Link href={`/microgreens/${v.slug}`} onClick={onClose} className="group block">
                    <div className="mcard flex aspect-square items-center justify-center bg-forest-deep">
                      <div className="mcard__marquee text-sage/25" aria-hidden="true">
                        <div className="mcard__marquee-inner">
                          <div className="px-2">
                            <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                              {t(v.name)}
                            </span>
                            <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                              {t(v.name)}
                            </span>
                          </div>
                          <div className="px-2">
                            <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                              {t(v.name)}
                            </span>
                            <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                              {t(v.name)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mcard__media w-[62%]">
                        <Sprout className="h-full w-full" stroke="#A8CF8E" seed={i} />
                      </div>
                    </div>
                    <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide transition-colors group-hover:text-sage">
                      {t(v.name)}
                    </p>
                    <p className="font-body text-xs text-mint/70">{v.growDays} days</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

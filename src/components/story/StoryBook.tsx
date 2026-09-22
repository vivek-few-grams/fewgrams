"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StoryPage } from "@/lib/content/story";
import { StoryFace } from "./StoryFace";

/**
 * `/how-we-grow` — the storybook. SPEC §18.5.
 *
 * ## Two modes, and the plain one is the default
 *
 * The server renders the **stack**: thirteen pages in a column, no
 * transforms, no scroll handler. On mount, a wide viewport with no
 * reduced-motion preference is upgraded to the **book**, where scrolling
 * turns a page.
 *
 * That order matters, and it is the same call `Reveal` makes. If the book
 * were the server render, a visitor whose JavaScript never arrived would get
 * thirteen leaves stacked on top of one another with nothing to separate
 * them — the story would be one page long and the rest invisible. Building
 * the readable version first and enhancing it means the failure mode is "no
 * page-turn", not "no content". It is also the honest answer for a phone,
 * where a 3D spread is 400px of unreadable type, and for reduced motion,
 * where a page swinging through 180° is precisely what the preference asks us
 * not to do.
 *
 * ## How a sheet maps to a page
 *
 * A spread is **illustration on the left leaf, words on the right**. In a
 * bound book the two halves of one spread are not the two sides of one sheet
 * — the left page is the *back* of the sheet you have already turned. So:
 *
 * | Sheet `k` | front (right of spread `k`) | back (left of spread `k+1`) |
 * |---|---|---|
 * | 0 … n−2 | words of page `k` | illustration of page `k+1` |
 * | n−1 | words of the last page | blank — the inside back cover |
 *
 * and the illustration of page 0 has no sheet in front of it to be the back
 * of, so it sits on `.book__base` instead. Turning sheet `k` therefore sweeps
 * page `k+1`'s illustration onto the left exactly as page `k+1`'s words
 * arrive on the right, which is the whole trick: the two halves of a spread
 * come from different sheets and land together.
 *
 * The useful consequence is that **every face is unique**. An earlier cut put
 * a whole page on each leaf and repeated it on the back so it was still there
 * once turned; that doubled the DOM, doubled the images, and had to be hidden
 * from screen readers to stop the book being read out twice. Nothing here is
 * rendered more than once, and DOM order is reading order.
 *
 * ## Why the turn is not React state
 *
 * `--p` — sheets turned so far, fractional — is written straight onto the DOM
 * node inside a rAF, never through `setState`. At sixty frames a second a
 * state update would re-render thirteen leaves and their faces for a number
 * that only CSS ever reads (see the `.book__leaf` note in globals.css). What
 * *is* state is `index`, the spread currently facing the reader, and that
 * changes thirteen times in the life of the page rather than thousands.
 *
 * ## The rail
 *
 * The book is `sticky` inside a tall empty rail: one viewport of scrolling
 * per turn, plus one to read the last spread on. The scroll distance is the
 * book itself rather than a listener that hijacks the wheel — so the
 * scrollbar stays honest, `Home` / `End` / `Page Down` all work, and a
 * visitor who wants out simply keeps scrolling.
 */
export function StoryBook({ pages }: { pages: StoryPage[] }) {
  const t = useTranslations("story");
  const [book, setBook] = useState(false);
  const [index, setIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const leavesRef = useRef<HTMLDivElement>(null);

  /** Turns needed to get from the first spread to the last. */
  const turns = Math.max(pages.length - 1, 0);

  /* "3 / 13", printed on the paper. Formatted here because `StoryFace` has
     no translator of its own, and bare placeholders because a page index is
     an ordinal rather than a quantity — there is no grouping for `Intl` to
     apply, and the typed-placeholder rule in CLAUDE.md is about money and
     weight. */
  const folioFor = (i: number) =>
    t("folio", { current: i + 1, total: pages.length });

  /* Both queries, re-evaluated on change rather than read once: a laptop that
     gets docked to a monitor crosses `lg` without a reload, and macOS flips
     the motion preference live when Reduce Motion is toggled. */
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setBook(wide.matches && !still.matches);

    apply();
    wide.addEventListener("change", apply);
    still.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      still.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (!book) return;
    const rail = railRef.current;
    const leaves = leavesRef.current;
    if (!rail || !leaves) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      /* How far into the rail we have scrolled, in viewports. Measured from
         the rail's own box rather than from `scrollY` minus a constant, so it
         stays correct when anything above it changes height — a wrapped nav
         on a narrow desktop, or the copy above growing by a line. */
      const travelled = -rail.getBoundingClientRect().top / window.innerHeight;
      const p = Math.min(Math.max(travelled, 0), turns);

      leaves.style.setProperty("--p", p.toFixed(4));
      /* Rounds, so the swap lands at the half-turn where the sheet is edge-on
         and the z-index inversion has nothing visible to invert. */
      setIndex((current) => (Math.round(p) === current ? current : Math.round(p)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [book, turns]);

  /** Scrolls the rail to the offset that leaves spread `k` facing the reader. */
  const goTo = useCallback(
    (k: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const top = rail.getBoundingClientRect().top + window.scrollY;
      const clamped = Math.min(Math.max(k, 0), turns);
      window.scrollTo({ top: top + clamped * window.innerHeight, behavior: "smooth" });
    },
    [turns],
  );

  if (pages.length === 0) {
    return (
      <p className="mx-auto max-w-xl px-6 py-24 text-center font-body text-sm text-stone">
        {t("empty")}
      </p>
    );
  }

  /* ── The stack: server render, phones, and reduced motion ───────────── */
  if (!book) {
    return (
      <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
        {pages.map((page, i) => (
          <div
            key={page.key}
            id={page.key}
            className="mb-6 overflow-hidden rounded-2xl border border-forest/10 shadow-sm"
          >
            <StoryFace
              page={page}
              folio={folioFor(i)}
              part="both"
              heading={i === 0 ? "h1" : "h2"}
              priority={i === 0}
            />
          </div>
        ))}
      </div>
    );
  }

  /* ── The book ───────────────────────────────────────────────────────── */
  return (
    <div ref={railRef} style={{ height: `${(turns + 1) * 100}svh` }}>
      {/* Edge to edge. The book was a 900px object floating in a 1440px
          window, which made a story page look like a widget; at full bleed
          the turn sweeps the whole screen and the spread is the only thing
          on it.

          `top-20` AND a height short by the same 5rem, not `top-0 h-svh` with
          padding: the site header is `sticky`, so it holds 80px of layout at
          the top of the page and the rail starts underneath it. A full-`svh`
          sticky pinned at `top-0` therefore begins 80px down and hangs 80px
          off the bottom of the screen, which cost the last line of every
          left-hand page. */}
      <div className="sticky top-20 h-[calc(100svh-5rem)]">
        <div
          role="group"
          aria-label={t("bookLabel")}
          className="book grid h-full w-full grid-cols-2"
        >
          <div className="book__base">
            <StoryFace
              page={pages[0]}
              folio={folioFor(0)}
              part="plate"
              priority
            />
          </div>

          <div
            ref={leavesRef}
            className="book__leaves"
            style={{ "--p": 0 } as CSSProperties}
          >
            {pages.map((page, k) => {
              const overleaf = pages[k + 1];
              return (
                <div
                  key={page.key}
                  className="book__leaf"
                  style={
                    {
                      "--k": k,
                      /* Before its turn the earliest sheet is on top of the
                         pile on the right; after it, the latest is on top of
                         the pile on the left. See the globals.css note for
                         why this cannot live in CSS. */
                      zIndex: k < index ? k : pages.length - k,
                    } as CSSProperties
                  }
                >
                  <div className="book__face">
                    <StoryFace
                      page={page}
                      folio={folioFor(k)}
                      part="text"
                      heading={k === 0 ? "h1" : "h2"}
                    />
                  </div>
                  {/* The last sheet has nothing after it, so its back is the
                      inside of the back cover — plain paper, and deliberately
                      not a repeat of anything. */}
                  <div className="book__face book__face--back">
                    {overleaf ? (
                      <StoryFace page={overleaf} folio={folioFor(k + 1)} part="plate" />
                    ) : (
                      <div aria-hidden="true" className="h-full w-full bg-sand" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The page number a visitor SEES is the folio printed on the paper,
            the way a book does it — there is no counter chrome any more. This
            is the same fact for anyone who cannot see the page, announced on
            each turn and nowhere in the layout.

            Bare placeholders: an index is an ordinal, not a quantity, so
            there is no grouping for `Intl` to apply — the typed-placeholder
            rule in CLAUDE.md is about money and weight. */}
        <p aria-live="polite" className="sr-only">
          {t("pageOf", { current: index + 1, total: pages.length })}
        </p>

        {/* Over the paper rather than under the book, because at full bleed
            there is no "under". Translucent cream so they stay legible on a
            forest page and on an illustration alike. */}
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={t("previous")}
          className="absolute left-5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-forest/15 bg-cream/85 text-forest shadow-md backdrop-blur-sm transition-colors hover:bg-forest hover:text-cream disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === turns}
          aria-label={t("next")}
          className="absolute right-5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-forest/15 bg-cream/85 text-forest shadow-md backdrop-blur-sm transition-colors hover:bg-forest hover:text-cream disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>

        {/* Only while it is still true. Once a page has been turned the
            visitor has worked the mechanism out, and a permanent instruction
            is one more thing on a screen that is now entirely book.
            `pointer-events-none` so it can never intercept a click meant for
            the paper underneath it. */}
        <p
          className={`pointer-events-none absolute inset-x-0 bottom-6 text-center font-body text-[11px] uppercase tracking-widest text-stone/70 transition-opacity duration-300 ${
            index === 0 ? "opacity-100" : "opacity-0"
          }`}
        >
          {t("hint")}
        </p>
      </div>
    </div>
  );
}

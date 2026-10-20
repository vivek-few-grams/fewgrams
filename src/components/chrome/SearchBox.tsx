"use client";

import type { CSSProperties } from "react";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, Leaf, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getPathname, Link, usePathname, useRouter } from "@/i18n/navigation";
import { SearchSprigs } from "@/components/search/SearchSprigs";
import { SearchStart } from "@/components/search/SearchStart";
import { SearchThumb } from "@/components/search/SearchThumb";
import { useTypewriter } from "@/components/search/useTypewriter";
import { entryId, type SearchEntry, type SearchList } from "@/lib/search/entry";
import { cleanQuery, MAX_QUERY_LENGTH, prepare, rank, type Prepared } from "@/lib/search/match";
import { TASTES } from "@/lib/search/tastes";

/**
 * The header's search — SPEC §27.2.
 *
 * A trigger in the header that opens a band under it: one input, and up to
 * five suggestions with a picture, the name and the kind, then "See all
 * results" into `/search`. The band, not a field in the bar, because the bar
 * is measured to fit at every width from 320px (SPEC §18.1) and a real field
 * in it would not.
 *
 * **Two triggers, one at a time** (the owner, 20 Oct 2026: the bare
 * magnifier was too easy to miss). The header renders this twice:
 * `variant="pill"` beside the logo from 1152px, a field-shaped button that
 * types out real product names; and
 * `variant="icon"` with the utilities below that, the magnifier in a dark
 * green circle so it stands out from the outline cart and account icons.
 * `className` sets each one's display, so CSS decides which is on screen;
 * anything that must happen once — the `/` shortcut, the pill's early fetch —
 * first checks that its own trigger is the one showing.
 *
 * **Without JavaScript it is a link to `/search`**, which has its own form.
 * Once hydrated the same spot becomes a button, so a screen reader hears what
 * it does: it opens something rather than going somewhere.
 *
 * **The list is fetched once and matched here**, on every keystroke, by the
 * same `rank` the results page uses — see `/api/search/[locale]`. Fetching
 * starts when the pointer or focus reaches the magnifier, so it has usually
 * landed by the time the band is open.
 *
 * The input is an ARIA 1.2 combobox: focus stays in it, arrows move the
 * highlighted option, Enter opens it (or the results page when nothing is
 * highlighted), Escape closes the band and puts focus back on the magnifier.
 *
 * **Made to feel grown, not listed** (the owner, 20 Oct 2026): suggestions
 * sprout in, the magnifier puts out a leaf while there is a query, the band's
 * bottom edge is a soil line drawn in as it opens, and the header pill types
 * real product names to try. Before anything is typed, and when a query finds
 * nothing, the band is never empty — taste chips and the most-ordered row
 * (`SearchStart`). All of it
 * stands still for a visitor who asks for reduced motion.
 */

/** How many suggestions — never more than five (the owner, 20 Oct 2026). At
 *  eight, "seeds" filled the band and pushed "See all results" out of sight;
 *  the rest are one tap away on `/search`. */
const SUGGESTIONS = 5;

/** Letters before suggesting anything. One letter starts half the catalogue. */
const MIN_LETTERS = 2;

/** The longest name the header pill types out: "Try “Red Cabbage”" fits its
 *  176px (208px from `xl`); "Try “Everyday Essentials”" did not. The band's
 *  own field is wide and types every name. */
const PILL_NAME_MAX = 12;

type List =
  | { locale: string; state: "loading" }
  | {
      locale: string;
      state: "ready";
      prepared: Prepared<SearchEntry>[];
      popular: SearchEntry[];
      ranked: boolean;
      examples: string[];
      seeds: SearchEntry[];
      seedsRanked: boolean;
      fetchedAt: number;
    }
  | { locale: string; state: "failed" };

/**
 * How long a fetched list is trusted — the route's own cache life. The box
 * outlives every client navigation, so without this a tab left open would go
 * on finding a category switched off in admin since (the owner, 20 Oct 2026:
 * a disabled category must not show up anywhere).
 */
const LIST_MAX_AGE_MS = 60_000;

/** One empty array, so the typewriter's input does not change identity on
 *  every render while the list is loading. */
const NO_NAMES: string[] = [];

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

/** True once hydrated, false on the server and during hydration — so the
 *  first client render matches the server's link. */
const noSubscription = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

export function SearchBox({
  variant,
  className,
}: {
  variant: "pill" | "icon";
  /** The trigger's `display` — `hidden min-[1152px]:flex` and so on. The
   *  trigger sets none of its own, or the two would fight. */
  className: string;
}) {
  const t = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [list, setList] = useState<List | null>(null);
  const fetching = useRef(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const panelId = `${id}-panel`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;

  /* Closed by any navigation — a suggestion, the back button, a link
     elsewhere — so it is never left open over the page it led to. Adjusted
     while rendering rather than in an effect, as React recommends for state
     that follows a prop. */
  const [openOn, setOpenOn] = useState(pathname);
  if (openOn !== pathname) {
    setOpenOn(pathname);
    setOpen(false);
    setActive(-1);
  }

  /* A list fetched for the other language does not count: the names are the
     visitor's, so switching language fetches again. */
  const current = list?.locale === locale ? list : null;
  const trimmed = cleanQuery(query);
  const searching = Array.from(trimmed).length >= MIN_LETTERS;
  /* Every match, for the count on "See all results"; the first five are
     shown. */
  const matches = useMemo(
    () => (searching && current?.state === "ready" ? rank(current.prepared, trimmed, locale) : []),
    [searching, current, trimmed, locale],
  );
  const hits = matches.slice(0, SUGGESTIONS);
  /* Only the chips that find something on sale now: with microgreens and
     seeds both switched off, "Peppery" would lead nowhere. */
  const tastes = useMemo(
    () =>
      current?.state === "ready"
        ? TASTES.filter((taste) => rank(current.prepared, t(`tastes.${taste}`), locale).length > 0)
        : [],
    [current, t, locale],
  );
  const examples = current?.state === "ready" ? current.examples : NO_NAMES;
  /* Types names into the pill while it is shut — the pill's whole job is to be
     noticed, and a name being typed is what a reader's eye goes to. Short
     names only: the pill is narrow, and "Try “Everyday Esse…”" being typed
     into an ellipsis reads as broken. */
  const pillExamples = useMemo(
    () => examples.filter((name) => Array.from(name).length <= PILL_NAME_MAX),
    [examples],
  );
  const pillTyped = useTypewriter(pillExamples, variant === "pill" && !open);
  /* The suggestions plus "See all results", which is an option like the rest
     so the arrows reach it. */
  const options = hits.length > 0 ? hits.length + 1 : 0;
  const resultsHref = `/search?q=${encodeURIComponent(trimmed)}`;

  function load() {
    const fresh = current?.state === "ready" && Date.now() - current.fetchedAt < LIST_MAX_AGE_MS;
    if (fresh || fetching.current) return;
    fetching.current = true;
    /* A stale list stays on screen until its replacement lands, so a refresh
       never flashes "loading"; only a first load shows it. */
    const shown = current?.state === "ready";
    if (!shown) setList({ locale, state: "loading" });
    fetch(`/api/search/${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error(`search list ${res.status}`);
        return res.json() as Promise<SearchList>;
      })
      .then(({ entries, popular, ranked, examples, seeds, seedsRanked }) => {
        const byId = new Map(entries.map((e) => [entryId(e), e]));
        setList({
          locale,
          state: "ready",
          prepared: prepare(entries),
          popular: popular.flatMap((id) => byId.get(id) ?? []),
          seeds: seeds.flatMap((id) => byId.get(id) ?? []),
          seedsRanked,
          ranked,
          examples,
          fetchedAt: Date.now(),
        });
      })
      .catch(() => {
        if (!shown) setList({ locale, state: "failed" });
      })
      .finally(() => {
        fetching.current = false;
      });
  }

  /**
   * Whether opening and closing should carry the pill down into the band and
   * back (the owner, 20 Oct 2026: "it should not show 2 inputs … or add
   * animation to move input to bottom"). A view transition in two layers,
   * each name worn by one element at a time: `search-pill` is the pill's
   * outline — the transition draws it, round at every width — and
   * `search-pill-content` is what is inside, which cross-fades within it
   * (globals.css). The live fields are never restyled for it, so when the
   * transition ends there is nothing to put back.
   *
   * Only for the pill, only with a mouse, and only for a visitor who has not
   * asked for less motion. The pointer test is not taste: a transition's
   * update runs a frame later, outside the tap, and iOS raises the keyboard
   * only for a focus made inside it — so an iPad wide enough for the pill
   * opens it the plain way. A browser without view transitions does the same.
   */
  function canMorph(): boolean {
    return (
      variant === "pill" &&
      typeof document.startViewTransition === "function" &&
      matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches
    );
  }

  /**
   * Runs a change of `open` as the pill's journey when it can, at once when
   * it cannot. `then` runs once the change is on screen — a transition's
   * update is a frame late, so a focus made straight after `morph` would find
   * no field yet, or a pill still hidden. `data-search-morph` scopes the
   * transition's page-wide CSS to this one, so it can never restyle another,
   * and says which way it goes — the outline ends in the colour of the pill
   * it lands as.
   */
  function morph(direction: "open" | "close", update: () => void, then?: () => void) {
    const apply = () => {
      flushSync(update);
      then?.();
    };
    if (!canMorph()) {
      apply();
      return;
    }
    const root = document.documentElement;
    root.dataset.searchMorph = direction;
    const transition = document.startViewTransition(apply);
    transition.finished.finally(() => delete root.dataset.searchMorph);
  }

  function openBand() {
    load();
    /* Rendered at once, so focus lands inside the tap itself — iOS raises the
       keyboard only for a focus made in the gesture (see `canMorph`). */
    morph(
      "open",
      () => setOpen(true),
      () => inputRef.current?.focus(),
    );
  }

  /** Escape, the close button or a second press of the pill: the pill
   *  travels back up. A press elsewhere on the page closes at once instead
   *  (`close`), because a transition would hold that press up mid-flight. */
  function closeBand(returnFocus: boolean) {
    morph(
      "close",
      () => {
        setOpen(false);
        setActive(-1);
      },
      () => {
        if (returnFocus) triggerRef.current?.focus();
      },
    );
  }

  /** Whether this instance's trigger is the one on screen — the header holds
   *  both variants and CSS hides one. */
  const showing = () => (triggerRef.current?.getClientRects().length ?? 0) > 0;

  /* `/` opens search from anywhere, as on most sites with a search field —
     unless the visitor is typing somewhere, when it is a slash. */
  const onSlash = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (open || !showing()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    e.preventDefault();
    openBand();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onSlash(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* The pill fetches the list once the page is idle, so it has names to type
     — but only the pill, and only when it is the trigger on screen: a phone
     still fetches nothing until somebody reaches for search. */
  const prefetch = useEffectEvent(() => {
    if (variant === "pill" && showing()) load();
  });
  useEffect(() => {
    if (!hydrated) return;
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(() => prefetch(), { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(() => prefetch(), 1500);
    return () => clearTimeout(handle);
  }, [hydrated]);

  function close(returnFocus: boolean) {
    setOpen(false);
    setActive(-1);
    if (returnFocus) triggerRef.current?.focus();
  }

  /** A suggestion was taken: the query has done its job. */
  function chosen() {
    setQuery("");
    close(false);
  }

  /** A taste chip types itself in, and focus goes back to the field so the
   *  arrows work on what it found. */
  function tryTaste(label: string) {
    setQuery(label);
    setActive(-1);
    inputRef.current?.focus();
  }

  /* Closed by a press or a focus anywhere outside the band and the magnifier
     — the second is what closes it when Tab walks out of it. */
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Node && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target);
    const dismiss = (e: Event) => {
      if (!outside(e.target)) return;
      setOpen(false);
      setActive(-1);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);

  /* From `lg`, where the corner sprigs show, the band keeps the tallest
     height it has reached while open (the owner, 20 Oct 2026: "retain the
     height of the entire search area"). Fitted to its content, it shrank with
     every keystroke — to the field alone after one letter, to one line on
     "Nothing matches" — and cropped the sprigs to stumps. Set on the element
     rather than through state, so holding the height costs no render; the
     band is a new element each time it opens, so nothing carries over. Never
     taller than the screen under the header, as the column is capped. */
  useEffect(() => {
    const band = panelRef.current;
    if (!open || !band) return;
    const wide = matchMedia("(min-width: 64rem)");
    let tallest = 0;
    const observer = new ResizeObserver(() => {
      if (!wide.matches) {
        tallest = 0;
        band.style.minHeight = "";
        return;
      }
      tallest = Math.max(tallest, band.offsetHeight);
      band.style.minHeight = `min(${tallest}px, calc(100dvh - 5.25rem))`;
    });
    observer.observe(band);
    return () => observer.disconnect();
  }, [open]);

  /* Keeps the highlighted option in view when the arrows move it past the
     edge of a scrolled list. */
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options > 0) {
      e.preventDefault();
      setActive((a) => (a + 1) % options);
    } else if (e.key === "ArrowUp" && options > 0) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? options - 1 : a - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeBand(true);
    } else if (e.key === "Enter" && active >= 0 && active < hits.length) {
      e.preventDefault();
      chosen();
      router.push(hits[active].href);
    }
    /* Enter with nothing highlighted, or on "See all results", falls through
       to the form's submit. */
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trimmed) return;
    close(false);
    router.push(resultsHref);
  }

  /* What each trigger looks like — the same whether it is the hydrated button
     or the link it is before hydration. */
  const triggerClass =
    variant === "pill"
      ? /* `invisible` while the band is open, so there is one field on screen,
           not two — and it keeps its place, so nothing in the bar shifts. */
        `h-10 w-44 items-center gap-2.5 rounded-full border border-forest/20 bg-cream px-3.5 text-left transition-colors hover:border-forest xl:w-52 2xl:w-56 ${open ? "invisible" : ""} ${className}`
      : /* 32px, not 36: on a phone the logo (64px) sets the bar's height, and
           a 36px circle made the icon row plus the nav row taller than it —
           the bar grew from 65px to 67px (SPEC §18.1). */
        `size-8 items-center justify-center rounded-full bg-forest text-cream transition-colors hover:bg-forest-deep ${className}`;
  const triggerBody =
    variant === "pill" ? (
      /* The inside of the pill, as one layer for the journey into the band
         — see `canMorph`. */
      <span
        style={!open ? { viewTransitionName: "search-pill-content" } : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-forest" />
        {/* Decoration: the button's name is its `aria-label`. */}
        <span aria-hidden="true" className="min-w-0 flex-1 truncate font-body text-sm text-stone">
          {/* Its own, shorter phrasing: the band's "“…” ಹುಡುಕಿ ನೋಡಿ" did
              not fit the pill in Kannada at 176px even around a short
              name. `!== null`, not truthiness: between two names the typed
              text is empty for a moment, and falling back to the label then
              flicked the whole pill to "Search the shop" and back every
              cycle (the owner, 20 Oct 2026: "the input is blinking"). The
              label shows only until the first name starts. */}
          {pillTyped !== null ? t("box.pillTry", { name: pillTyped }) : t("box.label")}
        </span>
      </span>
    ) : (
      <Search size={16} strokeWidth={1.75} aria-hidden="true" />
    );
  const message = (text: string, link?: React.ReactNode) => (
    <p className="mt-3 px-2 font-body text-xs text-stone">
      {text}
      {link && <> {link}</>}
    </p>
  );

  return (
    <>
      {hydrated ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("box.open")}
          aria-keyshortcuts="/"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onPointerEnter={load}
          onFocus={load}
          onClick={() => (open ? closeBand(false) : openBand())}
          /* Named only while shut: the band's pill takes the name while it
             is open, and a name may be worn by one element at a time. */
          style={variant === "pill" && !open ? { viewTransitionName: "search-pill" } : undefined}
          className={triggerClass}
        >
          {triggerBody}
        </button>
      ) : (
        <Link href="/search" aria-label={t("box.open")} className={triggerClass}>
          {triggerBody}
        </Link>
      )}

      {open && (
        /* Everything under the band, dimmed and softened while it is open
           (the owner, 20 Oct 2026: the hero slideshow kept moving below it).
           A height of its own can never be enough, since what shows below
           depends on the screen. Behind the band, which is drawn after it;
           a press on it closes the band like any press outside. */
        <div
          aria-hidden="true"
          className="search-scrim absolute inset-x-0 top-full h-dvh bg-forest-deep/25 backdrop-blur-[3px]"
        />
      )}

      {open && (
        /* Positioned against the sticky `<header>`, the nearest positioned
           ancestor, so it spans the full width directly under the bar on
           every screen. `overflow-clip` is the edge the corner sprigs grow
           out of, and it keeps them off the header and out of a sideways
           scrollbar — `clip`, not `hidden`, which would make the band a
           scroll container. `isolate` so the sprigs' `-z-10` puts them behind
           the content but still on the band's white. */
        <div
          ref={panelRef}
          id={panelId}
          className="absolute inset-x-0 top-full isolate overflow-clip bg-white shadow-[0_16px_32px_-20px_rgba(3,57,35,0.35)]"
        >
          <SearchSprigs />
          {/* Never taller than the screen under the header (65px, 81px from
              `md`): the header is sticky, so a band running past the bottom
              of a phone left its last row out of reach — the page scrolled
              beneath it instead. The column scrolls, not the band, so the
              corner sprigs never add scroll room of their own. */}
          <form
            role="search"
            action={getPathname({ href: "/search", locale })}
            onSubmit={onSubmit}
            className="mx-auto max-h-[calc(100dvh-4.25rem)] max-w-2xl overflow-y-auto overscroll-contain px-6 py-4 md:max-h-[calc(100dvh-5.25rem)] md:px-0"
          >
            {/* Focus is shown by the pill's own border going forest, not by
                an outline: the base `:focus-visible` outline sat 2px outside
                the border and read as a second ring (the owner, 20 Oct 2026). */}
            <div
              /* The header pill arrives here — see `canMorph`. */
              style={variant === "pill" ? { viewTransitionName: "search-pill" } : undefined}
              className="flex items-center gap-3 rounded-full border border-forest/20 bg-cream px-4 transition-colors focus-within:border-forest"
            >
              {/* The inside of the field, as one layer for the pill's journey
                  — the outline around it is drawn by the transition. */}
              <div
                style={variant === "pill" ? { viewTransitionName: "search-pill-content" } : undefined}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {/* The magnifier puts out a leaf while there is a query. */}
                <span aria-hidden="true" className="relative shrink-0 text-stone">
                  <Search size={18} strokeWidth={1.5} />
                  <Leaf
                    size={11}
                    strokeWidth={2}
                    data-out={trimmed ? "" : undefined}
                    className="search-leaf absolute -right-1.5 -top-2 fill-sage text-forest"
                  />
                </span>
                <input
                  ref={inputRef}
                  type="search"
                  name="q"
                  role="combobox"
                  aria-label={t("box.label")}
                  aria-expanded={options > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  /* A still placeholder, never a typed one. The field has the
                     caret from the moment the band opens, and names typing
                     beside a blinking caret read as the field flickering
                     (the owner, 20 Oct 2026); the names type in the pill,
                     which has no caret, and the chips and tiles below
                     suggest the rest. */
                  placeholder={t("box.placeholder")}
                  value={query}
                  maxLength={MAX_QUERY_LENGTH}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(-1);
                  }}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="h-11 min-w-0 flex-1 bg-transparent font-body text-sm text-forest outline-none placeholder:text-stone/70 focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label={t("box.close")}
                  onClick={() => closeBand(true)}
                  className="shrink-0 text-forest transition-colors hover:text-stone"
                >
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Always in the DOM, so the input's `aria-controls` never names
                an element that is not there. */}
            <ul
              role="listbox"
              id={listId}
              aria-label={t("box.label")}
              hidden={options === 0}
              className="mt-3 max-h-[min(60vh,30rem)] overflow-y-auto"
            >
              {hits.map((hit, i) => (
                <li
                  key={entryId(hit)}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => active !== i && setActive(i)}
                  style={stagger(i)}
                  className="search-sprout"
                >
                  {/* A real link, so a middle click opens a tab. Out of the
                      tab order: in a combobox focus stays in the input. */}
                  <Link
                    href={hit.href}
                    tabIndex={-1}
                    onClick={chosen}
                    className={`flex items-center gap-3 rounded-xl p-2 transition-colors ${
                      i === active ? "bg-sand" : ""
                    }`}
                  >
                    <span className="search-shoot block">
                      <SearchThumb kind={hit.kind} image={hit.image} size={48} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-body text-sm font-semibold text-forest">
                        {hit.name}
                      </span>
                      <span className="block font-body text-xs text-stone">{t(`kinds.${hit.kind}`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {hits.length > 0 && (
                <li
                  id={optionId(hits.length)}
                  role="option"
                  aria-selected={active === hits.length}
                  onMouseMove={() => active !== hits.length && setActive(hits.length)}
                  style={stagger(hits.length)}
                  /* Pinned to the bottom of the list, so it is always the
                     last thing in sight even when a short phone screen with
                     the keyboard up makes the list scroll. */
                  className="search-sprout sticky bottom-0 mt-1 border-t border-forest/10 bg-white pt-1"
                >
                  <Link
                    href={resultsHref}
                    tabIndex={-1}
                    onClick={() => close(false)}
                    className={`flex items-center justify-between gap-3 rounded-xl px-2 py-3 font-body text-sm font-semibold text-forest transition-colors ${
                      active === hits.length ? "bg-sand" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {t("box.seeAll", { count: matches.length, query: trimmed })}
                    </span>
                    <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                  </Link>
                </li>
              )}
            </ul>

            {searching &&
              (current?.state === "failed"
                ? message(t("box.failed"))
                : current?.state !== "ready"
                  ? message(t("box.loading"))
                  : hits.length === 0 &&
                    message(
                      t("box.none", { query: trimmed }),
                      <Link
                        href="/shop"
                        onClick={() => close(false)}
                        className="text-forest underline underline-offset-4 transition-colors hover:text-stone"
                      >
                        {t("box.noneLink")}
                      </Link>,
                    ))}

            {/* Until there are suggestions, and under "Nothing matches" too:
                the band holds its height (see the effect above), so a query
                that finds nothing would otherwise leave a tall empty band. In
                one place in the tree, so a first letter or a miss does not
                sprout it all again. */}
            {(!searching || (current?.state === "ready" && hits.length === 0)) && (
              <SearchStart
                tastes={tastes}
                popular={
                  current?.state === "ready" ? current.popular : current?.state === "failed" ? [] : "loading"
                }
                ranked={current?.state === "ready" && current.ranked}
                seeds={
                  current?.state === "ready" ? current.seeds : current?.state === "failed" ? [] : "loading"
                }
                seedsRanked={current?.state === "ready" && current.seedsRanked}
                onTaste={tryTaste}
                onPick={chosen}
              />
            )}

            {/* Read out as the count changes, so a screen reader knows the
                list moved without being sent into it. */}
            <p role="status" className="sr-only">
              {searching && current?.state === "ready" ? t("box.status", { count: hits.length }) : ""}
            </p>
          </form>
          {/* The soil line: the band's bottom edge, drawn in as it opens.
              Pinned there, as the band can be taller than the column. */}
          <div aria-hidden="true" className="search-soil absolute inset-x-0 bottom-0 h-0.5 bg-tan" />
        </div>
      )}
    </>
  );
}

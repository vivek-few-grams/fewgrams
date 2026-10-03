"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  ShoppingBag,
  Sparkles,
  ChevronsDown,
  ChevronsRight,
  Sprout,
  Sun,
  Plus,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { RecommendedBadge } from "@/components/catalogue/RecommendedBadge";
import { TrayPlayStage } from "@/components/tray-play/TrayPlayStage";
import type { TrayAnchor } from "@/components/tray-play/scene";
import {
  HOME_ROW,
  LOOK_KEYS,
  TRAY_FINISH_KEYS,
  isLook,
  isTrayFinish,
  type HomeLook,
  type Look,
  type TrayFinish,
} from "@/components/tray-play/kinds";
import { setCartQuantity } from "@/app/[locale]/cart/actions";
import { IDLE } from "@/lib/forms";
import { GardenStage } from "./GardenStage";
import type { GardenScene } from "./scene";
import {
  STEPS,
  nextStep,
  stepFrom,
  type BenchStep,
  type StepId,
} from "./steps";
import {
  DARK_DAYS,
  DARK_SHARE_TALL,
  STEEP_SECONDS,
  type Anchor,
  type Phase,
  type Target,
} from "./targets";
import type { GardenLink, GardenProduct, GardenShelf } from "./types";

/**
 * The play garden — SPEC §25. **The stage is the page** (the owner, 1 Oct
 * 2026: "clean, and focus only on the items we are going to work with"): it
 * fills the screen under the header, and everything else is a thin layer on
 * top of it —
 *
 * - top: the step's name and the step dots;
 * - on the bench: a short label on whatever to reach for next, which the
 *   scene highlights (a ring and a bob) and moves the label with;
 * - bottom: the product just picked up or used, as a small card with the
 *   cart's own quick add, and Back / Next.
 *
 * No paragraphs. What a step is about is shown by the bench, and the one
 * sentence a step has is its "well done" line when it is finished.
 *
 * **The step, the tray and the seed live in the URL** (`?step=sow&tray=…
 * &greens=…`), pushed with `history.pushState`: a step change is a pose of a
 * scene already on screen, not a new server render, and browser Back still
 * goes back a step.
 *
 * **Next waits for the step to be done**, and there is no Back or Skip
 * button (the owner, 2 Oct 2026) — the step dots still jump anywhere and
 * browser Back still steps back. "Do it for me" plays
 * a step through the same handlers a hand uses, and every label is a real
 * button, so the keyboard route is the real one. Without the live scene (no
 * WebGL, reduced motion) each step is a still and Next is always open.
 *
 * **What is sold is what the shop sells.** Every product comes from
 * `page.tsx`, priced from DynamoDB; anything not on sale arrives as `null`.
 */
/** How long after a step is finished the next begins — short, so the
 *  tray landing and the next tools dropping read as one move. */
const AUTO_NEXT_MS = 800;
/** How long "well done" stays into the next step: until its tools land. */
const CHEER_AFTER_MS = 1600;

type Progress = { step: StepId; progress: number; phase: Phase | null };

export function GardenJourney({
  shelf,
  initial,
}: {
  shelf: GardenShelf;
  initial: { step: StepId; tray: TrayFinish; greens: Look };
}) {
  const t = useTranslations("garden");
  const home = useTranslations("home.trayPlay");
  const [step, setStepState] = useState<StepId>(initial.step);
  const [finish, setFinish] = useState<TrayFinish>(initial.tray);
  const [look, setLook] = useState<Look>(initial.greens);
  const [live, setLive] = useState(false);
  /* The scene will not run, and the stills are the garden. Neither this
     nor `live` while it loads. */
  const [stills, setStills] = useState(false);
  /* The wall under the herb shelf is in view, whole, for the framed ad. */
  const [wall, setWall] = useState(false);
  const [traysLive, setTraysLive] = useState(false);
  const [hover, setHover] = useState<Target | null>(null);
  const [state, setState] = useState<Progress>({
    step: initial.step,
    progress: 0,
    phase: null,
  });
  const sceneRef = useRef<GardenScene | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(81);

  /* The stage fills the screen under the sticky header, whatever its height
     (it gains a row on a phone). */
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () => setHeaderH(header.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  /* ---- the URL ---- */
  const write = useCallback(
    (next: { step: StepId; tray: TrayFinish; greens: Look }, push: boolean) => {
      const q = new URLSearchParams(window.location.search);
      q.set("step", next.step);
      q.set("tray", next.tray);
      q.set("greens", next.greens);
      const url = `${window.location.pathname}?${q}`;
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [],
  );

  const go = useCallback(
    (next: StepId) => {
      setStepState(next);
      setState({ step: next, progress: 0, phase: null });
      setHover(null);
      write({ step: next, tray: finish, greens: look }, true);
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    },
    [finish, look, write],
  );

  useEffect(() => {
    function onPop() {
      const q = new URLSearchParams(window.location.search);
      const s = stepFrom(q.get("step"));
      setStepState(s);
      setState({ step: s, progress: 0, phase: null });
      const tray = q.get("tray");
      const greens = q.get("greens");
      if (isTrayFinish(tray)) setFinish(tray);
      if (isLook(greens)) setLook(greens);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* The scene reports a choice made on the bench; the URL follows. */
  const onPick = useCallback(
    (f: TrayFinish) => {
      setFinish(f);
      write({ step: "pick", tray: f, greens: look }, false);
    },
    [look, write],
  );
  const onLook = useCallback(
    (l: Look) => {
      setLook(l);
      write({ step: "sow", tray: finish, greens: l }, false);
    },
    [finish, write],
  );
  const onProgress = useCallback(
    (s: BenchStep, progress: number, phase: Phase) => {
      setState((prev) =>
        prev.step === s ? { step: s, progress, phase } : prev,
      );
    },
    [],
  );

  const bench = step === "touch" ? null : step;
  const done = step === "touch" || !live || state.progress >= 1;
  const following = nextStep(step);
  const phase = state.phase;

  /* A finished step leads straight into the next — the tray glides to the
     middle and the next tools drop onto the bench — after a moment to read
     "well done". The last step stays, because the kit is the point of it.
     Next still skips the wait. */
  const finished =
    !!bench && live && state.step === step && state.progress >= 1;
  /* "Well done" in the middle of the screen from the moment a step is
     finished, held on through the move into the next one until its tools
     have landed on the bench, so it reads as the bridge between the two. */
  const [lingering, setLingering] = useState<BenchStep | null>(null);
  const cheer = finished ? bench : lingering;
  useEffect(() => {
    if (!finished || !following || !bench) return;
    const id = window.setTimeout(() => {
      setLingering(bench);
      go(following);
    }, AUTO_NEXT_MS);
    return () => window.clearTimeout(id);
  }, [finished, following, bench, go]);
  useEffect(() => {
    if (!lingering) return;
    const id = window.setTimeout(() => setLingering(null), CHEER_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [lingering]);

  /* ---- labels pinned to what to reach for ---- */
  const select = useCallback(
    (target: Target) => sceneRef.current?.select(target),
    [],
  );
  const pill = (target: Target, text: string, sub?: string) => (
    <button
      type="button"
      onClick={() => select(target)}
      className="flex items-center gap-2 whitespace-nowrap rounded-full bg-forest py-2 pl-2.5 pr-4 font-body text-sm font-semibold text-cream shadow-[0_6px_18px_rgba(3,39,24,0.3)] transition-colors hover:bg-forest-deep"
    >
      <span
        className="garden-label-dot size-2.5 shrink-0 rounded-full bg-sage"
        aria-hidden
      />
      <span className="flex flex-col items-start leading-tight">
        {text}
        {sub && (
          <span className="text-[11px] font-medium text-cream/75">{sub}</span>
        )}
      </span>
    </button>
  );
  /* A seed packet's tag in the scene: its name and price pick it, like
     the packet itself, and the bag beside them opens the seeds page. */
  const shopPill = (
    target: Target,
    name: string,
    product: GardenProduct | null | undefined,
  ) =>
    product ? (
      /* The whole tag goes to the seeds page, not this one seed's (the
         owner, 2–3 Oct 2026); the packet itself is picked on the bench,
         and from the keyboard by the button that shows on focus. */
      <span className="flex flex-col items-center gap-1">
        <ShopLink
          newTab={t("product.newTab")}
          href="/seeds"
          aria-label={`${t("product.allSeeds")}: ${name}, ${product.price} (${t("product.newTab")})`}
          className="group/seed pointer-events-auto flex items-center gap-0.5 rounded-full bg-cream/95 p-0.5 font-body sm:gap-1 sm:p-1 shadow-[0_6px_18px_rgba(3,39,24,0.18)] ring-1 ring-forest/10 transition-colors hover:bg-cream"
        >
          {/* Smaller on a phone, where four stand across the bench. */}
          <span className="flex flex-col items-start whitespace-nowrap py-0.5 pl-2 pr-1 text-xs font-semibold leading-tight text-forest sm:py-1 sm:pl-3 sm:pr-2 sm:text-sm">
            {name}
            <span className="text-[10px] font-medium text-forest/70 sm:text-[11px]">
              {product.price}
            </span>
          </span>
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-full bg-forest text-cream transition-colors group-hover/seed:bg-forest-deep sm:size-8"
          >
            <ShoppingBag className="size-3 sm:size-[15px]" />
          </span>
        </ShopLink>
        <button
          type="button"
          onClick={() => select(target)}
          className="sr-only rounded-full bg-forest px-3 py-1.5 font-body text-xs font-semibold text-cream focus:not-sr-only"
        >
          {name}
        </button>
      </span>
    ) : (
      <span className="flex items-center rounded-full bg-cream/95 p-1 shadow-[0_6px_18px_rgba(3,39,24,0.18)] ring-1 ring-forest/10">
        <button
          type="button"
          onClick={() => select(target)}
          className="whitespace-nowrap rounded-full px-3 py-1 font-body text-sm font-semibold leading-tight text-forest transition-colors hover:bg-forest/10"
        >
          {name}
        </button>
      </span>
    );
  const gestureLabel: Partial<Record<Phase, string>> = {
    wipe: t("targets.wipe"),
    pour: t("targets.pour"),
    fill: t("targets.fill"),
    sow: t("targets.sow"),
    cut: t("targets.cut"),
  };
  const labels: Partial<Record<Anchor, React.ReactNode>> = {};
  if (bench) {
    for (const f of TRAY_FINISH_KEYS)
      labels[f] = (
        <PairCard
          name={t(`targets.${f}`)}
          product={shelf.trays[f]}
          onPick={() => select(f)}
          t={t}
        />
      );
    labels.basin = pill("basin", t("targets.dip"));
    labels.timer = <SoakTimer label={t("steps.clean.soaking")} />;
    labels.cloth = pill("cloth", t("targets.cloth"));
    labels.can = pill(
      "can",
      phase === "water" ? t("targets.water") : t("targets.can"),
    );
    labels.block = pill(
      "block",
      phase === "takeScoop"
        ? t("targets.bowl")
        : (gestureLabel[phase ?? "pour"] ?? ""),
    );
    if (shelf.medium)
      labels.medium = <MediumTag product={shelf.medium} t={t} />;
    /* The light step's rack card, bottom left, with a dotted arrow to it
       from the shelf it sells (the owner, 3 Oct 2026); the scene draws
       the line between the two (`placeRackArrow`). */
    if (bench === "light" && shelf.rack)
      labels.rackArrow = (
        <svg
          aria-hidden
          width="1"
          height="1"
          className="absolute left-0 top-0 overflow-visible text-forest/80"
        >
          <path
            data-arrow-line
            stroke="currentColor"
            strokeWidth="2.2"
            strokeDasharray="1 6"
            strokeLinecap="round"
            fill="none"
          />
          <path
            data-arrow-head
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    labels.lid = pill("lid", t("targets.uncover"));
    labels.lamp = pill("lamp", t("targets.lamp"));
    labels.cutter = pill("cutter", t("targets.cutter"));
    for (const l of LOOK_KEYS)
      labels[`packet-${l}`] = shopPill(
        `packet-${l}`,
        t(`looks.${l}`),
        shelf.seeds[l],
      );
    const trayWord: Partial<Record<Phase, string>> = {
      takeTray: t("targets.trayUp"),
      lift: t("targets.liftOut"),
      toLight: t("targets.toLight"),
    };
    const g = phase ? (trayWord[phase] ?? gestureLabel[phase]) : undefined;
    if (g) labels.tray = pill("tray", g);
  }

  /* ---- the product of the moment ---- */
  function adFor(s: BenchStep, p: Phase | null): Ad | "kit" | null {
    /* With the live scene a product shows once it is in play; with stills
       only, each step shows its product outright. Every step that uses
       something we sell shows it (the owner, 2 Oct 2026: "wherever it is
       possible… clearly show that this product can be purchased"). While
       the scene is still loading nothing shows — a card alone on a blank
       stage, gone a moment later, read as a fault (the owner, same day). */
    if (!live && !stills) return null;
    const any = stills;
    const tray = shelf.trays[finish];
    if (s === "pick" && tray && (any || p === "drop" || p === "done"))
      return { p: tray };
    /* The tray being cleaned is the one just picked. */
    if (s === "clean" && tray) return { p: tray };
    if (
      (s === "soak" || s === "fill") &&
      shelf.medium &&
      (any || s === "fill" || (p && p !== "takeCan"))
    )
      return { p: shelf.medium, recommended: true };
    const seed = shelf.seeds[look];
    if (s === "sow" && seed && (any || p === "sow" || p === "done"))
      return { p: seed };
    if (s === "light" && shelf.rack) return { p: shelf.rack };
    /* From the moment the harvest opens, not once it is cut (the owner,
       3 Oct 2026). */
    if (s === "harvest") return "kit";
    return null;
  }
  const ad = bench ? adFor(bench, phase) : null;
  /* On a wide stage, while the wall under the herb shelf is in view, the
     product hangs there framed, sized to the wall by the scene (the
     owner, 2 Oct 2026: "can we design it like a photo frame?"). Where the
     wall is out of view, or the rack hides it, or on a phone, the card
     stands in; the harvest has its kit. */
  /* A kitchen step's product is only ever the frame on a wide stage —
     never the card, not even while the wall comes into view (the owner,
     same day: "it should only show frame in that screen"). */
  const framed = ad !== null && ad !== "kit" && bench !== "light";
  const hang = framed && live && wall;
  if (hang)
    labels.ad = (
      <span className="hidden md:block">
        <WallFrame p={ad.p} recommended={ad.recommended} t={t} />
      </span>
    );
  const card =
    ad === "kit" ? (
      <Kit shelf={shelf} finish={finish} look={look} t={t} />
    ) : ad ? (
      <BuyCard p={ad.p} recommended={ad.recommended} t={t} />
    ) : null;

  const dots = (
    <StepDots
      step={step}
      onGo={go}
      labels={(s) => t(`steps.${s}.label`)}
      t={t}
    />
  );
  const pillClass =
    "rounded-full bg-cream/90 px-4 py-2.5 font-body text-sm font-semibold text-forest shadow-sm ring-1 ring-forest/10 transition-colors hover:bg-cream";
  const primaryClass =
    "inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-body text-sm font-semibold text-cream shadow-[0_8px_22px_rgba(3,39,24,0.3)] transition-colors hover:bg-forest-deep";

  return (
    <div
      ref={stageRef}
      style={{ height: `calc(100svh - ${headerH}px)` }}
      /* The ordinary pointer, as a hand over anything that can be picked up. */
      className={`relative min-h-[520px] w-full overflow-hidden bg-sand ${hover && hover !== "tray" ? "cursor-pointer" : ""}`}
    >
      {/* ---- the stage ---- */}
      {bench ? (
        <GardenStage
          step={bench}
          finish={finish}
          look={look}
          alt={t(`still.${bench}`)}
          labels={labels}
          tubLabel={t("steps.clean.solution")}
          canLabel={t("steps.soak.can")}
          doorLabel={t("steps.dark.door")}
          trayTags={{
            "tray-pair": t("trayTags.tray-pair"),
            "tray-pair-food-grade": t("trayTags.tray-pair-food-grade"),
          }}
          sceneRef={sceneRef}
          onLive={setLive}
          onStills={() => setStills(true)}
          onWall={setWall}
          onProgress={onProgress}
          onPick={onPick}
          onLook={onLook}
          onHover={setHover}
        />
      ) : (
        /* The trays fit the box they are drawn in, so the box stops short of
           the card below; its height is the one the trays were sized for
           (the owner, 2 Oct 2026), moved up when the title went down. */
        <div className="absolute inset-x-0 bottom-28 top-16 md:bottom-24 md:top-16">
          <TrayPlayStage
            alt={home("alt")}
            onLive={() => setTraysLive(true)}
            snug
            /* Static words, no record (the owner, 2 Oct 2026: "keep it
               static text no DB load"): the look's name from these
               messages, "Order fresh", and the microgreens page. */
            tags={HOME_ROW.map((l) =>
              shelf.freshHref
                ? (anchor: TrayAnchor, panel: { width: number }) => (
                    <TrayTag
                      name={t(`looks.${l}`)}
                      cta={t("product.orderFresh")}
                      newTab={t("product.newTab")}
                      href={shelf.freshHref!}
                      point={anchor[TRAY_TAGS[l].at]}
                      dx={TRAY_TAGS[l].dx}
                      dy={TRAY_TAGS[l].dy}
                      from={TRAY_TAGS[l].from}
                      into={TRAY_TAGS[l].into}
                      top={TRAY_TAGS[l].top}
                      aim={TRAY_TAGS[l].aim}
                      width={panel.width}
                    />
                  )
                : null,
            )}
          />
        </div>
      )}

      {/* ---- the dark days: two places at once, split by the scene ---- */}
      {bench === "dark" &&
        live &&
        state.step === "dark" &&
        (phase === "hold" ||
          phase === "toLight" ||
          phase === "carry" ||
          phase === "done") && (
          <DarkSplit
            sceneRef={sceneRef}
            t={t}
            toLight={phase === "toLight"}
            over={phase !== "hold"}
          />
        )}

      {/* ---- progress, along the top edge ---- */}
      {bench && live && (
        <div
          role="progressbar"
          aria-label={t("nav.progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress * 100)}
          className="absolute inset-x-0 top-0 z-30 h-1 bg-forest/10"
        >
          <div
            className="h-full bg-forest transition-[width] duration-300"
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
      )}

      {/* ---- well done, in the middle ---- */}
      {cheer && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 flex justify-center px-4">
          <p
            key={cheer}
            role="status"
            className="garden-cheer flex items-center gap-3 rounded-full bg-forest px-6 py-3.5 text-center font-display text-lg font-bold text-cream shadow-[0_14px_40px_rgba(3,39,24,0.35)] md:px-8 md:py-4 md:text-2xl"
          >
            <Sparkles className="size-5 shrink-0 md:size-6" aria-hidden />
            {t(`steps.${cheer}.done`)}
          </p>
        </div>
      )}

      {/* ---- the product: top right, under the wall shelf, where the eye
          goes (the owner, 2 Oct 2026) — bottom left on the light step,
          above the card that says where you are; on a phone, above that
          card ---- */}
      {card && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-[11rem] z-30 flex px-4 md:inset-x-auto md:px-0 ${framed ? "md:hidden" : ""} ${
            /* The light step's rack fills the top right, and leaves the
               bottom left bare (the owner, same day). */
            bench === "light"
              ? "md:bottom-40 md:left-6"
              : /* The harvest's bowl is on the right; the left is bare. */
                bench === "harvest"
                ? /* Centred down the left (the owner, 3 Oct 2026), on the
                     bare bench the harvest's framing leaves there. */
                  "md:bottom-auto md:left-6 md:top-1/2 md:-translate-y-1/2"
                : "md:bottom-auto md:right-6 md:top-[19%]"
          }`}
        >
          <div
            data-garden-card={bench ?? undefined}
            className="pointer-events-auto w-full min-w-0 md:w-auto"
          >
            {card}
          </div>
        </div>
      )}

      {/* ---- where you are, and on: one card, bottom centre (the owner,
          3 Oct 2026) — the steps and the title on the left, the step's
          buttons on the right; stacked on a phone ---- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4 md:p-6">
        {/* Cream, so the title reads over the room behind it. */}
        <div className="pointer-events-auto flex w-full flex-col gap-3 rounded-2xl bg-cream/90 px-4 py-3 shadow-[0_10px_30px_rgba(3,39,24,0.16)] ring-1 ring-forest/10 backdrop-blur-sm md:w-auto md:flex-row md:items-center md:gap-8 md:py-2.5 md:pr-3">
          <div className="min-w-0">
            {/* The steps sit on the eyebrow line: one card says where you
              are. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-forest/70">
                {t("title")}
              </p>
              {dots}
            </div>
            {/* The step's title says what to do; while a tray is still to
                be chosen it carries a pulsing dot, rather than saying it
                twice in a second line (the owner, 3 Oct 2026). */}
            <h1 className="flex items-center gap-2.5 font-display text-xl font-bold leading-tight text-forest md:text-[1.9rem]">
              {step === "pick" &&
                live &&
                state.step === "pick" &&
                state.phase === "choose" && (
                  <span
                    className="garden-label-dot size-2.5 shrink-0 rounded-full bg-sage md:size-3"
                    aria-hidden
                  />
                )}
              {t(`steps.${step}.title`)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
            {step === "touch" ? (
              <>
                {/* Without the live scene there are no tray labels, so the
                    photograph keeps one way to the shop. */}
                {!traysLive && (
                  <ShopLink
                    newTab={t("product.newTab")}
                    href="/microgreens"
                    className={pillClass}
                  >
                    {t("steps.touch.order")}
                  </ShopLink>
                )}
                {/* Where the journey's Next sits on every other step. A
                    slow breath and a nudge of the arrow: the one thing on
                    this screen that leads on, so it asks to be pressed. */}
                <button
                  type="button"
                  onClick={() => go("pick")}
                  className={`garden-nudge ${primaryClass}`}
                >
                  <Sprout size={18} aria-hidden />
                  <span className="max-w-[15rem] text-left leading-snug sm:max-w-none">
                    {t("steps.touch.start")}
                  </span>
                  <ArrowRight
                    size={16}
                    aria-hidden
                    className="garden-nudge-arrow"
                  />
                </button>
              </>
            ) : (
              <>
                {live && !done && bench !== "pick" && (
                  <button
                    type="button"
                    onClick={() => sceneRef.current?.autoplay()}
                    className={pillClass}
                  >
                    {t("nav.auto")}
                  </button>
                )}
                {following ? (
                  done && (
                    <button
                      type="button"
                      onClick={() => go(following)}
                      className={primaryClass}
                    >
                      {t("nav.next")}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => go("pick")}
                    className={pillClass}
                  >
                    {t("nav.restart")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"garden">>;

/** The product of the moment, and whether it carries "Recommended by
 *  Fewgrams". */
type Ad = { p: GardenProduct | GardenLink; recommended?: boolean };

/** Every way from the garden to a product or the shop opens in a new tab
 *  (the owner, 2 Oct 2026), so the tray in play stays where it is. The
 *  basket link does not: going to pay is leaving the garden. A screen
 *  reader is told; where a link has its own `aria-label`, that says it. */
function ShopLink({
  newTab,
  children,
  ...props
}: ComponentProps<typeof Link> & { newTab: string }) {
  return (
    <Link {...props} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> ({newTab})</span>
    </Link>
  );
}

/** Where each tray's name sits, in the bench the row leaves bare: the
 *  corners beside the back of the end trays, a short arrow from each, and
 *  centred over radish. `dx`
 *  and `dy` place the label's centre from the point it points at; `from`
 *  is the label edge the arrow leaves by, `into` the way it arrives. */
type Dir = "left" | "right" | "up" | "down";
const TRAY_TAGS: Record<
  HomeLook,
  {
    at: Exclude<keyof TrayAnchor, "front">;
    dx: number;
    dy: number;
    from: Dir;
    into: [number, number];
    /** How high this name may sit, if not `TAG_TOP`. */
    top?: number;
    /** Where the arrow lands, in pixels from the point, if not on it. */
    aim?: [number, number];
  }
> = {
  /* The label hangs off the back corner; the arrow runs on past it and
     drops onto the leaves just inside (`aim`, in pixels from the corner). */
  amaranth: {
    at: "backLeft",
    dx: -125,
    dy: -6,
    from: "right",
    into: [0.5, 0.87],
    aim: [70, 24],
  },
  /* Nothing sits over the middle of the row, so radish may rise into the
     strip beside the title and the button. */
  radish: { at: "back", dx: 0, dy: -70, from: "down", into: [0, 1], top: -70 },
  /* Above the corner rather than beside it — with its second line the
     label is tall enough to sit on the leaves there — and the arrow drops
     from its bottom edge down onto them. */
  sunflower: {
    at: "backRight",
    dx: 135,
    dy: -75,
    from: "down",
    into: [-0.5, 0.87],
    aim: [40, 24],
  },
};
const DIRS: Record<Dir, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};
/** The highest a name's centre may sit, in the panel's pixels: the panel
 *  starts under the title and the start button, and a name above this
 *  would run into them. */
const TAG_TOP = 6;

/** The soak, run fast: a clock face whose hand sweeps round several times
 *  while a ring fills, over `STEEP_SECONDS`. It says "this takes a while"
 *  without naming a time (SPEC §25.3). */
function SoakTimer({ label }: { label: string }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <span className="garden-card-in flex flex-col items-center gap-1.5">
      <span className="relative grid size-20 place-items-center rounded-full bg-cream/95 shadow-[0_10px_30px_rgba(3,39,24,0.25)] ring-1 ring-forest/10">
        <svg
          viewBox="0 0 64 64"
          className="absolute inset-0 size-full -rotate-90"
          aria-hidden
        >
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-forest/10"
          />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            className="garden-soak-ring text-forest"
            style={{
              ["--soak-c" as string]: C,
              animationDuration: `${STEEP_SECONDS}s`,
            }}
          />
        </svg>
        <span
          className="garden-soak-hand absolute left-1/2 top-1/2 h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-forest"
          style={{ animationDuration: `${STEEP_SECONDS / 6}s` }}
          aria-hidden
        />
        <span className="relative size-2 rounded-full bg-forest" aria-hidden />
      </span>
      <span className="rounded-full bg-forest px-3 py-1 font-body text-xs font-semibold text-cream shadow-sm">
        {label}
      </span>
    </span>
  );
}

const STAGES = ["seed", "sprout", "leaves"] as const;

/**
 * The dark step's dark room and, beside it, the kitchen (the owner, 2 Oct
 * 2026), over the scene's two views of them (`render` in scene.ts):
 *
 * - **the dark room** comes first, on its own, out of black as the camera
 *   goes through the door: the covered tray close up, and under it the
 *   seed's stages — seed, sprout, seed leaves — one a day;
 * - **the kitchen** then slides in beside it (below it on a tall stage),
 *   turning through day and night while the tray stays dark, under "keep
 *   the tray in the dark room for N days".
 *
 * The dark room fades up out of black in the scene itself (`render`), so
 * the cut through the door has no frame of the tray lit before the page
 * catches up; only the stages fade in here.
 *
 * Driven every frame by the scene's own state — how far the screen has
 * opened (`split()`) and how many days have gone (`days()`) — not by CSS
 * timers, so the panels move with the views under them and keep time when
 * "Do it for me" hurries the days along.
 */
function DarkSplit({
  sceneRef,
  t,
  toLight,
  over,
}: {
  sceneRef: React.RefObject<GardenScene | null>;
  t: T;
  /** The days are done: the tray is to be dragged into the light. */
  toLight: boolean;
  /** The days are over, whether or not the tray has gone yet. */
  over: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  /* The scene's rule for its two layouts, on the same box. */
  const [wide, setWide] = useState(true);
  const [day, setDay] = useState(0);

  useEffect(() => {
    const box = root.current;
    if (!box) return;
    const fit = () => setWide(box.clientWidth / box.clientHeight >= 0.9);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    let raf = 0;
    const frame = () => {
      const scene = sceneRef.current;
      const d = scene?.days() ?? 0;
      /* The dark room's share of the stage, as the scene draws it. */
      const share = scene?.split() ?? 1;
      const half =
        box.clientWidth / box.clientHeight >= 0.9 ? 0.5 : DARK_SHARE_TALL;
      box.style.setProperty("--dark", String(share));
      box.style.setProperty(
        "--alone",
        String(Math.min(1, Math.max(0, (share - half) / (1 - half)))),
      );
      box.style.setProperty(
        "--seam",
        String(Math.min(1, (1 - share) * 10, share * 10)),
      );
      const n = Math.min(DARK_DAYS - 1, Math.floor(d));
      setDay((was) => (was === n ? was : n));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      watch.disconnect();
    };
  }, [sceneRef]);

  const panels: [
    React.CSSProperties,
    React.CSSProperties,
    React.CSSProperties,
  ] = wide
    ? [
        { inset: "0 auto 0 0", width: "calc(100% * var(--dark, 1))" },
        { inset: "0 0 0 auto", width: "calc(100% * (1 - var(--dark, 1)))" },
        {
          top: 0,
          bottom: 0,
          width: 4,
          left: "calc(100% * var(--dark, 1) - 2px)",
        },
      ]
    : [
        { inset: "0 0 auto 0", height: "calc(100% * var(--dark, 1))" },
        {
          inset: "auto 0 0 0",
          height: "calc(100% * (1 - var(--dark, 1)))",
        },
        {
          left: 0,
          right: 0,
          height: 4,
          top: "calc(100% * var(--dark, 1) - 2px)",
        },
      ];
  const heading =
    "rounded-full px-4 py-1.5 font-body text-sm font-semibold shadow-sm";

  const stages = (
    <ol className="flex items-end gap-2 sm:gap-4">
      {STAGES.map((stage, i) => (
        <li
          key={stage}
          aria-current={i === day ? "step" : undefined}
          className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-all duration-500 ${
            i === day
              ? "bg-cream/15 opacity-100 ring-1 ring-cream/30"
              : i < day
                ? "opacity-60"
                : "opacity-30"
          }`}
        >
          <SeedStage stage={stage} />
          <span className="font-body text-xs font-semibold text-cream">
            {t(`steps.dark.stages.${stage}`)}
          </span>
        </li>
      ))}
    </ol>
  );

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20">
      {/* ---- the dark room ---- */}
      <div
        style={panels[0]}
        className="absolute flex flex-col items-center overflow-hidden"
      >
        <div
          /* On a tall stage, clear of the page's buttons while the dark
             room has the whole screen; the kitchen takes the bottom after. */
          style={
            wide
              ? undefined
              : { marginBottom: "calc(4.75rem * var(--alone, 1) + 0.5rem)" }
          }
          className={`garden-stages-in mt-auto ${wide ? "mb-24" : ""}`}
        >
          {stages}
        </div>
      </div>

      {/* From the tray to the rack, over the seam, while it waits. */}
      {toLight && (
        <div
          aria-hidden
          style={
            wide
              ? { left: "calc(100% * var(--dark, 1))", top: "50%" }
              : { top: "calc(100% * var(--dark, 1))", left: "50%" }
          }
          className="garden-card-in absolute z-10 -translate-x-1/2 -translate-y-1/2"
        >
          <span className="grid size-14 place-items-center rounded-full bg-forest text-cream shadow-[0_8px_24px_rgba(3,39,24,0.45)] ring-4 ring-cream/80">
            {wide ? (
              <ChevronsRight className="garden-point-x" size={30} />
            ) : (
              <ChevronsDown className="garden-point-y" size={30} />
            )}
          </span>
        </div>
      )}

      {/* The seam between the two places. */}
      <div
        aria-hidden
        style={{ ...panels[2], opacity: "var(--seam, 0)" }}
        className="absolute bg-cream"
      />

      {/* ---- the kitchen, sliding in ---- */}
      <div
        style={panels[1]}
        className="absolute flex flex-col items-center overflow-hidden"
      >
        {/* Where to drop the tray, once the days are done. */}
        {toLight && (
          <div className="garden-card-in absolute inset-3 flex items-center justify-center rounded-3xl border-2 border-dashed border-cream/90 bg-cream/10">
            <p
              className={`${heading} garden-nudge flex items-center gap-2 bg-forest text-cream`}
            >
              <Sun size={16} aria-hidden />
              {t("steps.dark.drop")}
            </p>
          </div>
        )}
        <p
          style={{ opacity: over ? 0 : "calc(1 - var(--alone, 1))" }}
          className={`absolute mx-4 max-w-[min(30rem,calc(100%-2rem))] text-balance rounded-2xl bg-forest px-5 py-2.5 text-center font-body text-base font-semibold text-cream shadow-[0_10px_30px_rgba(3,39,24,0.35)] md:text-lg ${
            wide ? "top-28" : "top-3"
          }`}
        >
          {/* The day count from the constant that runs the days, never
              written into the copy (the owner asked for it said). */}
          {t.rich("steps.dark.keep", {
            days: DARK_DAYS,
            b: (chunks) => (
              <strong className="rounded-md bg-cream px-1.5 font-bold text-forest">
                {chunks}
              </strong>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

/** What the seed is doing under the cover, drawn in cross-section: the soil
 *  line across the middle, everything pale because it has had no light. */
function SeedStage({ stage }: { stage: (typeof STAGES)[number] }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11 sm:size-12" aria-hidden>
      <rect x="2" y="27" width="44" height="19" rx="4" fill="#4a3424" />
      {stage === "seed" && (
        <ellipse cx="24" cy="31" rx="5" ry="3.6" fill="#b5895a" />
      )}
      {stage === "sprout" && (
        <>
          <path
            d="M24 33 C24 38 22 41 23 45"
            stroke="#f3ecd6"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M24 31 C24 24 24 20 20 19"
            stroke="#e8e0b0"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            cx="18.5"
            cy="20"
            rx="3.6"
            ry="2.6"
            fill="#b5895a"
            transform="rotate(-25 18.5 20)"
          />
        </>
      )}
      {stage === "leaves" && (
        <>
          <path
            d="M24 33 C24 38 22 41 23 45 M24 36 L28 41"
            stroke="#f3ecd6"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M24 32 V12"
            stroke="#e8e0b0"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <ellipse
            cx="18"
            cy="11"
            rx="6.5"
            ry="3.2"
            fill="#e3d36f"
            transform="rotate(-18 18 11)"
          />
          <ellipse
            cx="30"
            cy="11"
            rx="6.5"
            ry="3.2"
            fill="#e3d36f"
            transform="rotate(18 30 11)"
          />
        </>
      )}
    </svg>
  );
}

/** Our coco peat, pinned over the bowl with a dotted arrow down to the
 *  block in it: the photo, the name and price, and a way to its page. */
function MediumTag({ product, t }: { product: GardenProduct; t: T }) {
  return (
    <span className="flex flex-col-reverse items-center">
      {/* Points down into the bowl from above it. */}
      <svg
        aria-hidden
        width="16"
        height="36"
        viewBox="0 0 16 36"
        className="mt-1 text-forest/75"
      >
        <path
          d="M8 3 V30"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="1 5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M3 26 L8 32 L13 26"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {/* The whole card is the way to the product (the owner, 3 Oct
          2026), not only its bag. */}
      <ShopLink
        newTab={t("product.newTab")}
        href={product.href}
        className="group/medium pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-cream/95 p-1.5 pr-2 shadow-[0_10px_30px_rgba(3,39,24,0.2)] ring-1 ring-forest/10 transition-colors hover:bg-cream"
      >
        {product.image && (
          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-sand">
            <Image
              src={product.image.src}
              alt={product.image.alt}
              fill
              sizes="48px"
              className="object-cover"
            />
          </span>
        )}
        <span className="flex min-w-0 flex-col font-body leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-forest/60">
            {t("product.recommended")}
          </span>
          <span className="max-w-[10rem] truncate text-sm font-semibold text-forest">
            {product.name}
          </span>
          <span className="text-[11px] text-stone">{product.price}</span>
        </span>
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-forest text-cream transition-colors group-hover/medium:bg-forest-deep"
        >
          <ShoppingBag size={15} />
        </span>
      </ShopLink>
    </span>
  );
}

/** A tray pair's product card (the owner, 2 Oct 2026): the pack's
 *  photograph, "Available to buy", the pair's name and "Buy here", each a
 *  way to the pair's page in a new tab. A row — beside the tray where the
 *  stage has room for it with a gap (`PICK_CARD_ROOM`), over its back
 *  edge where it has not, over or under it on a phone (`data-place`, set
 *  by the scene). Clicking the tray picks it; the keyboard's way to pick
 *  is the button that shows when it has focus. A pair not on sale keeps
 *  its name only. */
function PairCard({
  name,
  product,
  onPick,
  t,
}: {
  name: string;
  product: GardenProduct | null;
  onPick: () => void;
  t: T;
}) {
  const [loaded, setLoaded] = useState(false);
  const pick = (
    <button
      type="button"
      onClick={onPick}
      className="sr-only rounded-full bg-forest px-3 py-1.5 font-body text-xs font-semibold text-cream focus:not-sr-only"
    >
      {t("targets.pickPair", { name })}
    </button>
  );
  if (!product)
    return (
      <span className="flex flex-col items-center gap-1">
        <span className="rounded-full bg-cream/95 px-3 py-1.5 font-body text-sm font-semibold text-forest shadow-sm ring-1 ring-forest/10">
          {name}
        </span>
        {pick}
      </span>
    );
  /* Shown whole or not at all: the card waits for its photograph rather
     than opening on an empty frame (the owner, 2 Oct 2026). */
  const ready = loaded || !product.image;
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className={`pointer-events-auto flex items-center gap-2 rounded-2xl bg-cream/95 p-2 font-body shadow-[0_8px_22px_rgba(3,39,24,0.2)] ring-1 ring-forest/10 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
      >
        {product.image && (
          <ShopLink
            newTab={t("product.newTab")}
            href={product.href}
            aria-label={`${t("product.view")}: ${product.name} (${t("product.newTab")})`}
            className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand"
          >
            <Image
              src={product.image.src}
              alt={product.image.alt}
              fill
              sizes="80px"
              /* Fetched at once, not when the label first shows. */
              loading="eager"
              onLoad={() => setLoaded(true)}
              className="object-contain p-1"
            />
          </ShopLink>
        )}
        <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-forest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
            <ShoppingBag size={11} aria-hidden />
            {t("product.forSale")}
          </span>
          {/* No price here (the owner, 2 Oct 2026): the name and
              "Buy here" say enough, and the price is on the pair's page. */}
          <ShopLink
            newTab={t("product.newTab")}
            href={product.href}
            className="mt-0.5 whitespace-nowrap text-sm font-semibold leading-snug text-forest hover:underline"
          >
            {name}
          </ShopLink>
          {/* One clear ask, to the pair's page, on its own line (the owner,
              2 Oct 2026). */}
          <ShopLink
            newTab={t("product.newTab")}
            href={product.href}
            className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            <ShoppingBag size={15} aria-hidden />
            {t("product.buyHere")}
          </ShopLink>
        </span>
      </span>
      {pick}
    </span>
  );
}

/** A grown tray's name with a dotted arrow from it to the tray: the touch
 *  step's way to the shop, one per variety rather than one button. Drawn
 *  in the panel's own pixels as one cubic curve from the label's edge to
 *  `to`, its handles along the way it leaves and the way it arrives, with
 *  the head drawn on that last direction so it always sits true. */
function TrayTag({
  name,
  cta,
  href,
  newTab,
  point,
  dx,
  dy,
  from,
  into,
  top,
  aim,
  width,
}: {
  name: string;
  /** The line under the name that asks for the order (the owner, 2 Oct
   *  2026: "just names wont help"). No price: static words only. */
  cta: string;
  href: string;
  newTab: string;
  point: { x: number; y: number };
  width: number;
} & Omit<(typeof TRAY_TAGS)[HomeLook], "at">) {
  const small = width < 640;
  /* A phone's trays sit close together with height to spare above them,
     so there every name hangs over its own tray and points down. */
  if (small) {
    dx *= 0.35;
    dy = Math.min(dy, -60);
    from = "down";
    into = [0, 1];
    aim = undefined;
  }
  const at = point;
  const to = aim ? { x: at.x + aim[0], y: at.y + aim[1] } : at;
  /* Kept inside the panel; the size is estimated from the name, which is
     near enough for a margin. */
  const sub = cta;
  const chars = Math.max(name.length, sub.length * 0.8);
  const half = (chars * (small ? 6.4 : 8) + (small ? 24 : 52)) / 2;
  const halfH = small ? 20 : 26;
  const x = Math.min(Math.max(at.x + dx, half + 8), width - half - 8);
  const y = Math.max(at.y + dy, top ?? TAG_TOP);
  const [ox, oy] = DIRS[from];
  const sx = x + ox * (half + 4);
  const sy = y + oy * (halfH + 4);
  const [ix, iy] = into;
  /* Handles along the two directions give the curve; a straight run
     stays straight. */
  const k = Math.hypot(to.x - sx, to.y - sy) * 0.5;
  const d = `M${sx} ${sy} C${sx + ox * k} ${sy + oy * k} ${to.x - ix * k} ${to.y - iy * k} ${to.x} ${to.y}`;
  /* The head: two short strokes back from the tip, either side of `into`. */
  const wing = (s: number) =>
    `${to.x - ix * 11 + iy * 6 * s} ${to.y - iy * 11 - ix * 6 * s}`;
  return (
    <div className="garden-card-in">
      <svg
        aria-hidden
        className="absolute left-0 top-0 overflow-visible text-forest/75"
        width="1"
        height="1"
      >
        <path
          d={d}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="1 5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M${wing(1)} L${to.x} ${to.y} L${wing(-1)}`}
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <ShopLink
        newTab={newTab}
        href={href}
        style={{ left: x, top: y }}
        className="group/tag pointer-events-auto absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-2xl bg-cream/95 py-1.5 pl-3 pr-1.5 font-body text-forest shadow-sm ring-1 ring-forest/10 transition-colors hover:bg-forest hover:text-cream sm:py-2 sm:pl-4 sm:pr-2"
      >
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11px] font-semibold sm:text-sm">{name}</span>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-forest/70 transition-colors group-hover/tag:text-cream/80 sm:text-xs">
            {sub}
            <ArrowRight size={11} aria-hidden />
          </span>
        </span>
        <span className="hidden size-8 place-items-center rounded-full bg-forest text-cream transition-colors group-hover/tag:bg-cream group-hover/tag:text-forest sm:grid">
          <ShoppingBag size={15} aria-hidden />
        </span>
      </ShopLink>
    </div>
  );
}

/** One dot per step, the current one named; every dot goes to its step —
 *  the garden is a toy, not a form, so nothing is locked. */
function StepDots({
  step,
  onGo,
  labels,
  t,
}: {
  step: StepId;
  onGo: (s: StepId) => void;
  labels: (s: StepId) => string;
  t: T;
}) {
  const at = STEPS.indexOf(step);
  return (
    <nav aria-label={t("nav.steps")}>
      <ol className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const name = t("nav.goTo", { number: i + 1, name: labels(s) });
          return (
            <li key={s} className="flex items-center gap-1">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`hidden h-px w-2 sm:block ${i <= at ? "bg-forest" : "bg-forest/20"}`}
                />
              )}
              <button
                type="button"
                onClick={() => onGo(s)}
                aria-current={s === step ? "step" : undefined}
                aria-label={name}
                title={name}
                className={`grid size-6 place-items-center rounded-full font-body text-[11px] font-semibold transition-colors ${
                  s === step
                    ? /* Where you are: filled, with a ring that keeps
                         pulsing out from it. */
                      "garden-step-now bg-forest text-cream outline-2 outline-offset-2 outline-sage"
                    : i < at
                      ? "bg-forest/85 text-cream hover:bg-forest"
                      : "text-forest ring-1 ring-forest/25 hover:bg-forest/10"
                }`}
              >
                {i < at ? (
                  <Check size={12} strokeWidth={3} aria-hidden />
                ) : (
                  i + 1
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A product the step has just used, said plainly to be for sale (the
 *  owner, 2 Oct 2026): the product's own photograph, a forest "Available
 *  to buy" chip, its name and "Buy here", each a way to its page in a new
 *  tab. A compact row, so it sits on the wall under the shelf rather than
 *  running down onto the bench; no price — the page has it. The
 *  photograph gives one slow glow as it lands, to catch the eye once. */
function BuyCard({
  p,
  recommended = false,
  t,
}: {
  p: GardenProduct | GardenLink;
  recommended?: boolean;
  t: T;
}) {
  const nt = t("product.newTab");
  return (
    <div className="garden-card-in flex w-full max-w-sm items-center gap-3 rounded-2xl bg-cream/95 p-2.5 shadow-[0_10px_30px_rgba(3,39,24,0.18)] ring-1 ring-forest/10 backdrop-blur-sm md:w-auto">
      {p.image && (
        <ShopLink
          newTab={nt}
          href={p.href}
          aria-label={`${t("product.view")}: ${p.name} (${nt})`}
          className="garden-buy-glow relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand"
        >
          <Image
            src={p.image.src}
            alt={p.image.alt}
            fill
            sizes="80px"
            className="object-contain p-1"
          />
        </ShopLink>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 font-body leading-tight">
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-forest px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
          <ShoppingBag size={11} aria-hidden />
          {t("product.forSale")}
        </span>
        {recommended && (
          <RecommendedBadge
            label={t("product.recommended")}
            className="!px-2 !py-0.5 !text-[10px]"
          />
        )}
        <ShopLink
          newTab={nt}
          href={p.href}
          className="mt-0.5 block max-w-full truncate text-sm font-semibold leading-snug text-forest hover:underline md:max-w-[14rem]"
        >
          {p.name}
        </ShopLink>
        <ShopLink
          newTab={nt}
          href={p.href}
          className="mt-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          <ShoppingBag size={15} aria-hidden />
          {t("product.buyHere")}
        </ShopLink>
      </div>
    </div>
  );
}

/** The product of the moment as a picture hung on the kitchen wall (the
 *  owner, 2 Oct 2026): a wooden frame on a cord from a nail, a cream mount,
 *  and in it the product's photograph, "Available to buy", its name and
 *  "Buy here" — each a way to its page in a new tab. No price. Hangs a
 *  degree off true, as a picture does. */
function WallFrame({ p, recommended = false, t }: Ad & { t: T }) {
  const nt = t("product.newTab");
  /* Exactly the green wall under the shelf, as the scene measures it
     (`--ad-w`, `--ad-h`) — never larger, so it overlaps nothing (the
     owner, 2 Oct 2026). The contents are sized from the frame itself
     (container units), so they always fit inside with padding. */
  const u = (h: number, w: number) => `min(${h}cqh, ${w}cqw)`;
  return (
    <span
      className="garden-card-in pointer-events-auto relative block"
      style={{ width: "var(--ad-w)", height: "var(--ad-h)" }}
    >
      {/* The nail in the wall under the shelf, and the cord from it to the
          frame's top corners — as tall as the wall that shows between. */}
      <svg
        aria-hidden
        width="120"
        viewBox="0 0 120 26"
        preserveAspectRatio="none"
        style={{ height: "calc(var(--ad-gap, 26px) - 4px)" }}
        className="absolute bottom-full left-1/2 -mb-px -translate-x-1/2 overflow-visible"
      >
        <path
          d="M10 26 L60 5 L110 26"
          stroke="#6b4a2f"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          fill="none"
        />
      </svg>
      <span
        aria-hidden
        style={{ bottom: "calc(100% + var(--ad-gap, 26px) - 4px - 9px)" }}
        className="absolute left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-[#8a8f8a] shadow-[inset_-1px_-1px_0_rgba(0,0,0,0.25)]"
      />
      <span className="block size-full -rotate-1 overflow-hidden rounded-[3px] border-[6px] border-[#9a6b43] bg-[#f6f1e7] font-body shadow-[0_14px_28px_rgba(40,25,10,0.32),inset_0_0_0_1px_rgba(0,0,0,0.08)] [border-style:ridge] [container-type:size]">
        <span
          className="flex size-full items-center"
          /* A slim margin above and below, a wider one at the sides:
             the frame is cut to its contents' height (kitchen.ts,
             `AD_ASPECT`). */
          style={{ padding: `${u(6, 2.5)} ${u(10, 4)}`, gap: u(8, 4) }}
        >
          {p.image && (
            <ShopLink
              newTab={nt}
              href={p.href}
              aria-label={`${t("product.view")}: ${p.name} (${nt})`}
              className="garden-buy-glow relative block aspect-square shrink-0 overflow-hidden rounded-sm bg-white shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]"
              style={{ height: u(80, 34) }}
            >
              <Image
                src={p.image.src}
                alt={p.image.alt}
                fill
                sizes="160px"
                className="object-contain p-[6%]"
              />
            </ShopLink>
          )}
          <span
            className="flex min-w-0 flex-1 flex-col items-start"
            style={{ gap: u(5, 2) }}
          >
            <span
              className="inline-flex items-center whitespace-nowrap rounded-full bg-forest font-semibold uppercase tracking-wide text-cream"
              style={{
                fontSize: u(7, 3),
                padding: `${u(1.5, 0.7)} ${u(5, 2)}`,
                gap: u(2.5, 1),
              }}
            >
              <ShoppingBag
                aria-hidden
                style={{ width: "1.1em", height: "1.1em" }}
              />
              {t("product.forSale")}
            </span>
            {recommended && (
              <span
                className="font-semibold uppercase tracking-wide text-forest/70"
                style={{ fontSize: u(6.5, 2.8) }}
              >
                {t("product.recommended")}
              </span>
            )}
            <ShopLink
              newTab={nt}
              href={p.href}
              className="line-clamp-2 font-semibold leading-tight text-forest hover:underline"
              style={{ fontSize: u(11, 4.6) }}
            >
              {p.name}
            </ShopLink>
            <ShopLink
              newTab={nt}
              href={p.href}
              className="inline-flex items-center whitespace-nowrap rounded-full bg-forest font-semibold text-cream transition-colors hover:bg-forest-deep"
              style={{
                fontSize: u(10, 4.2),
                padding: `${u(4.5, 1.8)} ${u(10, 4)}`,
                gap: u(4, 1.6),
              }}
            >
              <ShoppingBag
                aria-hidden
                style={{ width: "1.1em", height: "1.1em" }}
              />
              {t("product.buyHere")}
            </ShopLink>
          </span>
        </span>
      </span>
    </span>
  );
}

/** The close: everything this tray used, one press into the basket — and the
 *  same green fresh, for anyone who would rather eat than grow. */
function Kit({
  shelf,
  finish,
  look,
  t,
}: {
  shelf: GardenShelf;
  finish: TrayFinish;
  look: Look;
  t: T;
}) {
  /* What was used, and the rack it grew on (the owner, 3 Oct 2026); the
     fresh greens are not offered here any more. */
  const items = [shelf.trays[finish], shelf.medium, shelf.seeds[look]].filter(
    (p): p is GardenProduct => !!p,
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<"added" | "failed" | null>(
    items.length > 0 && items.every((p) => p.quickAdd.inCart > 0)
      ? "added"
      : null,
  );
  const addAll = () =>
    start(async () => {
      let ok = true;
      for (const p of items) {
        if (p.quickAdd.inCart > 0) continue;
        const fd = new FormData();
        fd.set("kind", p.kind);
        fd.set("key", p.key);
        fd.set("units", "1");
        const res = await setCartQuantity(IDLE, fd);
        if (res.status === "error") ok = false;
      }
      setResult(ok ? "added" : "failed");
    });
  const rack = shelf.rack;
  return (
    <div className="garden-card-in w-full max-w-sm rounded-2xl bg-cream/95 p-4 md:w-96 shadow-[0_10px_30px_rgba(3,39,24,0.18)] ring-1 ring-forest/10 backdrop-blur-sm">
      {items.length > 0 && (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-forest px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-cream">
            <ShoppingBag size={11} aria-hidden />
            {t("product.forSale")}
          </span>
          <p className="font-display text-lg font-bold text-forest">
            {t("kit.title")}
          </p>
          <ul className="mt-2 divide-y divide-forest/10">
            {items.map((p) => (
              <li
                key={`${p.kind}:${p.key}`}
                className="flex items-center gap-3 py-1.5 font-body text-sm"
              >
                {p.image && (
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                    <Image
                      src={p.image.src}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-contain p-0.5"
                    />
                  </span>
                )}
                {/* The name with its price under it, and a button for each
                    (the owner, 3 Oct 2026). */}
                <span className="min-w-0 flex-1">
                  <ShopLink
                    newTab={t("product.newTab")}
                    href={p.href}
                    className="block truncate font-semibold text-forest hover:underline"
                  >
                    {p.name}
                  </ShopLink>
                  <span className="text-xs text-stone">{p.price}</span>
                </span>
                <QuickAdd {...p.quickAdd} className="shrink-0" />
              </li>
            ))}
            {/* The rack it stood on: sizes and a colour to choose, so a
                way to its range rather than an Add. */}
            {rack && (
              <li className="flex items-center gap-3 py-1.5 font-body text-sm">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                  <Image
                    src={rack.image.src}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-contain p-0.5"
                  />
                </span>
                <ShopLink
                  newTab={t("product.newTab")}
                  href={rack.href}
                  className="min-w-0 flex-1 truncate font-semibold text-forest hover:underline"
                >
                  {rack.name}
                </ShopLink>
                {/* "Add", like the rows above (the owner, 3 Oct 2026), but
                    to the range: a rack's size and colour are chosen there
                    before it can go in the basket. */}
                <ShopLink
                  newTab={t("product.newTab")}
                  href={rack.href}
                  aria-label={`${t("product.add")}: ${rack.name} (${t("product.newTab")})`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-forest px-3 py-1.5 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
                >
                  <Plus size={15} aria-hidden />
                  {t("product.add")}
                </ShopLink>
              </li>
            )}
          </ul>
          {result === "added" ? (
            <Link
              href="/cart"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
            >
              <Check size={16} strokeWidth={2.5} aria-hidden />
              {t("kit.added")} · {t("kit.viewCart")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={addAll}
              disabled={pending}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-70"
            >
              <ShoppingBag size={16} aria-hidden />
              {pending ? t("kit.adding") : t("kit.add")}
            </button>
          )}
          {result === "failed" && (
            <p className="mt-2 font-body text-xs text-terracotta">
              {t("product.failed")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

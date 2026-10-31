import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Check, ChevronDown, MapPin, Minus, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import type { ContentRow } from "@/lib/content/source";
import type { PackSeed, SellablePack } from "@/lib/packs/catalogue";
import { placeholderFor } from "@/lib/images/placeholder";
import { placeholderProps } from "@/lib/images/placeholder-props";
import { PackSteps } from "./PackSteps";

/**
 * The starter packs compared — SPEC §29.3. One column per pack and one row
 * per thing inside it (the owner, 31 Oct 2026: "item list left side and tick
 * under each column", then "a lot of gaps … easy to view and understand").
 *
 * Each row is an item, pictured, with its sizes under the name and its full
 * specs behind "Full specs"; each cell is the count, a tick or a dash (marks
 * drawn beside the count were tried and taken out the same day, 31 Oct 2026).
 * The rows are worked out from the packs' parts, one per rack model, tray and block, so two packs holding different
 * trays would show two rows rather than one row hiding the difference. Every
 * figure comes from the numbers or the parts' own content files.
 */

type Detail = { kind: "specs"; rows: ContentRow[] } | { kind: "seeds"; seeds: PackSeed[] };

type Row = {
  key: string;
  /** A cut-out of the item, or the icon for a service. */
  thumb: { src: string } | { icon: "video" | "onSite" } | null;
  label: string;
  note: string | null;
  detail: Detail | null;
  /** A count, `true` for a service, or null where the pack lacks it. */
  cells: (number | true | null)[];
};

/** One row per distinct part, in the order the packs name them. */
function partRows<T>(
  packs: SellablePack[],
  pick: (p: SellablePack) => { id: string; part: T; count: number } | null,
  describe: (part: T) => Omit<Row, "key" | "cells">,
): Row[] {
  const parts = new Map<string, T>();
  for (const p of packs) {
    const got = pick(p);
    if (got && !parts.has(got.id)) parts.set(got.id, got.part);
  }
  return [...parts].map(([id, part]) => ({
    key: id,
    ...describe(part),
    cells: packs.map((p) => {
      const got = pick(p);
      return got?.id === id ? got.count : null;
    }),
  }));
}

export async function PackCompare({ packs }: { packs: SellablePack[] }) {
  const t = await getTranslations("shop.packs");
  const racks = await getTranslations("shop.racks");
  const colourLabel = await getTranslations("shop.racks.colours");

  /* The seeds row is shared, so it lists the longest menu; the count of
     varieties on offer is printed only while every pack offers the same. */
  const menus = packs.map((p) => p.menu);
  const longest = menus.reduce((a, b) => (b.length > a.length ? b : a), [] as PackSeed[]);
  const sameMenu = menus.every((m) => m.length === longest.length);

  const rows: Row[] = [
    ...partRows(
      packs,
      (p) => (p.rack ? { id: `rack:${p.rack.sku}`, part: p.rack, count: p.pack.rackCount } : null),
      (rack) => ({
        thumb: { src: `/img/racks/${rack.range}/cutout.webp` },
        label: t("rackLabel"),
        note: t("rackNote", {
          height: rack.heightFt,
          shelves: rack.shelves,
          depth: rack.depthFt,
          length: rack.lengthFt,
        }),
        detail: {
          kind: "specs",
          rows: [
            ...(rack.gaugeMm !== null
              ? [{ label: racks("detail.steel"), value: racks("detail.steelValue", { mm: rack.gaugeMm }) }]
              : []),
            ...(rack.colours.length > 0
              ? [
                  {
                    label: racks("detail.colour"),
                    value: t("rackColours", { colours: rack.colours.map((c) => colourLabel(c)).join(", ") }),
                  },
                ]
              : []),
          ],
        },
      }),
    ),
    ...partRows(
      packs,
      (p) => ({ id: `tray:${p.tray.key}`, part: p.tray, count: p.pack.trayCount }),
      (tray) => ({
        thumb: tray.image ? { src: tray.image.src } : null,
        label: tray.name,
        note: tray.specs[0]?.value ?? null,
        detail: { kind: "specs", rows: tray.specs.slice(1) },
      }),
    ),
    {
      key: "seeds",
      thumb: longest[0]?.image ? { src: longest[0].image.src } : null,
      label: t("seedsLabel"),
      note: sameMenu
        ? t("seedsNote", { grams: GRAMS_PER_UNIT, menu: longest.length })
        : t("seedsNoteShort", { grams: GRAMS_PER_UNIT }),
      detail: { kind: "seeds", seeds: longest },
      cells: packs.map((p) => p.pack.seedCount),
    },
    ...partRows(
      packs,
      (p) => (p.medium ? { id: `media:${p.medium.key}`, part: p.medium, count: p.pack.mediumCount } : null),
      (medium) => ({
        thumb: medium.image ? { src: medium.image.src } : null,
        label: medium.name,
        note: null,
        detail: { kind: "specs", rows: medium.specs.slice(1) },
      }),
    ),
    /* Every pack is advised by video; the rack packs also on-site, and the
       row naming the city is there only while some pack offers it (the
       owner's exception to the no-city rule, 30 Oct 2026). */
    {
      key: "video",
      thumb: { icon: "video" },
      label: t("consultVideo"),
      note: t("videoNote"),
      detail: null,
      cells: packs.map(() => true),
    },
    ...(packs.some((p) => p.pack.onSite)
      ? [
          {
            key: "onSite",
            thumb: { icon: "onSite" as const },
            label: t("onSiteRow"),
            note: t("onSiteNote"),
            detail: null,
            cells: packs.map((p) => p.pack.onSite || null),
          },
        ]
      : []),
  ];

  /* Below lg the item runs across the full width above its cells, so each
     pack keeps a column wide enough for its price without the page scrolling
     sideways; from lg the items take a column of their own on the left and
     the featured pack's column is outlined from its head to its last row.
     The corner above the items holds the steps, where it would otherwise be
     a blank the height of the heads. */
  const grid =
    "grid gap-x-2 grid-cols-[repeat(var(--packs),minmax(0,1fr))] md:gap-x-4 lg:gap-x-0 lg:grid-cols-[minmax(0,1.8fr)_repeat(var(--packs),minmax(0,1fr))]";

  return (
    <div role="table" aria-label={t("compare")} style={{ "--packs": packs.length } as CSSProperties}>
      <div role="row" className={grid}>
        {/* Named by its heading alone, so the steps above it are not read out
            as the items' column header. */}
        <div
          role="columnheader"
          aria-label={t("boxHeading")}
          className="sr-only lg:not-sr-only lg:row-span-6 lg:flex lg:flex-col lg:justify-between lg:gap-6 lg:pb-5 lg:pr-12 lg:pt-1"
        >
          <PackSteps className="hidden lg:block" />
          <span>
            <span className="block font-display text-2xl font-bold tracking-tight text-forest">
              {t("boxHeading")}
            </span>
            <span
              aria-hidden
              className="mt-4 hidden flex-wrap gap-x-5 gap-y-2 font-body text-xs text-stone lg:flex"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-forest text-cream">
                  <Check size={12} strokeWidth={3} />
                </span>
                {t("legendIn")}
              </span>
              <span className="flex items-center gap-2">
                <Minus size={16} className="text-forest/30" />
                {t("legendOut")}
              </span>
            </span>
          </span>
        </div>
        {packs.map((p) => (
          <PackHead key={p.pack.contentKey} sellable={p} />
        ))}
      </div>

      {rows.map((row, r) => (
        <CompareRow key={row.key} row={row} last={r === rows.length - 1} packs={packs} grid={grid} />
      ))}
    </div>
  );
}

async function CompareRow({
  row,
  last,
  packs,
  grid,
}: {
  row: Row;
  last: boolean;
  packs: SellablePack[];
  grid: string;
}) {
  const t = await getTranslations("shop.packs");
  const format = await getFormatter();

  return (
    <div role="row" className={grid}>
      <div
        role="rowheader"
        className={`col-span-full flex gap-3 pb-1 pt-6 lg:col-span-1 lg:gap-4 lg:py-4 lg:pr-12 ${
          last ? "" : "lg:border-b lg:border-forest/10"
        }`}
      >
        <Thumb thumb={row.thumb} />
        <div className="min-w-0 flex-1 self-center">
          <p className="font-body text-sm font-semibold text-forest">{row.label}</p>
          {row.note && <p className="mt-0.5 font-body text-xs leading-relaxed text-stone">{row.note}</p>}
          {row.detail && (row.detail.kind === "seeds" || row.detail.rows.length > 0) && (
            <details className="group mt-1">
              <summary className="inline-flex list-none items-center gap-1 font-body text-xs font-semibold text-forest underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                {row.detail.kind === "seeds" ? t("seedsDetail") : t("details")}
                <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
              </summary>
              {row.detail.kind === "specs" ? (
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-body text-xs">
                  {row.detail.rows.map((spec) => (
                    <div key={spec.label} className="contents">
                      <dt className="text-stone">{spec.label}</dt>
                      <dd className="text-forest">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {row.detail.seeds.map((seed) => (
                    <li
                      key={seed.key}
                      className="flex items-center gap-1.5 rounded-full bg-sand py-1 pl-1 pr-2.5 font-body text-xs text-forest"
                    >
                      {seed.image ? (
                        <span className="relative size-5 shrink-0" aria-hidden>
                          <Image
                            src={seed.image.src}
                            alt=""
                            fill
                            sizes="20px"
                            className="object-contain"
                            {...placeholderProps(placeholderFor(seed.image.src), "contain")}
                          />
                        </span>
                      ) : (
                        <span className="size-1.5 shrink-0 rounded-full bg-forest" aria-hidden />
                      )}
                      {seed.name}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )}
        </div>
      </div>

      {row.cells.map((cell, c) => {
        const featured = packs[c].pack.recommended;
        return (
          <div
            key={packs[c].pack.contentKey}
            role="cell"
            className={`flex items-center justify-center py-3 lg:py-4 ${last ? "" : "border-b border-forest/10"} ${
              featured
                ? `lg:border-x-2 lg:border-x-forest ${last ? "lg:rounded-b-3xl lg:border-b-2 lg:border-b-forest" : ""}`
                : ""
            }`}
          >
            {cell === null ? (
              <>
                <Minus size={16} aria-hidden className="text-forest/30" />
                <span className="sr-only">{t("notIncluded")}</span>
              </>
            ) : cell === true ? (
              <>
                <span
                  aria-hidden
                  className="flex size-6 items-center justify-center rounded-full bg-forest text-cream lg:size-7"
                >
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="sr-only">{t("included")}</span>
              </>
            ) : (
              <span className="font-display text-lg font-bold tabular-nums text-forest lg:text-xl">
                {format.number(cell)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Thumb({ thumb }: { thumb: Row["thumb"] }): ReactNode {
  if (thumb === null) return <span className="size-10 shrink-0 lg:size-12" aria-hidden />;
  if ("icon" in thumb) {
    const Icon = thumb.icon === "video" ? Video : MapPin;
    return (
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest text-cream lg:size-12"
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span aria-hidden className="relative size-10 shrink-0 rounded-full bg-sand lg:size-12">
      <Image
        src={thumb.src}
        alt=""
        fill
        sizes="48px"
        className="object-contain p-1.5"
        {...placeholderProps(placeholderFor(thumb.src), "contain")}
      />
    </span>
  );
}

/** A pack's column head — a subgrid of the header row (badge, name, tagline
 *  from md, price, tax note, button), so a name that wraps to three lines in
 *  Kannada pushes every column's price down with it. */
async function PackHead({ sellable }: { sellable: SellablePack }) {
  const t = await getTranslations("shop.packs");
  const { pack, text } = sellable;
  const featured = pack.recommended;

  return (
    <div
      role="columnheader"
      className={`row-span-5 grid grid-rows-subgrid justify-items-center px-2 py-4 text-center md:row-span-6 md:px-4 lg:justify-items-start lg:px-6 lg:pb-6 lg:pt-6 lg:text-left ${
        featured ? "rounded-2xl bg-forest lg:rounded-b-none lg:rounded-t-3xl" : ""
      }`}
    >
      <span
        className={`self-start rounded-full px-2.5 py-1 font-body text-[10px] font-semibold uppercase leading-tight tracking-wider md:px-3 md:text-[11px] md:tracking-widest ${
          featured ? "bg-cream text-forest" : "bg-bark text-cream"
        }`}
      >
        {text.badge}
      </span>
      <h2
        className={`mt-3 font-display text-base font-bold leading-tight tracking-tight md:text-xl lg:text-2xl ${
          featured ? "text-cream" : "text-forest"
        }`}
      >
        {text.name}
      </h2>
      <p className={`mt-1 hidden font-body text-sm md:block ${featured ? "text-mint" : "text-stone"}`}>
        {text.tagline}
      </p>
      <p
        className={`mt-3 font-display text-xl font-bold md:text-2xl lg:mt-4 lg:text-3xl ${
          featured ? "text-cream" : "text-forest"
        }`}
      >
        ₹{pack.price.toLocaleString("en-IN")}
      </p>
      <p className={`font-body text-[10px] md:text-xs ${featured ? "text-mint" : "text-stone"}`}>
        {t("taxNote")}
      </p>
      <div className="w-full self-end pt-4 lg:pt-5">
        <Link
          href={`/shop/packs/${pack.contentKey}`}
          aria-label={t("chooseNamed", { name: text.name })}
          className={`block w-full rounded-full border px-3 py-2.5 text-center font-body text-xs font-semibold transition-colors md:text-sm lg:py-3 ${
            featured
              ? "border-cream bg-cream text-forest hover:border-sage hover:bg-sage"
              : "border-forest bg-forest text-cream hover:bg-forest-deep"
          }`}
        >
          <span className="md:max-lg:hidden xl:hidden">{t("chooseShort")}</span>
          <span className="hidden md:max-lg:inline xl:inline">{t("choose")}</span>
        </Link>
      </div>
    </div>
  );
}

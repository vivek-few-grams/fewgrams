"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, PackageX, Search, X } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { sanitiseKey } from "@/lib/content/content-key";
import { shelfPacks } from "@/lib/seeds/stock";
import type { Seed } from "@/lib/types";
import { correctSeedStock, removeSeed, toggleSeedActive } from "./actions";
import { CostCell, OnBills, StockCount } from "../StockCells";
import { SupplierPicker, type VendorChoice } from "../vendors/SupplierPicker";

/** The row's vendor picker (`SupplierPicker`): who to offer, who is ticked. */
type Picker = { supplyKey: string; vendors: VendorChoice[]; selected: string[] };

/**
 * The seed shelf — cost, price and grams held, one row per seed.
 *
 * Built on the same bones as `VarietyTable`: one shared `grid-template-columns`
 * between the header and every row, a client-side filter because the whole
 * list is already in the page, and three `<form>` elements per row with
 * `display: contents` so they can share the row's grid. The reasoning for each
 * of those is written out in `varieties/VarietyRow.tsx`; what follows is what
 * is different here.
 *
 * ## Nothing on the row is typed but a stocktake (18 Oct 2026)
 *
 * The cost comes from the latest purchase bill and links to it; the grams
 * held move with bills, orders and sowings. What is left in the row is the
 * pencil beside the grams, for a count that disagrees with the shelf — see
 * `actions.ts`.
 *
 * It is also the only screen in the app where the figure appears at all: since
 * 17 Sep 2026 the customer-facing pages do not print it (SPEC §22.2).
 *
 * ## The derived column is the limit — changed back 25 Sep 2026
 *
 * From 17 to 25 Sep 2026 any quantity could be ordered and the shelf only set
 * the speed. The owner reversed that: what is held, in whole 100 g packs, is
 * the most a customer can order, and an empty shelf is **sold out** (SPEC
 * §22.2, `src/lib/seeds/stock.ts`). So the column reads as a limit again, and
 * an empty row is flagged.
 *
 * ## The price is worked out, not typed (3 Oct 2026)
 *
 * The sell price is the cost per 100 g plus the seeds margin, set above the
 * table, and is shown rather than edited — the owner's rule for every screen.
 */
const COLUMNS =
  "minmax(10rem,1.5fr) minmax(6.5rem,0.9fr) minmax(5rem,0.8fr) minmax(6rem,0.9fr) minmax(9.5rem,1fr) minmax(6rem,1fr) 6.5rem 4rem";

/**
 * Below this the rows scroll sideways inside their own box rather than
 * widening the page.
 *
 * The same fix the rack tables carry, and for the same reason: a row's tracks
 * come from an inline `gridTemplateColumns`, so they apply at *every* width,
 * and at 414px the price, stock, Save, Active and Delete cells pushed the whole
 * document 785px wide — taking the admin nav rail with it.
 *
 * Stacking to one column is not the alternative: a compact row's inputs carry
 * their label only as an `aria-label`, so it would leave an operator two
 * unlabelled boxes and no way to tell the price from the grams.
 */
const MIN_WIDTH = "min-w-[64rem]";

export function SeedTable({
  seeds,
}: {
  seeds: Array<{ seed: Seed; name: string | null; bills: number; picker: Picker }>;
}) {
  const t = useTranslations("admin.seeds");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return seeds;
    /* Matches the display name and the key, normalising the query the same way
       a key is normalised — so typing "China Rose" finds `china-rose`. */
    const asKey = sanitiseKey(q);
    return seeds.filter((s) => s.seed.contentKey.includes(asKey) || (s.name ?? "").toLowerCase().includes(q));
  }, [seeds, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold text-forest">
          {t("savedCount", { count: seeds.length })}
        </h2>

        {/* Only worth the space once there is something to sift through. */}
        {seeds.length > 3 && (
          <div className="flex items-center gap-3">
            <label className="relative">
              <span className="sr-only">{t("search")}</span>
              <Search
                size={15}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-64 rounded-full border border-forest/25 bg-cream py-1.5 pl-9 pr-3 font-body text-sm outline-none placeholder:text-stone/60 focus:border-forest"
              />
            </label>
            {query && (
              <>
                <span className="font-body text-xs tabular-nums text-stone">
                  {t("searchCount", { shown: shown.length, total: seeds.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="flex items-center gap-1 font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
                >
                  <X size={12} strokeWidth={2} />
                  {t("clearSearch")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {seeds.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
          {t("emptyList")}
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
          {t("searchNone", { query: query.trim() })}
        </p>
      ) : (
        /* The scroll box wraps the header *and* the rows, so they scroll
           together and stay aligned. */
        <div className="overflow-x-auto">
          <div className={`${MIN_WIDTH} space-y-2`}>
            {/* Column headings, hidden below `lg` where the table is scrolled
              rather than stacked and every input carries its own label as its
              accessible name instead. */}
            <div style={{ gridTemplateColumns: COLUMNS }} className="hidden gap-x-3 px-4 lg:grid">
              {[
                t("colSeed"),
                t("colCost"),
                t("colPrice"),
                t("colMargin"),
                t("colStock"),
                t("colPacks"),
                t("colActive"),
                "",
              ].map((heading, i) => (
                <span key={i} className="font-body text-[10px] uppercase tracking-wider text-stone">
                  {heading}
                </span>
              ))}
            </div>

            {shown.map(({ seed, name, bills, picker }) => (
              <SeedRow key={seed.id} seed={seed} name={name} bills={bills} picker={picker} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeedRow({
  seed,
  name,
  bills,
  picker,
}: {
  seed: Seed;
  name: string | null;
  /** Bills that name it — none, and it can be deleted. */
  bills: number;
  picker: Picker;
}) {
  const t = useTranslations("admin.seeds");
  const tc = useTranslations("admin.common");

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className={`grid items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:gap-y-0 ${
        name ? "border-forest/12 bg-cream" : "border-terracotta/40 bg-terracotta/5"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-body text-sm font-semibold text-forest">{name ?? seed.contentKey}</p>
        <code className="font-body text-[11px] text-stone">{seed.contentKey}</code>
        <SupplierPicker {...picker} item={name ?? seed.contentKey} />
      </div>

      <CostCell cost={seed.costPer100g} source={seed.costBill} />
      {/* Worked out from the cost and the margin, never typed. */}
      <span className="font-body text-sm tabular-nums text-forest">
        {t("priceValue", { amount: seed.pricePer100g })}
      </span>
      <span className="font-body text-sm tabular-nums text-stone">
        {seed.costPer100g === undefined
          ? "—"
          : t("marginValue", {
              amount: Math.round(seed.pricePer100g - seed.costPer100g),
              percent: Math.round(((seed.pricePer100g - seed.costPer100g) / seed.costPer100g) * 100),
            })}
      </span>
      <StockCount
        id={seed.id}
        value={seed.stockGrams}
        unit="grams"
        correct={correctSeedStock}
        align="start"
      />

      <PacksCell grams={seed.stockGrams} />

      {/* A seed no bill has costed yet is priced at 0, so it cannot be
          switched on — the chip says why instead of offering the switch. */}
      {!seed.active && seed.costPer100g === undefined ? (
        <span className="rounded-full bg-forest/10 px-3 py-1 text-center font-body text-[11px] text-stone">
          {t("needsBill")}
        </span>
      ) : (
        <form action={toggleSeedActive} className="contents">
          <input type="hidden" name="id" value={seed.id} />
          <button
            /* Hover moves in the direction of what the click does: greener when
               it will switch on, plain when off. */
            className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
              seed.active
                ? "bg-sage text-forest hover:bg-forest hover:text-cream"
                : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
            }`}
          >
            {seed.active ? t("colActive") : t("hidden")}
          </button>
        </form>
      )}

      {bills > 0 ? (
        <OnBills count={bills} />
      ) : (
        <form action={removeSeed} className="contents">
          <input type="hidden" name="id" value={seed.id} />
          <ConfirmSubmit
            label={tc("delete")}
            title={t("deleteTitle")}
            message={t("deleteConfirm")}
            confirmLabel={tc("confirmDelete")}
            cancelLabel={tc("cancel")}
            className="font-body text-xs text-terracotta underline underline-offset-2 hover:text-terracotta/80"
          />
        </form>
      )}

      {/* Added from a bill that is not saved yet: no cost, price 0. */}
      {seed.costPer100g === undefined && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("costMissing")}
        </p>
      )}

      {!name && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("missingContentHint", { key: seed.contentKey })}
        </p>
      )}
    </div>
  );
}

/**
 * What the grams in the field allow customers to order: whole 100 g packs,
 * rounded down — 250 g is two. That is also the cap on ordering (the owner,
 * 25 Sep 2026), so zero is **sold out**.
 */
function PacksCell({ grams }: { grams: number }) {
  const t = useTranslations("admin.seeds");
  const packs = shelfPacks(grams);

  if (packs === 0) {
    /* Terracotta: customers now see this seed as sold out. */
    return (
      <p className="flex items-center gap-1.5 font-body text-xs font-semibold text-terracotta">
        <PackageX size={13} strokeWidth={2} className="shrink-0" />
        {t("soldOut")}
      </p>
    );
  }

  return <p className="font-body text-xs tabular-nums text-stone">{t("packs", { count: packs })}</p>;
}

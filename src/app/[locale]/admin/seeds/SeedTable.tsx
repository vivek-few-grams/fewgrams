"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Search, Truck, X } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { IDLE, type FormState } from "@/lib/forms";
import { sanitiseKey } from "@/lib/content/content-key";
import { shelfPacks } from "@/lib/seeds/stock";
import type { Seed } from "@/lib/types";
import { removeSeed, toggleSeedActive, updateSeed } from "./actions";
import { NumberField } from "../fields";

/**
 * The seed shelf — price and grams held, editable in place.
 *
 * Built on the same bones as `VarietyTable`: one shared `grid-template-columns`
 * between the header and every row, a client-side filter because the whole
 * list is already in the page, and three `<form>` elements per row with
 * `display: contents` so they can share the row's grid. The reasoning for each
 * of those is written out in `varieties/VarietyRow.tsx`; what follows is what
 * is different here.
 *
 * ## Stock is the column that changes daily
 *
 * A variety's numbers get tuned after a few sows. A seed's stock changes every
 * time a sack is opened or an order goes out, so this table is built for one
 * job: **count the shelf, type the figure, save the row.** That is why stock
 * is an editable field in the row rather than behind an edit screen, and why
 * there is no "adjust by" control — see `actions.ts` for why a count beats a
 * ledger.
 *
 * It is also the only screen in the app where the figure appears at all: since
 * 17 Sep 2026 the customer-facing pages do not print it (SPEC §22.2).
 *
 * ## The derived column is a *speed*, not a limit — changed 17 Sep 2026
 *
 * It used to read "Sells as 2 packs", because stock was the ceiling on what a
 * customer could order. The owner replaced that rule: any quantity can be
 * ordered, and the shelf decides whether it goes out tomorrow or is bought in
 * on a ten-day promise (SPEC §22.2, `src/lib/seeds/stock.ts`).
 *
 * So the column now answers the question the owner actually has standing at the
 * shelf — **how much of an order could I fill in the morning** — and an empty
 * row says "bought in", not "out of stock". Getting that wording wrong here
 * would be the worst kind of error on this screen: it would tell the owner a
 * seed is unsellable when the site is still happily taking orders for it.
 */
const COLUMNS =
  "minmax(10rem,1.5fr) minmax(5rem,0.8fr) minmax(5.5rem,0.9fr) minmax(6rem,1fr) 6rem 5.5rem 4rem";

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
const MIN_WIDTH = "min-w-[48rem]";

export function SeedTable({
  seeds,
}: {
  seeds: Array<{ seed: Seed; name: string | null }>;
}) {
  const t = useTranslations("admin.seeds");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return seeds;
    /* Matches the display name and the key, normalising the query the same way
       a key is normalised — so typing "China Rose" finds `china-rose`. */
    const asKey = sanitiseKey(q);
    return seeds.filter(
      (s) =>
        s.seed.contentKey.includes(asKey) || (s.name ?? "").toLowerCase().includes(q),
    );
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
          <div
            style={{ gridTemplateColumns: COLUMNS }}
            className="hidden gap-x-3 px-4 lg:grid"
          >
            {[t("colSeed"), t("colPrice"), t("colStock"), t("colPacks"), "", t("colActive"), ""].map(
              (heading, i) => (
                <span
                  key={i}
                  className="font-body text-[10px] uppercase tracking-wider text-stone"
                >
                  {heading}
                </span>
              ),
            )}
          </div>

          {shown.map(({ seed, name }) => (
            <SeedRow key={seed.id} seed={seed} name={name} />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function SeedRow({ seed, name }: { seed: Seed; name: string | null }) {
  const t = useTranslations("admin.seeds");
  const tc = useTranslations("admin.common");
  const [state, action, pending] = useActionState<FormState, FormData>(updateSeed, IDLE);
  /* Live, so typing 250 shows "2 packs next day" before the row is saved —
     what the shelf can fill this morning, next to the figure being typed. */
  const [stock, setStock] = useState(seed.stockGrams);

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? t(`errors.${state.code}`, state.values ?? {})
      : undefined;

  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className={`grid items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 lg:gap-y-0 ${
        name ? "border-forest/12 bg-cream" : "border-terracotta/40 bg-terracotta/5"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-body text-sm font-semibold text-forest">
          {name ?? seed.contentKey}
        </p>
        <code className="font-body text-[11px] text-stone">{seed.contentKey}</code>
      </div>

      <form action={action} className="contents">
        <input type="hidden" name="id" value={seed.id} />
        {/* Active is owned by its own toggle, so the save form carries the
            current value forward rather than clearing it. */}
        <input type="hidden" name="active" value={seed.active ? "on" : "off"} />

        <NumberField
          compact
          label={t("colPrice")}
          name="pricePer100g"
          min={1}
          defaultValue={seed.pricePer100g}
          error={errorFor("pricePer100g")}
        />
        <NumberField
          compact
          label={t("colStock")}
          name="stockGrams"
          min={0}
          value={Number.isFinite(stock) ? stock : ""}
          onChange={(event) => setStock(Number(event.target.value))}
          error={errorFor("stockGrams")}
        />

        <PacksCell grams={stock} />

        <button
          type="submit"
          disabled={pending}
          className="flex items-center justify-center gap-1.5 rounded-full border border-forest/25 px-4 py-1.5 font-body text-xs font-semibold text-forest transition-colors hover:bg-forest hover:text-cream disabled:opacity-60"
        >
          {state.status === "saved" && !pending && (
            <Check size={13} strokeWidth={2.5} className="text-forest" />
          )}
          {state.status === "saved" && !pending ? t("savedRow") : t("save")}
        </button>
      </form>

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

      {!name && (
        <p className="col-span-full flex items-start gap-1.5 font-body text-[11px] text-terracotta">
          <AlertTriangle size={12} strokeWidth={1.75} className="mt-px shrink-0" />
          {t("missingContentHint", { key: seed.contentKey })}
        </p>
      )}

      {/* **Any** error, not just a form-level one — fixed 17 Sep 2026.
          `NumberField`'s `compact` variant returns a bare input so the row
          stays aligned with its header, which means a field error rendered
          only as a red border and `aria-invalid`: an operator saw that a
          figure was refused and never why. */}
      {state.status === "error" && (
        <p className="col-span-full font-body text-[11px] text-terracotta">
          {t(`errors.${state.code}`, state.values ?? {})}
        </p>
      )}
    </div>
  );
}

/**
 * What the grams in the field can fill from the shelf tomorrow.
 *
 * Two states. Whole packs, rounded down — 250 g fills two, and the odd 50 g
 * cannot fill a pack on its own. Nothing here is a cap on ordering; see the
 * note at the top of the file.
 */
function PacksCell({ grams }: { grams: number }) {
  const t = useTranslations("admin.seeds");
  const packs = shelfPacks(grams);

  if (packs === 0) {
    /* Not terracotta, and not an alarm. Nothing is broken and nothing is
       unsellable — every order for this seed simply goes on the vendor run.
       Colouring it like the missing-content flag would send the owner looking
       for a fault that is not there. */
    return (
      <p className="flex items-center gap-1.5 font-body text-xs font-semibold text-stone">
        <Truck size={13} strokeWidth={2} className="shrink-0" />
        {t("vendorOnly")}
      </p>
    );
  }

  return (
    <p className="font-body text-xs tabular-nums text-stone">
      {t("packs", { count: packs })}
    </p>
  );
}

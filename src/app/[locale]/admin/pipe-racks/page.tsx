import { getTranslations } from "next-intl/server";
import {
  PIPE_MAX_HEIGHT_FT,
  PIPE_MID_SUPPORT_FROM_LENGTH_FT,
  PIPE_MID_SUPPORT_LEGS,
  pipeRackConnectors,
  pipeRackCost,
  pipeRackFeet,
  retailPrice,
  type RateCard,
} from "@/lib/racks/pricing";
import { listPipeRackModels, loadRateCard, priceable } from "@/lib/repo/racks";
import type { PipeRackModel } from "@/lib/types";
import { PipeRackTable, type PipeRackView } from "./PipeRackTable";
import { PipeRates } from "./PipeRates";
import { PipeSizeTable } from "./PipeSizeTable";

export const dynamic = "force-dynamic";

/**
 * `/admin/pipe-racks` — SPEC §21.
 *
 * The third rack category: **a rack built from 1 inch UPVC pipe, joined with
 * four-way connectors.** The owner's reason, 17 Sep 2026: *"in this the
 * stability is a bit important."* Not price — it is the dearest of the three
 * ranges, because the fittings cost more than the pipe.
 *
 * ## Why it is its own page, and why it has a rates form when the angle
 * screen does not
 *
 * | | Plated | Angle frame | Pipe |
 * |---|---|---|---|
 * | Corner legs | 4 × height × ₹/ft | the same | the same count, pipe rate |
 * | A shelf | a bought plate | 3 × length + 2 × depth ft of angle | 2 × (length + depth) ft of pipe |
 * | Fasteners | 8 bolt pairs a shelf | the same | a four-way per leg per level |
 * | Bushes | 4 a rack | the same | one per **leg** |
 * | Long spans | nothing | mid-rail, on the shelf | mid **leg**, under the shelf |
 * | Markup, rounding, heights | shared `RackSettings` | the same row | the same row |
 *
 * The angle range shares every *material* rate with the plated range, so a
 * rates form there would be a second place to change a bolt price. This range
 * shares none of them — nothing else in the catalogue buys pipe, connectors or
 * pipe bushes — so those three rates have no other home and the form belongs
 * here. What is genuinely shared is still edited on `/admin/racks` and shown
 * here read-only with a link.
 *
 * Two more things this range does not have: a **gauge** and a **colour**. Pipe
 * is pipe and it is white, so a footprint plus a height is the whole of a
 * model, and the tables are a column narrower than the other two.
 *
 * One thing it has that they do not: a **height cap**. `PIPE_MAX_HEIGHT_FT` is
 * 6 ft, the owner's figure, and it is enforced here rather than in the shared
 * heights list — which two steel ranges use and which has no such limit.
 *
 * Shelves are still `height − 1`, and the price is still frozen at publish
 * against `costAtPublish`. Both mechanisms are described on `/admin/racks` and
 * behave identically here.
 *
 * **No customer view**, same as the other two ranges: the owner asked for
 * admin first, so nothing here writes to the product catalogue.
 */
export default async function PipeRacksAdmin() {
  const t = await getTranslations("admin.pipeRacks");

  const [stored, models] = await Promise.all([loadRateCard(), listPipeRackModels()]);
  const card = priceable(stored);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introRule")}</p>
          <p className="font-body text-sm text-stone">{t("introCost")}</p>
          <p className="font-body text-sm text-stone">{t("introShared")}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 bg-sand/40 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("ratesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("ratesHint")}</p>
        <PipeRates
          pipeSettings={stored.pipeSettings}
          settings={stored.settings}
          maxHeightFt={PIPE_MAX_HEIGHT_FT}
        />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("sizesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("sizesHint")}</p>
        <PipeSizeTable
          sizes={stored.pipes}
          /* Four, from the shared rates — the same four corners as a steel
             rack. Defaulted only so the table still renders before any rates
             exist; the figure it shows then is not used to price anything. */
          cornerLegs={stored.settings?.legsPerRack ?? 4}
          midSupportFromLengthFt={PIPE_MID_SUPPORT_FROM_LENGTH_FT}
          midSupportLegs={PIPE_MID_SUPPORT_LEGS}
        />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("racksTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("racksHint")}</p>
        <PipeRackTable
          views={models.map((m) => view(m, card))}
          /* Active footprints only. An existing rack may still reference a
             retired one — it is flagged, not rewritten — but a new rack must
             not be built on something no longer offered. */
          sizes={stored.pipes.filter((p) => p.active)}
          settings={stored.settings}
          hasRates={stored.pipeSettings !== null}
          maxHeightFt={PIPE_MAX_HEIGHT_FT}
          midSupportFromLengthFt={PIPE_MID_SUPPORT_FROM_LENGTH_FT}
          midSupportLegs={PIPE_MID_SUPPORT_LEGS}
        />
      </section>
    </div>
  );
}

/** Everything a row needs, computed here so the client component holds no
 *  pricing logic. The one module that does is `src/lib/racks/pricing.ts`. */
function view(model: PipeRackModel, card: RateCard | null): PipeRackView {
  const size = card?.pipes.find((p) => p.id === model.config.pipeSizeId) ?? null;
  const cost = card ? pipeRackCost(model.config, card) : null;

  return {
    model,
    costNow: cost?.total ?? null,
    suggestedPrice: cost && card ? retailPrice(cost.total, card.settings) : null,
    depthFt: size?.depthFt ?? null,
    lengthFt: size?.lengthFt ?? null,
    /* The two figures that check against a vendor invoice. No load figure and
       no colour: there is no rated deck and there is one pipe spec. */
    pipeFt: card ? pipeRackFeet(model.config, card) : null,
    connectors: card ? pipeRackConnectors(model.config, card) : null,
  };
}

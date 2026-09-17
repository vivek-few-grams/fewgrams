import { getTranslations } from "next-intl/server";
import {
  angleRackCost,
  angleRackFeet,
  retailPrice,
  type RateCard,
} from "@/lib/racks/pricing";
import { listAngleRackModels, loadRateCard, priceable } from "@/lib/repo/racks";
import type { AngleRackModel } from "@/lib/types";
import { AngleRackTable, type AngleRackView } from "./AngleRackTable";
import { FrameTable } from "./FrameTable";
import { SharedRates } from "./SharedRates";

export const dynamic = "force-dynamic";

/**
 * `/admin/angle-racks` — SPEC §20.
 *
 * The second rack category: **a rack built entirely from slotted angle, with
 * no steel shelf plates at all.** The owner's description, 17 Sep 2026: each
 * shelf level is a rectangle of angle plus one more length down the middle,
 * which braces the span and carries an LED tube. A 4 ft × 1 ft level is
 * therefore three 4 ft pieces and two 1 ft pieces — 14 running feet — and
 * `frameFeetPerShelf` is the whole of that rule.
 *
 * ## Why this is its own page and not a flag on `/admin/racks`
 *
 * Everything that *changes* is shared, and everything that *differs* is a
 * different table.
 *
 * | | Plated rack | Open frame |
 * |---|---|---|
 * | Legs | 4 × height × ₹/ft | the same |
 * | Bolts, bushes | 8 pairs a shelf, 4 bushes a rack | the same, on the owner's call |
 * | Markup, rounding, heights | shared `RackSettings` | the same row |
 * | A shelf | a bought plate, own price and load rating | 3 × length + 2 × depth feet of angle |
 *
 * So the rates live once, on `/admin/racks`, and are shown here read-only with
 * a link — a second form writing the same DynamoDB item would be a second
 * place to change a bolt price and one of them to forget. What this screen
 * owns is the two things that are genuinely its own: the footprints, which
 * have no price and no capacity, and which open-frame racks are on sale.
 *
 * Shelves are still `height − 1`, and the price is still frozen at publish
 * against `costAtPublish` — a rate edit moves the cost and flags the row,
 * never the price a customer is looking at. Both mechanisms are described on
 * `/admin/racks` and behave identically here; sharing them was the reason to
 * put both categories through one pricing module.
 *
 * **No customer view**, same as the plated range: the owner asked for admin
 * first, so nothing here writes to the product catalogue.
 */
export default async function AngleRacksAdmin() {
  const t = await getTranslations("admin.angleRacks");

  const [stored, models] = await Promise.all([loadRateCard(), listAngleRackModels()]);
  const card = priceable(stored);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introRule")}</p>
          <p className="font-body text-sm text-stone">{t("introShared")}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 bg-sand/40 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("ratesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("ratesHint")}</p>
        <SharedRates settings={stored.settings} angles={stored.angles} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("framesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("framesHint")}</p>
        <FrameTable frames={stored.frames} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("racksTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("racksHint")}</p>
        <AngleRackTable
          views={models.map((m) => view(m, card))}
          /* Active parts only. An existing rack may still reference a retired
             footprint — it is flagged, not rewritten — but a new one must not
             be built on something no longer offered. */
          frames={stored.frames.filter((f) => f.active)}
          angles={stored.angles.filter((a) => a.active)}
          settings={stored.settings}
        />
      </section>
    </div>
  );
}

/** Everything a row needs, computed here so the client component holds no
 *  pricing logic. The one module that does is `src/lib/racks/pricing.ts`. */
function view(model: AngleRackModel, card: RateCard | null): AngleRackView {
  const frame = card?.frames.find((f) => f.id === model.config.frameId) ?? null;
  const angle = card?.angles.find((a) => a.id === model.config.angleId) ?? null;
  const cost = card ? angleRackCost(model.config, card) : null;

  return {
    model,
    costNow: cost?.total ?? null,
    suggestedPrice: cost && card ? retailPrice(cost.total, card.settings) : null,
    depthFt: frame?.depthFt ?? null,
    lengthFt: frame?.lengthFt ?? null,
    thicknessMm: angle?.thicknessMm ?? null,
    /* From the grade, not from the model — a rack does not pick a colour, and
       every colour its grade comes in is available on it. */
    colours: angle?.colours ?? [],
    /* No load figure: there is no deck to rate. See `FrameSize`. */
    angleFt: card ? angleRackFeet(model.config, card) : null,
  };
}

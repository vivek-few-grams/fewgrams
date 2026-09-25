import { getTranslations } from "next-intl/server";
import { rackCost, retailPrice, type RateCard } from "@/lib/racks/pricing";
import { listRackModels, loadRateCard, priceable } from "@/lib/repo/racks";
import type { RackModel } from "@/lib/types";
import { AngleTable } from "./AngleTable";
import { ModelTable, type RackModelView } from "./ModelTable";
import { PlateTable } from "./PlateTable";
import { RatesForm } from "./RatesForm";
import { SeedButton } from "./SeedButton";
import { VendorPickupSection } from "../vendor-pickup/VendorPickupSection";
import { SHELF_RACK_ITEM } from "@/lib/shipping/origin";

export const dynamic = "force-dynamic";

/**
 * `/admin/racks` — SPEC §19.
 *
 * **A rack's price is calculated from what it is made of, never typed in.**
 * That is the owner's requirement, in their words: *"the cost of the bolt can
 * change, the cost of the bushes can change, even the shelf price can change,
 * so I don't want to recalculate the prices again."* Storing a finished price
 * per rack would make every vendor requote a spreadsheet exercise across the
 * whole range; storing the components makes it one edited number.
 *
 * Three layers, in the order they change:
 *
 * | Section | Changes | Owns |
 * |---|---|---|
 * | Rates and build rules | often, when the vendor requotes | bolt, bush, markup, rounding, assembly counts |
 * | Shelf plates / Angle grades | when the range changes | the vendor's two size lists |
 * | Racks on sale | rarely | which combinations are offered, and their frozen prices |
 *
 * The middle two are tables because the vendor's sheet is a table. The first
 * is a form because it is one row. The last is a table of *products*, not of
 * parts, and it is the only one holding a price a customer would see.
 *
 * **There is no cost matrix.** One existed — every shelf size against every
 * angle grade at a selectable height — and it was removed on 17 Sep 2026 as
 * redundant: `Racks on sale` already shows live cost, price and margin for the
 * racks that are actually offered, so the matrix's only unique contribution
 * was fifteen combinations nobody sells. The owner asked what it was for
 * twice, which was the answer. `PriceMatrix.tsx` and its `?h=` plumbing went
 * with it rather than being left unreachable.
 *
 * **Why the price is frozen rather than derived on read.** A rate edit must
 * never silently move a price somebody is looking at, or one already in a
 * cart. So each rack records the cost it was priced against, the screen
 * recomputes cost live, and a difference is surfaced with both figures and a
 * republish button. That turns "steel went up" into a visible list and one
 * click — which is what the owner asked for — without making the shop price a
 * moving target.
 *
 * **No customer view.** Explicitly out of scope: the owner asked for the admin
 * screen first. `RackModel` therefore carries no customer-facing name and
 * nothing here writes to the product catalogue, because a rack model becomes a
 * `ProductVariant` only when there is a page to render it on. Half a
 * projection would be a second answer to "what racks do we sell".
 */
export default async function RacksAdmin() {
  const t = await getTranslations("admin.racks");

  const [stored, models] = await Promise.all([loadRateCard(), listRackModels()]);
  const card = priceable(stored);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introLayers")}</p>
          <p className="font-body text-sm text-stone">{t("introFrozen")}</p>
        </div>
      </section>

      {/* Offered only while there is something to seed. Once the card is
          populated the button is noise, and a button next to live prices whose
          only purpose is to write over them is worse than noise. */}
      {(!stored.settings || stored.plates.length === 0 || stored.angles.length === 0) && (
        <section className="rounded-2xl border border-forest/15 bg-sand p-6">
          <h2 className="font-display text-lg font-semibold text-forest">{t("seedTitle")}</h2>
          <p className="mt-2 font-body text-sm text-stone">{t("seedBody")}</p>
          <SeedButton label={t("seedCta")} />
        </section>
      )}

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("ratesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("ratesHint")}</p>
        <RatesForm settings={stored.settings} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("platesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("platesHint")}</p>
        <PlateTable plates={stored.plates} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("anglesTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("anglesHint")}</p>
        <AngleTable angles={stored.angles} />
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("modelsTitle")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("modelsHint")}</p>
        <ModelTable
          views={models.map((m) => view(m, card))}
          /* Active parts only. An existing rack may still reference a retired
             size — it is flagged, not rewritten — but a new one must not be
             built on something the vendor no longer supplies. */
          plates={stored.plates.filter((p) => p.active)}
          angles={stored.angles.filter((a) => a.active)}
          settings={stored.settings}
        />
      </section>
      <VendorPickupSection items={[{ item: SHELF_RACK_ITEM, label: t("vendorItem") }]} />
    </div>
  );
}

/**
 * Everything a row needs, computed here so the client component holds no
 * pricing logic. The one module that does is `src/lib/racks/pricing.ts`, which
 * is pure and pinned against the owner's own hand calculation.
 */
function view(model: RackModel, card: RateCard | null): RackModelView {
  const plate = card?.plates.find((p) => p.id === model.config.plateId) ?? null;
  const angle = card?.angles.find((a) => a.id === model.config.angleId) ?? null;
  const cost = card ? rackCost(model.config, card) : null;

  return {
    model,
    costNow: cost?.total ?? null,
    suggestedPrice: cost && card ? retailPrice(cost.total, card.settings) : null,
    depthFt: plate?.depthFt ?? null,
    lengthFt: plate?.lengthFt ?? null,
    thicknessMm: angle?.thicknessMm ?? null,
    /* From the grade, not from the model — a rack does not pick a colour, and
       every colour its grade comes in is available on it. */
    colours: angle?.colours ?? [],
    loadKg: plate ? plate.capacityKg * model.config.shelves : null,
  };
}

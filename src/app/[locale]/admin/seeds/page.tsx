import { getTranslations } from "next-intl/server";
import { listSeeds } from "@/lib/repo/seeds";
import { attachSeedContent, listSeedContent } from "@/lib/content/seeds";
import { routing } from "@/i18n/routing";
import { AddSeedForm } from "./AddSeedForm";
import { SeedTable } from "./SeedTable";

export const dynamic = "force-dynamic";

/**
 * `/admin/seeds` — SPEC §22.3. The seed shelf.
 *
 * Built 17 Sep 2026 on the owner's instruction, which also decided its shape:
 *
 * > *"I feel we have to get rid of products menu from the admin page since
 * > it's a generic form built for multiple products which isn't suitable. So we
 * > need seed specific inventory page similar to microgreen where I can enter
 * > the seed information and also the available quantity and its price per 100
 * > grams."*
 *
 * So this screen replaced `/admin/products`, which was one textarea of
 * pipe-delimited variant lines (`SEED-RAD-100 | pack=100g | 120 | 2500`) doing
 * duty for racks, trays, seeds and snacks at once. Four categories with
 * nothing in common shared one form, and the one with real stock had to
 * express it as a variant attribute.
 *
 * Like `/admin/varieties`, this owns the **numbers only** — price per 100 g
 * and grams held — so there is not one text input on the page. Every word a
 * customer reads lives in `content/seeds/<key>.json` (SPEC §4.3).
 *
 * A seed can be priced and stocked **before** its content file exists. What
 * keeps a nameless seed off the site is downstream: the row is flagged in red
 * with the exact path to create, and every public page skips a seed it cannot
 * name.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator counting stock
 * wants one stable set of labels.
 */
export default async function SeedsAdmin() {
  const t = await getTranslations("admin.seeds");

  const [rows, content] = await Promise.all([
    listSeeds(),
    listSeedContent(routing.defaultLocale),
  ]);

  const withContent = await attachSeedContent(rows, routing.defaultLocale);
  /* Suggestions only — content files that exist but are not yet priced. The
     field accepts anything well-formed, so this is a convenience rather than a
     constraint. */
  const taken = new Set(rows.map((r) => r.contentKey));
  const suggestions = content.filter((c) => !taken.has(c.key)).map((c) => c.key);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        {/* Both paragraphs run the full content width, stacked — this is an
            internal screen and the owner asked for the width rather than a
            narrow reading measure. */}
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("addTitle")}</h2>

        <AddSeedForm suggestions={suggestions} />
        <p className="mt-4 font-body text-xs text-stone">{t("howTo")}</p>
      </section>

      <SeedTable
        seeds={withContent.map((s) => ({
          seed: {
            id: s.id,
            contentKey: s.contentKey,
            pricePer50g: s.pricePer50g,
            ...(s.priceFromOld100g ? { priceFromOld100g: true } : {}),
            stockGrams: s.stockGrams,
            active: s.active,
          },
          name: s.content?.text.name ?? null,
        }))}
      />
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { Tile } from "@/components/catalogue/Tile";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { quickAddFor } from "@/lib/cart/quick-add";
import { listSeeds } from "@/lib/repo/seeds";
import { attachSeedContent, seedCutout, seedHero } from "@/lib/content/seeds";
import { currentActor } from "@/lib/auth/guard";
import { CategoryStrip } from "@/components/chrome/CategoryStrip";

/**
 * /seeds — SPEC §22.5. The seed grid.
 *
 * **Its own route rather than `/shop/seeds`**, for the same reason
 * `/microgreens` is not `/shop/microgreens`: seeds are a described catalogue
 * with a detail page per item, not a product category of interchangeable SKUs.
 * `/shop/seeds` redirects here, so the URL a visitor might guess still works
 * and the category strip needs no special case.
 *
 * Names and photography come from `content/seeds/<key>.json`, never from
 * DynamoDB (SPEC §4.3). A row whose file is missing is skipped rather than
 * rendered nameless — the admin screen is where that gets reported.
 *
 * **No card carries a stock figure, and none can read "out of stock"**
 * (17 Sep 2026). Seed is re-orderable, so the shelf decides how fast an order
 * arrives rather than whether it can be placed at all — the owner's rule, and
 * the reasoning is in `src/lib/seeds/stock.ts`. A card that said "200 g in
 * stock" would both publish an internal figure and imply a ceiling that no
 * longer exists.
 *
 * What a card shows instead is the price and nothing else. The delivery date
 * belongs where the quantity is chosen, because it depends on it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/seeds">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seeds" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/seeds"),
  };
}

export default async function SeedsPage({ params }: PageProps<"/[locale]/seeds">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("seeds", locale);

  const t = await getTranslations("seeds");
  const counts = await getTranslations("common.counts");
  const rows = await listSeeds({ activeOnly: true });
  /* Only an admin sees the admin instruction, and only then is the string even
     resolved — the `admin` namespace stays out of the public bundle. */
  const actor = await currentActor();
  const isAdmin = actor?.role === "admin";
  const ta = await getTranslations("admin.publicEmpty");
  const seeds = (await attachSeedContent(rows, locale)).filter(
    (s): s is (typeof rows)[number] & { content: NonNullable<typeof s.content> } =>
      s.content !== null,
  );
  /* Sorted by the name on the card, not by the content key underneath it.
     `listSeeds` returns GSI1 key order, which is the right default for the
     repository and was indistinguishable from alphabetical while the shelf
     held two seeds. With eighteen it reads as a fault: `red-cabbage` and
     `red-onion` are keyed under R and titled "Cabbage (red)" and "Onion
     (red)", so the grid ran ...Radish, Red Amaranthus, Cabbage, Onion,
     Rocket... The sort has to happen here because the name lives in the
     content file, which the repository does not read.

     A locale-aware collator, so the Kannada grid is in Kannada alphabetical
     order rather than in the order English happened to fall. */
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  seeds.sort((a, b) => collator.compare(a.content.text.name, b.content.text.name));

  const quickAdd = await quickAddFor();

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <CategoryStrip current="seeds" />

      <p className="mt-8 font-body text-[11px] uppercase tracking-widest text-stone">
        {counts("seeds", { count: seeds.length })}
      </p>
      <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-4 max-w-xl font-body text-sm text-stone">{t("body")}</p>

      {seeds.length === 0 ? (
        /* Operator copy for an operator, customer copy for everyone else
           (SPEC §8.2) — a visitor has no admin screen to go and fill in. */
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {isAdmin ? (
            ta.rich("seeds", {
              link: (chunks) => (
                <Link
                  href="/admin/seeds"
                  className="text-forest underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })
          ) : (
            <>
              {t("empty")}{" "}
              <Link href="/microgreens" className="text-forest underline underline-offset-4">
                {t("emptyLink")}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-2 gap-x-5 gap-y-9 md:grid-cols-4 md:gap-x-6">
          {seeds.map((s, i) => (
            <li key={s.contentKey}>
              <Tile
                href={`/seeds/${s.contentKey}`}
                name={s.content.text.name}
                /* Price only — see the note at the top of this file for why
                   the grams we hold are not on the card. */
                meta={t("meta", { price: s.pricePer100g })}
                index={i}
                cutout={seedCutout(s.content)}
                hero={seedHero(s.content)}
                /* Spec labels — germination, sow rate — in the resolved
                   locale, so the Kannada grid scrolls Kannada. Labels only;
                   see the prop's note for why the figures stay on the detail
                   page. */
                words={(s.content.text.specs ?? []).map((row) => row.label)}
                action={<QuickAdd {...quickAdd("seed", s.contentKey, s.content.text.name)} />}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-16 font-body text-sm text-stone">
        {t("growPrompt")}{" "}
        <Link href="/microgreens" className="text-forest underline underline-offset-4">
          {t("growLink")}
        </Link>
        .
      </p>
    </section>
  );
}

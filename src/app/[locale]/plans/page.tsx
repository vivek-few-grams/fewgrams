import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClientMessages } from "@/i18n/client-messages";
import { Breadcrumbs } from "@/components/catalogue/Breadcrumbs";
import { Bundles } from "@/components/home/Bundles";
import { isProductTypeEnabled } from "@/lib/catalogue/visibility";
import { varietyNameMap } from "@/lib/content/varieties";
import { listVarieties } from "@/lib/repo/varieties";
import { pageMetadata } from "@/lib/seo/metadata";
import { planCards } from "@/lib/subscriptions/plan-cards";

/**
 * `/plans` — the weekly plans as a page of their own (SPEC §28.8), so a search
 * for a weekly microgreens box has somewhere to land. The top menu comes here;
 * the home page keeps its plans section, and the hero's button scrolls to it
 * (the owner, 20 Oct 2026: both).
 *
 * The same cards as the home page (`Bundles`, read through `planCards`), with
 * the page's heading. Under them each plan's rotation is written out week by
 * week, every green linked to its own page — what the cards keep behind a
 * button, here as text a reader and a crawler can both follow.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/plans">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "plans.seo" });
  return pageMetadata({ locale, path: "/plans", title: t("title"), description: t("description") });
}

export default async function PlansPage({ params }: PageProps<"/[locale]/plans">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [{ plans, adminEmpty }, varieties, varietyNames, microgreensOn] = await Promise.all([
    planCards(locale),
    listVarieties({ activeOnly: true }),
    varietyNameMap(locale),
    isProductTypeEnabled("microgreens"),
  ]);
  const nav = await getTranslations("common.nav");
  const tp = await getTranslations("plans");

  /* A green links to its page only when that page would open: on sale, and
     microgreens switched on. Otherwise its name is printed plain. */
  const linkable = new Set(microgreensOn ? varieties.map((v) => v.contentKey) : []);
  /* Pick Your Own has no rotation; it is a card and nothing more. */
  const rotations = plans.filter(({ weeks }) => weeks.some((w) => w.varietyKeys.length > 0));

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-6 pt-5 md:px-12 md:pt-6">
        <Breadcrumbs trail={[]} current={nav("plans")} currentHref="/plans" />
      </div>

      <div className="pt-8">
        <ClientMessages entry="home">
          <Bundles
            plans={plans}
            varieties={varieties}
            varietyNames={varietyNames}
            adminEmpty={adminEmpty}
            headingLevel={1}
          />
        </ClientMessages>
      </div>

      {rotations.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-14 md:px-12 md:pb-20">
          <p className="max-w-3xl font-body text-sm leading-relaxed text-stone">{tp("rotationNote")}</p>
          {rotations.map(({ plan, weeks, text }) => (
            <section key={plan.id} className="mt-12">
              <h2 className="font-display text-[clamp(1.3rem,2.4vw,1.8rem)] font-bold leading-tight tracking-tight text-forest">
                {tp("rotationHeading", { plan: text.name })}
              </h2>
              <p className="mt-3 max-w-3xl font-body text-sm leading-relaxed text-stone">
                {text.description}
              </p>
              {/* Two to a row even on a phone: a week is two or three short
                  names, and one card per row stacked four tall boxes. */}
              <ol className="mt-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
                {[...weeks]
                  .sort((a, b) => a.week - b.week)
                  .map((week) => (
                    <li key={week.week} className="rounded-2xl border border-forest/10 bg-white p-4 md:p-5">
                      <h3 className="font-body text-[11px] font-semibold uppercase tracking-widest text-stone">
                        {tp("card.week", { n: week.week })}
                      </h3>
                      <ul className="mt-3 space-y-1.5 font-body text-sm text-forest">
                        {week.varietyKeys.map((key) => {
                          const name = varietyNames[key] ?? key;
                          return (
                            <li key={key}>
                              {linkable.has(key) ? (
                                <Link
                                  href={`/microgreens/${key}`}
                                  className="underline decoration-forest/30 underline-offset-4 transition-colors hover:decoration-forest"
                                >
                                  {name}
                                </Link>
                              ) : (
                                name
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

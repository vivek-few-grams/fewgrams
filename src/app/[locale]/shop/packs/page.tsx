import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/catalogue/Breadcrumbs";
import { PackCompare } from "@/components/packs/PackCompare";
import { PackSteps } from "@/components/packs/PackSteps";
import { listSellablePacks } from "@/lib/packs/catalogue";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * `/shop/packs` — the starter packs compared (SPEC §29.3): what is in each,
 * as one table (`PackCompare`), and the three steps from here to a first
 * harvest. Choosing a pack opens its page, where the seeds and the rack
 * colour are picked.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/packs">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.packs.seo" });
  return pageMetadata({ locale, path: "/shop/packs", title: t("title"), description: t("description") });
}

export default async function PacksPage({ params }: PageProps<"/[locale]/shop/packs">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("shop.packs");
  const nav = await getTranslations("common.nav");
  const crumbs = await getTranslations("shop.index");
  const packs = await listSellablePacks(locale);

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-5 md:px-12 md:pb-24 md:pt-6">
      <Breadcrumbs
        trail={[{ href: "/shop", label: crumbs("title") }]}
        current={nav("packs")}
        currentHref="/shop/packs"
      />

      <h1 className="mt-8 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-4 max-w-2xl font-body text-sm leading-relaxed text-stone">{t("intro")}</p>

      {packs.length === 0 ? (
        /* Customer wording only: nothing here names an admin screen (CLAUDE.md,
           "Empty states are role-aware"). Every part is still sold on its own. */
        <p className="mt-10 font-body text-sm text-forest">
          {t("empty")}{" "}
          <Link href="/shop" className="font-semibold underline underline-offset-4 hover:text-stone">
            {t("emptyLink")}
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-10">
            <PackCompare packs={packs} />
          </div>
          {/* Below lg the steps follow the table; from lg they sit in its corner. */}
          <PackSteps className="mt-12 lg:hidden" />
        </>
      )}
    </section>
  );
}

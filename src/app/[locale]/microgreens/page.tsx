import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { guardProductTypeEnabled } from "@/lib/catalogue/visibility";
import { Tile } from "@/components/catalogue/Tile";
import { QuickAdd } from "@/components/catalogue/QuickAdd";
import { quickAddFor } from "@/lib/cart/quick-add";
import { listVarieties } from "@/lib/repo/varieties";
import { attachContent, varietyCutout, varietyHero } from "@/lib/content/varieties";
import { currentActor } from "@/lib/auth/guard";

/**
 * /microgreens — SPEC §12 and §18.6. The variety grid.
 *
 * This was level 2 of the full-screen overlay until 15 Sep 2026. As a real
 * page it is indexable, linkable and shareable, the back button behaves, and
 * it has somewhere to put filters (grow days, price) that an overlay
 * never did. For the page selling the hero product that matters more than
 * the transition did.
 *
 * Greens are sold two ways (§18.6): by the tray ad hoc from the detail page,
 * or as a weekly plan. Both routes are offered here rather than assuming
 * which one a visitor wants.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/microgreens">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "microgreens" });
  return { title: t("title"), description: t("description"), alternates: localeAlternates("/microgreens") };
}

export default async function MicrogreensPage({
  params,
}: PageProps<"/[locale]/microgreens">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardProductTypeEnabled("microgreens", locale);

  const t = await getTranslations("microgreens");
  const counts = await getTranslations("common.counts");
  /* Names and photography come from content/varieties/<key>.json, never from
     DynamoDB (SPEC §4.3). A row whose file is missing is skipped rather than
     rendered nameless — the admin screen is where that gets reported. */
  const rows = await listVarieties({ activeOnly: true });
  /* Only an admin sees the admin instruction, and only then is the string even
     resolved — the `admin` namespace stays out of the public bundle. */
  const actor = await currentActor();
  const isAdmin = actor?.role === "admin";
  const ta = await getTranslations("admin.publicEmpty");
  const varieties = (await attachContent(rows, locale)).filter(
    (v): v is (typeof rows)[number] & { content: NonNullable<typeof v.content> } =>
      v.content !== null,
  );

  const quickAdd = await quickAddFor();

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-6 md:px-12 md:pb-24 md:pt-8">
      <p className="font-body text-[11px] uppercase tracking-widest text-stone">
        {counts("varieties", { count: varieties.length })}
      </p>
      <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.25rem,2.5vw,1.9rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-4 max-w-xl font-body text-sm text-stone">
        {t("body")}
      </p>

      {varieties.length === 0 ? (
        /* Operator copy for an operator, customer copy for everyone else. The
           "Add them in admin → varieties" line was being shown to visitors,
           who have no such screen. */
        <p className="mt-12 rounded-2xl border border-dashed border-forest/20 p-6 font-body text-sm text-stone">
          {isAdmin ? (
            ta.rich("varieties", {
              link: (chunks) => (
                <Link
                  href="/admin/varieties"
                  className="text-forest underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })
          ) : (
            <>
              {t("empty")}{" "}
              <Link href="/shop" className="text-forest underline underline-offset-4">
                {t("emptyLink")}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-2 gap-x-5 gap-y-9 md:grid-cols-4 md:gap-x-6">
          {varieties.map((v, i) => (
            <li key={v.contentKey}>
              <Tile
                href={`/microgreens/${v.contentKey}`}
                name={v.content.text.name}
                /* Price only (the owner, 24 Sep 2026) — the grow days are on the
                   detail page, where the delivery date is. */
                meta={t("meta", { price: v.pricePerTray })}
                index={i}
                cutout={varietyCutout(v.content)}
                hero={varietyHero(v.content)}
                /* Labels only, and from the resolved locale, so the Kannada
                   grid scrolls Kannada nutrients — see the prop's note for why
                   the values stay on the detail page. */
                words={(v.content.text.nutrition ?? []).map((n) => n.label)}
                action={<QuickAdd {...quickAdd("variety", v.contentKey, v.content.text.name)} />}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-16 font-body text-sm text-stone">
        {t("plansPrompt")}{" "}
        <Link href="/#plans" className="text-forest underline underline-offset-4">
          {t("plansLink")}
        </Link>
        .
      </p>
    </section>
  );
}

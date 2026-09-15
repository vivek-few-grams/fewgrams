import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { Sprout } from "@/components/ui/Sprout";
import { listVarieties } from "@/lib/repo/varieties";
import { attachContent, varietyHero } from "@/lib/content/varieties";
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
 * Greens are sold two ways (§18.6): by the 100 g ad hoc from the detail page,
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

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
      <p className="font-body text-[11px] uppercase tracking-widest text-stone">
        {counts("varieties", { count: varieties.length })}
      </p>
      <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
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
          {varieties.map((v, i) => {
            const name = v.content.text.name;
            const hero = varietyHero(v.content);
            return (
              <li key={v.contentKey}>
                <Link href={`/microgreens/${v.contentKey}`} className="group block">
                  <div className="mcard flex aspect-square items-center justify-center overflow-hidden bg-forest">
                    {hero ? (
                      /* A real photograph fills the tile; `sizes` matches the
                         2-up / 4-up grid so no phone downloads a desktop
                         image.

                         `priority` on the first row only: the top-left tile is
                         the Largest Contentful Paint element on this page, and
                         lazy-loading it delays the metric by a round trip.
                         Four covers the widest grid; below the fold stays lazy,
                         because marking everything priority defeats the point
                         and floods the connection. */
                      <Image
                        src={hero.src}
                        alt={hero.alt}
                        fill
                        priority={i < 4}
                        sizes="(min-width: 768px) 25vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <>
                        <div className="mcard__marquee text-mint/20" aria-hidden="true">
                          <div className="mcard__marquee-inner">
                            {[0, 1].map((k) => (
                              <div key={k} className="px-2">
                                <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                                  {name}
                                </span>
                                <span className="mcard__marquee-line text-[clamp(1.6rem,3vw,2.6rem)]">
                                  {name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mcard__media w-[62%]">
                          <Sprout className="h-full w-full" stroke="#A8CF8E" seed={i} />
                        </div>
                      </>
                    )}
                  </div>
                  <p className="mt-3 font-display text-sm font-semibold uppercase tracking-wide text-forest transition-colors group-hover:text-stone">
                    {name}
                  </p>
                  <p className="font-body text-xs text-stone">
                    {t("meta", { days: v.growDays, price: v.pricePer100g })}
                  </p>
                </Link>
              </li>
            );
          })}
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

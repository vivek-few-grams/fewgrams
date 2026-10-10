import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { getFaq } from "@/lib/content/faq";

/**
 * /faq — every answer is `content/faq.json` (editorial copy, SPEC §4.3); this
 * page holds only the chrome, from `messages/<locale>/help.json`.
 *
 * The answers describe the rules in `src/lib/delivery-date.ts`,
 * `src/lib/shipping/` and `src/lib/cart/area-split.ts` in words, and never
 * restate a figure those rules or admin screens own — "you see the date
 * before you pay", not the date. `faq-contract.ts` fails on a price, a day
 * count or the city.
 *
 * Native `<details>`, as on the variety page: keyboard accessible, works
 * without JavaScript, and every answer is in the HTML whether or not it is
 * open. Each question's key is its anchor, so a WhatsApp reply can link
 * straight to `/faq#outside-area`.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help.faq" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/faq"),
  };
}

export default async function FaqPage({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("help.faq");
  const sections = await getFaq(locale);

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-10 md:px-12 md:pb-24 md:pt-14">
        <p className="font-body text-[11px] uppercase tracking-widest text-stone">{t("eyebrow")}</p>
        <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h1>
        <p className="mt-4 max-w-xl font-body text-sm leading-relaxed text-stone">{t("intro")}</p>

        <div className="mt-12 grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
          <nav aria-label={t("sectionsLabel")} className="lg:sticky lg:top-28 lg:self-start">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {sections.map((s) => (
                <li key={s.key}>
                  <a
                    href={`#${s.key}`}
                    className="inline-block rounded-full border border-forest/20 px-4 py-2 font-body text-sm text-forest transition-colors hover:border-forest hover:bg-forest hover:text-cream lg:rounded-none lg:border-0 lg:px-0 lg:py-1.5 lg:text-stone lg:hover:bg-transparent lg:hover:text-forest"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-14">
            {sections.map((s) => (
              <section key={s.key} id={s.key} className="scroll-mt-28">
                <h2 className="font-display text-xl font-bold tracking-tight text-forest">{s.title}</h2>
                <div className="mt-5 border-t border-forest/15">
                  {s.questions.map((q) => (
                    <details
                      key={q.key}
                      id={q.key}
                      className="group scroll-mt-28 border-b border-forest/15 py-4"
                    >
                      <summary className="flex items-center justify-between gap-4 font-display text-[15px] font-semibold text-forest transition-colors group-hover:text-stone [&::-webkit-details-marker]:hidden">
                        {q.question}
                        <span
                          aria-hidden="true"
                          className="shrink-0 font-body text-lg leading-none text-stone transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <div className="mt-3 max-w-2xl space-y-3 font-body text-sm leading-[1.8] text-stone">
                        {q.answer.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-forest/10 bg-sand px-6 py-14 md:px-12 md:py-20">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-[clamp(1.4rem,3vw,2.2rem)] font-bold leading-tight tracking-tight text-forest">
              {t("more.heading")}
            </h2>
            <p className="mt-2 font-body text-sm text-stone">{t("more.body")}</p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 self-start rounded-full bg-forest px-6 py-3 font-body text-sm font-medium text-cream transition-colors hover:bg-forest-deep md:self-auto"
          >
            {t("more.cta")}
            <ArrowRight size={16} strokeWidth={1.75} />
          </Link>
        </div>
      </section>
    </>
  );
}

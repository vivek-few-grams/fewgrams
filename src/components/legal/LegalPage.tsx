import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";
import { fromIstDateISO } from "@/lib/delivery-date";
import { getLegalDoc, type LegalDocName } from "@/lib/content/legal";

/**
 * One layout for every legal page, so Privacy, Refunds and Shipping are a
 * content file and a four-line route each.
 *
 * Numbered sections with ids, so a support reply can cite "clause 9" and link
 * `/terms#problems`. A plain document, deliberately: no accordion, because a
 * gateway reviewer or a consumer commission reads it top to bottom.
 */
export async function LegalPage({ name, locale }: { name: LegalDocName; locale: string }) {
  const t = await getTranslations("legal");
  const fssai = brand.fssai ?? t("fssaiPending");
  const doc = await getLegalDoc(name, locale, fssai);

  const updated = new Intl.DateTimeFormat(locale === "kn" ? "kn-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(fromIstDateISO(doc.updated));

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-10 md:px-12 md:pb-24 md:pt-14">
      <h1 className="max-w-2xl font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
        {t(`${name}.title`)}
      </h1>
      <p className="mt-3 font-body text-[11px] uppercase tracking-widest text-stone">
        {t("updated", { date: updated })}
      </p>
      <div className="mt-6 max-w-2xl space-y-3 font-body text-sm leading-[1.8] text-stone">
        {doc.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[240px_1fr] lg:gap-16">
        <nav aria-label={t("contents")} className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-body text-[11px] uppercase tracking-widest text-sage">{t("contents")}</p>
          <ol className="mt-3 space-y-1.5">
            {doc.sections.map((s, i) => (
              <li key={s.key}>
                <a
                  href={`#${s.key}`}
                  className="font-body text-sm text-stone transition-colors hover:text-forest"
                >
                  <span className="tabular-nums">{i + 1}.</span> {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-2xl space-y-10">
          {doc.sections.map((s, i) => (
            <section key={s.key} id={s.key} className="scroll-mt-28">
              <h2 className="font-display text-lg font-bold tracking-tight text-forest">
                <span className="tabular-nums">{i + 1}.</span> {s.heading}
              </h2>
              <div className="mt-3 space-y-3 font-body text-sm leading-[1.8] text-stone">
                {s.body.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

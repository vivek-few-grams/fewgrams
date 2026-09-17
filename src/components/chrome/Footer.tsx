import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { NAV_CATEGORIES } from "@/lib/types";
import { CATEGORY_HREF } from "@/lib/shop";

export async function Footer() {
  const t = await getTranslations("common.footer");
  const b = await getTranslations("common.brand");
  const c = await getTranslations("common.categories");

  return (
    <footer className="mt-24 bg-forest text-cream">
      <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-12">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">{brand.name}</p>
            <p className="mt-3 max-w-xs font-body text-sm text-mint">{b("subline")}</p>
            <p className="mt-6 font-body text-sm text-mint/70">
              {t("deliveryNote", { city: brand.city })}
            </p>
          </div>

          <FooterCol title={t("shop")}>
            {NAV_CATEGORIES.map((cat) => (
              /* Microgreens and seeds are described catalogues with routes of
                 their own; the rest are `/shop/<slug>`. `CATEGORY_HREF` is the
                 one place that mapping lives, so a footer link cannot drift
                 from the nav's. */
              <FooterLink
                key={cat.slug}
                href={cat.slug === "microgreens" ? "/microgreens" : CATEGORY_HREF[cat.slug]}
              >
                {c(cat.slug)}
              </FooterLink>
            ))}
            <FooterLink href="/#plans">{t("plans")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("brand")}>
            <FooterLink href="/story">{t("ourStory")}</FooterLink>
            <FooterLink href="/how-we-grow">{t("howWeGrow")}</FooterLink>
            <FooterLink href="/recipes">{t("recipes")}</FooterLink>
            <FooterLink href="/faq">{t("faq")}</FooterLink>
            <FooterLink href="/contact">{t("contact")}</FooterLink>
          </FooterCol>

          {/* SPEC §12: these four are required by the payment gateway for
              merchant approval — not optional, and not to be left to the
              final phase. */}
          <FooterCol title={t("legal")}>
            <FooterLink href="/terms">{t("terms")}</FooterLink>
            <FooterLink href="/privacy">{t("privacy")}</FooterLink>
            <FooterLink href="/refund-policy">{t("refunds")}</FooterLink>
            <FooterLink href="/shipping-policy">{t("shipping")}</FooterLink>
          </FooterCol>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-cream/15 pt-7 font-body text-xs text-mint/60 md:flex-row md:items-center md:justify-between">
          <p>
            {t("copyright", { year: new Date().getFullYear(), brand: brand.name })} ·{" "}
            {brand.email}
          </p>
          {/* B2B lead capture — SPEC §18.1. Moved out of the header on
              15 Sep 2026: it was competing with revenue navigation on a
              consumer store. */}
          <Link
            href="/contact?about=website"
            className="group text-mint/60 transition-colors hover:text-cream"
          >
            <span className="group-hover:hidden">{t("b2bPrompt")}</span>
            <span className="hidden group-hover:inline">{t("b2bHover")}</span>
          </Link>
          <p>
            {brand.fssai
              ? t("fssaiLicence", { number: brand.fssai })
              : t("fssaiPending")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[11px] uppercase tracking-widest text-sage">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="font-body text-sm text-mint transition-colors hover:text-cream">
        {children}
      </Link>
    </li>
  );
}

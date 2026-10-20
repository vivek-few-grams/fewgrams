import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo/metadata";
import { LegalPage } from "@/components/legal/LegalPage";

/**
 * /terms — SPEC §12, required by the payment gateway for merchant approval.
 * Every word is `content/legal/terms.json`; built to the Consumer Protection
 * (E-Commerce) Rules, 2020 disclosure list, from the owner's answers of
 * 27 Sep 2026. English is the binding version (clause "Law and courts").
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return pageMetadata({ locale, path: "/terms", title: t("title"), description: t("description") });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage name="terms" locale={locale} />;
}

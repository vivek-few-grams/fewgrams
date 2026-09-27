import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { LegalPage } from "@/components/legal/LegalPage";

/**
 * /privacy — SPEC §12, required by the payment gateway for merchant approval.
 * Every word is `content/legal/privacy.json`; built to the IT Act's SPDI
 * Rules, 2011 (rule 4) and the DPDP Act, 2023, from what the code actually
 * collects and shares and the owner's answers of 27 Sep 2026.
 *
 * **Keep it true to the code.** It says there is no analytics, no IP logging
 * and no stored card data, and names every service that receives personal
 * data. Adding a tracker, an email provider or a courier booking changes this
 * file in the same commit.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title"), description: t("description"), alternates: localeAlternates("/privacy") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage name="privacy" locale={locale} />;
}

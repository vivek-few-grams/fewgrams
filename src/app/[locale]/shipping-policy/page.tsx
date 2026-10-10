import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { LegalPage } from "@/components/legal/LegalPage";

/**
 * /shipping-policy — SPEC §12, required by the payment gateway for merchant
 * approval. Every word is `content/legal/shipping.json`. It describes SPEC §7
 * and `src/lib/delivery-date.ts` in words — the area split, the own run, the
 * courier scan, the day to pack, the vendor parcel — so a change to any of
 * those rules changes this file too. The tracking clause is true because the
 * admin order page records a tracking number and the customer's order shows it.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/shipping-policy">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.shipping" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/shipping-policy"),
  };
}

export default async function ShippingPolicyPage({ params }: PageProps<"/[locale]/shipping-policy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage name="shipping" locale={locale} />;
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo/metadata";
import { LegalPage } from "@/components/legal/LegalPage";

/**
 * /refund-policy — SPEC §12, required by the payment gateway for merchant
 * approval. Every word is `content/legal/refunds.json`, from the owner's
 * answers of 27 Sep 2026. It restates the Terms' cancellation, problems and
 * refunds clauses case by case, so **change both together**; the Terms say
 * this page sets out every case.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/refund-policy">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.refunds" });
  return pageMetadata({ locale, path: "/refund-policy", title: t("title"), description: t("description") });
}

export default async function RefundPolicyPage({ params }: PageProps<"/[locale]/refund-policy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage name="refunds" locale={locale} />;
}

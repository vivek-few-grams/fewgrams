import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/guard";
import { getProfile, listAddresses } from "@/lib/repo/profile";
import { brand, servicePins } from "@/lib/brand";
import { AddressBook } from "./AddressBook";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.addresses" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/account/addresses` — SPEC §12.
 *
 * The PIN allowlist (SPEC §7) is applied when an address is *saved*, not only
 * at checkout. Catching an unserviceable PIN here is the difference between
 * "we don't deliver to 110001 yet" while the customer is browsing and the
 * same message appearing on the payment screen.
 */
export default async function AddressesPage({
  params,
}: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("account.addresses");
  const actor = await requireRole("customer");

  const [addresses, profile] = await Promise.all([
    listAddresses(actor.userId),
    getProfile(actor.userId),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-forest">{t("heading")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("body")}</p>
        <p className="mt-1 font-body text-xs text-stone/80">
          {t("serviceNote", { count: servicePins.length })}
        </p>
      </div>

      <AddressBook
        addresses={addresses}
        /* Prefills a first address from the profile, because the recipient is
           almost always the account holder. */
        defaultRecipient={profile?.name ?? actor.name ?? ""}
        defaultPhone={profile?.phone ?? ""}
        defaultCity={brand.city}
      />
    </div>
  );
}

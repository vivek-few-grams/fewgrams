import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, MapPin, Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { getDefaultAddress, getProfile } from "@/lib/repo/profile";
import { listOrdersForUser } from "@/lib/repo/orders";
import { firstDeliveryDate, formatDeliveryDate } from "@/lib/delivery-date";
import { formatPhone } from "@/lib/account/validation";
import { AddressLines, Card, Detail } from "./ui";

/** Reads the session and the customer's own rows, so nothing here is
 *  cacheable across visitors. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.overview" });
  // No `alternates` on purpose: an account page is private, so there is
  // nothing for a search engine to index in either language.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountOverview({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("account.overview");
  const actor = await requireRole("customer");

  const [profile, address, orders] = await Promise.all([
    getProfile(actor.userId),
    getDefaultAddress(actor.userId),
    listOrdersForUser(actor.userId),
  ]);

  /* The profile row wins over whatever Google supplied, because it is the
     name the customer chose. Neither exists after a magic-link sign-in, so
     the greeting falls back to the part of the email before the @. */
  const name = profile?.name ?? actor.name ?? actor.email?.split("@")[0] ?? null;

  return (
    <div className="space-y-6">
      {/* The side column starts level with what follows this (SideColumn). */}
      <div data-account-intro>
        <h2 className="font-display text-xl font-semibold text-forest">
          {name ? t("heading", { name }) : t("headingAnon")}
        </h2>
        <p className="mt-2 max-w-xl font-body text-sm text-stone">{t("body")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title={t("detailsTitle")}
          action={
            <Link
              href="/account/profile"
              className="font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
            >
              {t("editDetails")}
            </Link>
          }
        >
          <dl>
            <Detail label={t("name")} value={profile?.name ?? actor.name} empty={t("notSet")} />
            <Detail label={t("email")} value={actor.email} empty={t("notSet")} />
            <Detail
              label={t("phone")}
              value={profile?.phone ? formatPhone(profile.phone) : null}
              empty={t("notSet")}
            />
          </dl>
        </Card>

        <Card
          title={t("addressTitle")}
          action={
            <Link
              href="/account/addresses"
              className="font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
            >
              {address ? t("manageAddresses") : t("addAddress")}
            </Link>
          }
        >
          {address ? (
            <AddressLines address={address} />
          ) : (
            <EmptyNote icon={<MapPin size={18} strokeWidth={1.5} />}>
              {t("noAddress")}
            </EmptyNote>
          )}
        </Card>

        <Card title={t("nextDeliveryTitle")}>
          {/* SPEC §5.3 — the first-delivery date is the single most important
              piece of expectation-setting on the site, so it is stated even
              when there is nothing scheduled yet. */}
          <EmptyNote icon={<CalendarDays size={18} strokeWidth={1.5} />}>
            {t("nextDeliveryNone", {
              date: formatDeliveryDate(firstDeliveryDate(), locale === "kn" ? "kn-IN" : "en-IN"),
            })}
          </EmptyNote>
          <Link
            href="/#plans"
            className="mt-4 inline-block font-body text-sm text-forest underline underline-offset-4"
          >
            {t("browsePlans")}
          </Link>
        </Card>

        <Card
          title={t("ordersTitle")}
          action={
            <Link
              href="/account/orders"
              className="font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
            >
              {t("allOrders")}
            </Link>
          }
        >
          {orders.length === 0 ? (
            <EmptyNote icon={<Package size={18} strokeWidth={1.5} />}>
              {t("noOrders")}
            </EmptyNote>
          ) : (
            <ul className="space-y-2 font-body text-sm text-forest">
              {orders.slice(0, 3).map((order) => (
                <li key={order.id}>{order.id}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyNote({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2.5 font-body text-sm text-stone">
      <span className="mt-0.5 shrink-0 text-forest/60">{icon}</span>
      {children}
    </p>
  );
}

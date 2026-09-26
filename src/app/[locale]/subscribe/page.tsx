import { getTranslations, setRequestLocale } from "next-intl/server";
import { Sprout } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { istDateISO } from "@/lib/delivery-date";
import { GATEWAY_LABEL, paymentProvider } from "@/lib/payments";
import { checkDeliveryArea } from "@/lib/pincode/place";
import { getProfile, listAddresses } from "@/lib/repo/profile";
import { listVarieties } from "@/lib/repo/varieties";
import { varietyNameMap } from "@/lib/content/varieties";
import { subscribablePlans } from "@/lib/subscriptions/catalogue";
import { subscriptionSchedule } from "@/lib/subscriptions/rotation";
import { SubscribeForm, type SubscribeBox } from "./SubscribeForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/subscribe">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "plans.subscribe" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/subscribe` — SPEC §5, §5.2.1. Choose how many of each bundle, see the
 * four Saturdays and what each brings, pick an address, pay.
 *
 * **Not the cart.** A subscription is four Saturdays on the owner's run with
 * delivery included, and a cart line is one delivery priced by courier; the
 * two share nothing but the payment screen, so they share only that
 * (`openGateway`, `settlementFor`).
 *
 * The schedule starts on the next Saturday anyone can still be sown for, and
 * each Saturday shows **its own** rotation week — subscribe mid-month and the
 * first box is whatever week the shared calendar is on (`rotation.ts`).
 *
 * `?plan=<key>` preselects one bundle of that plan, which is where the home
 * page's Subscribe buttons land.
 */
export default async function SubscribePage({ params, searchParams }: PageProps<"/[locale]/subscribe">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireRole("customer");
  const t = await getTranslations("plans.subscribe");
  const picked = (await searchParams).plan;

  const tc = await getTranslations("checkout");
  const [plans, addresses, varieties, names, profile] = await Promise.all([
    subscribablePlans(locale),
    listAddresses(actor.userId),
    listVarieties(),
    varietyNameMap(locale),
    getProfile(actor.userId),
  ]);
  const served = new Map(
    await Promise.all(
      [...new Set(addresses.map((a) => a.pincode))].map(
        async (pin) => [pin, (await checkDeliveryArea(pin)).served] as const,
      ),
    ),
  );
  const deliverable = addresses.filter((a) => served.get(a.pincode));
  const growDays = new Map(varieties.map((v) => [v.contentKey, v.growDays]));
  const provider = paymentProvider();

  const schedule: SubscribeBox[] = subscriptionSchedule().map(({ date, week }) => ({
    date: istDateISO(date),
    week,
    plans: Object.fromEntries(
      plans.map(({ plan, weeks }) => [
        plan.contentKey,
        (weeks.find((w) => w.week === week)?.varietyKeys ?? []).map((key) => ({
          name: names[key] ?? key,
          growDays: growDays.get(key) ?? null,
        })),
      ]),
    ),
  }));

  return (
    <div className="co-page">
      <section className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 sm:px-6 md:px-12 md:pb-16 md:pt-10">
        <h1 className="flex items-center gap-2.5 font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
          <Sprout aria-hidden className="size-[0.8em] text-sage" strokeWidth={2} />
        </h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-stone">{t("subheading")}</p>

        {plans.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-sand p-6 md:p-8">
            <p className="font-display text-base font-semibold text-forest">{t("noneHeading")}</p>
            <p className="mt-2 font-body text-sm text-stone">{t("noneBody")}</p>
            <Link
              href="/microgreens"
              className="mt-5 inline-flex rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
            >
              {t("noneCta")}
            </Link>
          </div>
        ) : (
          <SubscribeForm
            locale={locale}
            plans={plans.map(({ plan, text }) => ({
              key: plan.contentKey,
              name: text.name,
              tagline: text.tagline,
              monthlyPrice: plan.monthlyPrice!,
              gramsPerBox: plan.gramsPerBox,
              initial: picked === plan.contentKey ? 1 : 0,
            }))}
            schedule={schedule}
            addresses={deliverable.map((a) => ({
              addrId: a.addrId,
              recipient: a.recipient,
              street: [a.line1, a.line2, a.landmark].filter(Boolean).join(", "),
              place: formatPlace(a),
              phone: formatPhone(a.phone),
              isDefault: a.isDefault,
            }))}
            savedCount={addresses.length}
            emptyBody={addresses.length === 0 ? tc("noAddressBody") : t("noDeliverable")}
            /* A first address is almost always the account holder's. */
            prefill={{ recipient: profile?.name ?? actor.name ?? "", phone: profile?.phone ?? "" }}
            payable={provider !== null}
            gatewayLabel={provider ? GATEWAY_LABEL[provider.name] : ""}
          />
        )}
      </section>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { ShoppingBag, Sprout } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { lineId } from "@/lib/cart/cart";
import { lineUnits } from "@/lib/cart/line-display";
import { hydrateCart } from "@/lib/cart/server";
import { courierPickup, istDateISO } from "@/lib/delivery-date";
import { paymentProvider } from "@/lib/payments";
import { shippingProviders } from "@/lib/shipping";
import { travelsOnOwnRun } from "@/lib/shipping/parcel";
import { checkDeliveryArea } from "@/lib/pincode/place";
import { getProfile, listAddresses } from "@/lib/repo/profile";
import { KindIcon } from "@/components/cart/KindIcon";
import { PayForm } from "./PayForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/checkout` — SPEC §9, §12. Signed-in only for now (the owner's decision,
 * 23 Sep 2026); guest checkout with account auto-provisioning is SPEC §8's
 * follow-up.
 *
 * Two columns (the owner's layout, 23 Sep 2026): delivery on the left; on
 * the right a sticky panel with the order — item count, the lines, the
 * delivery date — and below it payment, which appears only once an address
 * is accepted because the delivery charge is per address (`PayForm`). The figures come from the same `hydrateCart` read
 * `startCheckout` will charge from.
 *
 * **The delivery area limits fresh greens only** (the owner, 24 Sep 2026).
 * With greens in the cart, only addresses the own run reaches are offered,
 * and the action checks the PIN again anyway (SPEC §7) — this list is
 * convenience, the action is the gate. Without greens everything goes by
 * courier, so every saved address is offered and the couriers decide. A customer with none types one here rather than being sent to
 * the account page. With no gateway configured the delivery step still works
 * and only the pay button is replaced by the "not open yet" notice.
 *
 * Delivery is priced after the address is accepted, not here: `PayForm`
 * runs `scanDelivery`, which asks every connected courier at once and lets
 * the customer pick (SPEC §7, 24 Sep 2026). So the page never waits on three
 * couriers, and a visitor who never picks an address costs no quote. With no
 * price the pay button stays shut rather than place an order at no delivery
 * charge.
 */
export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireRole("customer");
  const t = await getTranslations("checkout");
  const tc = await getTranslations("cart");

  const [cart, addresses, profile] = await Promise.all([
    hydrateCart(locale),
    listAddresses(actor.userId),
    getProfile(actor.userId),
  ]);
  const greens = travelsOnOwnRun(cart.items);
  /* One area check per distinct PIN, and only when greens make the area
     matter; each is a cache read after the first time anyone asked. */
  const served = new Map(
    greens
      ? await Promise.all(
          [...new Set(addresses.map((a) => a.pincode))].map(
            async (pin) => [pin, (await checkDeliveryArea(pin)).served] as const,
          ),
        )
      : [],
  );
  const deliverable = greens ? addresses.filter((a) => served.get(a.pincode)) : addresses;
  const open = paymentProvider() !== null;

  if (cart.items.length === 0) {
    return (
      <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
        <h1 className="font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h1>
        <p className="mt-4 font-display text-lg font-semibold text-forest">{t("empty")}</p>
        <Link
          href="/microgreens"
          className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-forest px-7 py-3 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          <ShoppingBag size={17} strokeWidth={1.75} />
          {tc("browse")}
        </Link>
      </section>
    );
  }

  /* The right-hand card: what is being bought — the lines and their total,
     nothing about delivery. Delivery, the grand total and the pay button are
     `PayForm`'s payment step, because only the form knows which address —
     and so which delivery charge — is chosen. */
  const summary = (
    <section aria-labelledby="order-summary">
      <h2 id="order-summary" className="font-display text-lg font-bold text-cream">
        {t("summaryHeading")}
      </h2>
      <p className="mt-1 font-body text-sm text-cream/70">
        {t("summaryLine", { count: cart.items.length, amount: cart.subtotal })}
      </p>
      <ul className="mt-4 border-t border-cream/15">
        {cart.items.map((item) => (
          <li
            key={lineId(item)}
            className="flex items-center justify-between gap-4 border-b border-cream/15 py-3"
          >
            <span className="flex min-w-0 items-center gap-3.5">
              {/* The product's own photo where it has one — a picture says
                  "these greens" faster than a name — and its kind's icon
                  where it does not (packet photography for seeds, say). */}
              {item.image ? (
                <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-forest-deep ring-2 ring-cream/15">
                  <Image src={item.image.src} alt={item.image.alt} fill sizes="40px" className="object-cover" />
                </span>
              ) : (
                <KindIcon kind={item.kind} className="size-10 bg-forest-deep text-cream ring-2 ring-cream/15" />
              )}
              <span className="min-w-0">
                <span className="block font-body text-sm font-semibold text-cream">{item.name}</span>
                <span className="mt-0.5 block font-body text-xs text-cream/65">{lineUnits(item, tc)}</span>
              </span>
            </span>
            <span className="shrink-0 font-body text-sm font-semibold tabular-nums text-cream">
              {tc("subtotalValue", { amount: item.lineTotal })}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-4 pt-4">
        <span className="font-body text-sm font-semibold text-cream">{t("itemsTotal")}</span>
        <span className="font-display text-xl font-bold tabular-nums text-cream">
          {tc("subtotalValue", { amount: cart.subtotal })}
        </span>
      </div>
    </section>
  );

  return (
    <div className="co-page">
      <section className="mx-auto max-w-[1400px] px-6 pb-12 pt-8 md:px-12 md:pb-16 md:pt-10">
        <h1 className="flex items-center gap-2.5 font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
          <Sprout aria-hidden className="size-[0.8em] text-sage" strokeWidth={2} />
        </h1>
        <p className="mt-1 font-body text-sm text-stone">{t("subheading")}</p>

        <div className="mt-5">
          {cart.unavailable.length > 0 ? (
            <div className="grid gap-8 lg:grid-cols-[1fr_400px] lg:gap-12">
              <div className="rounded-2xl bg-sand p-6 md:p-8">
                <Notice
                  heading={t("cartChangedHeading")}
                  body={t("cartChangedBody")}
                  href="/cart"
                  cta={t("reviewCart")}
                />
              </div>
              <aside className="lg:sticky lg:top-28 lg:self-start">
                <div className="co-card co-card--dark p-5 md:p-6">{summary}</div>
              </aside>
            </div>
          ) : (
            <PayForm
              locale={locale}
              summary={summary}
              payable={open}
              subtotal={cart.subtotal}
              partners={shippingProviders().map((p) => p.name)}
              greensOnly={greens}
              readyDate={cart.readyDate ? istDateISO(cart.readyDate) : null}
              pickupDate={cart.readyDate ? istDateISO(courierPickup(cart.readyDate)) : null}
              addresses={deliverable.map((a) => ({
                addrId: a.addrId,
                recipient: a.recipient,
                street: [a.line1, a.line2, a.landmark].filter(Boolean).join(", "),
                place: formatPlace(a),
                phone: formatPhone(a.phone),
                isDefault: a.isDefault,
              }))}
              savedCount={addresses.length}
              emptyBody={addresses.length === 0 ? t("noAddressBody") : t("noDeliverableBody")}
              /* A first address is almost always the account holder's. */
              prefill={{
                recipient: profile?.name ?? actor.name ?? "",
                phone: profile?.phone ?? "",
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function Notice({
  heading,
  body,
  href,
  cta,
}: {
  heading: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div>
      <h2 className="font-display text-base font-semibold text-forest">
        {heading}
      </h2>
      <p className="mt-2 font-body text-sm leading-relaxed text-stone">{body}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-5 inline-flex rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

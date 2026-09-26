import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { ShoppingBag, Sprout } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { lineId } from "@/lib/cart/cart";
import type { CartItem } from "@/lib/cart/server";
import { lineUnits } from "@/lib/cart/line-display";
import { hydrateCart } from "@/lib/cart/server";
import { formatDeliveryDate, istDateISO } from "@/lib/delivery-date";
import { GATEWAY_LABEL, paymentProvider } from "@/lib/payments";
import { shippingProviders } from "@/lib/shipping";
import { travelsOnOwnRun } from "@/lib/shipping/parcel";
import { splitByArea } from "@/lib/cart/area-split";
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
  /* Greens alone can go only where the own run goes. Greens **with** other
     things can go anywhere (the owner, 26 Sep 2026): outside the area the
     greens are set aside, greyed in the summary, and the rest is ordered
     (`splitByArea`). */
  const mixed = greens && cart.items.some((i) => i.kind !== "variety");
  const outside = (pin: string) => greens && !served.get(pin);
  const deliverable = greens && !mixed ? addresses.filter((a) => served.get(a.pincode)) : addresses;
  const provider = paymentProvider();
  const open = provider !== null;

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

  /* A cart whose lines are ready on different days is grouped by that day
     (the owner, 24 Sep 2026): the customer sees what is ready when and why,
     instead of a single "everything arrives" date the cart used to state
     before any courier was chosen. Each parcel leaves once what is in it is
     ready; the arrival is under the card once partners are picked
     (`PayForm`). */
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  const reachable = splitByArea(cart.items, false);
  const line = (item: (typeof cart.items)[number]) => (
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
      <span className="line-price shrink-0 font-body text-sm font-semibold tabular-nums text-cream">
        {tc("subtotalValue", { amount: item.lineTotal })}
      </span>
    </li>
  );

  /* The right-hand card: what is being bought — the lines and their total,
     nothing about delivery. Delivery, the grand total and the pay button are
     `PayForm`'s payment step, because only the form knows which address —
     and so which delivery charge — is chosen. */
  const summaryFor = (inArea: boolean) => {
    const { kept: items, setAside } = splitByArea(cart.items, inArea);
    const groups = readyGroups(items);
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    /* Keyed because the page hands `PayForm` two of these, one for each kind
       of address, and it swaps them in one slot: without a key React logs a
       missing-key warning for the pair (seen in dev, 26 Sep 2026). */
    return (
    <section key={inArea ? "in-area" : "outside"} aria-labelledby="order-summary">
      <h2 id="order-summary" className="font-display text-lg font-bold text-cream">
        {t("summaryHeading")}
      </h2>
      <p className="mt-1 font-body text-sm text-cream/70">
        {t("summaryLine", { count: items.length, amount: subtotal })}
      </p>
      {groups.length > 1 ? (
        <div className="mt-4 border-t border-cream/15">
          {groups.map((g) => (
            <div key={g.iso} className="border-b border-cream/15 pb-1 pt-3">
              <p className="flex flex-wrap items-baseline gap-x-2 font-body text-[11px] uppercase tracking-widest text-cream/60">
                <span className="font-semibold text-cream">
                  {t("groupReady", { date: formatDeliveryDate(g.date, dateLocale) })}
                </span>
                <span>{g.reasons.map((r) => t(r)).join(" · ")}</span>
              </p>
              <ul className="[&>li:last-child]:border-b-0">{g.items.map(line)}</ul>
            </div>
          ))}
          <p className="pt-3 font-body text-xs leading-relaxed text-cream/65">{t("groupsNote")}</p>
        </div>
      ) : (
        <ul className="mt-4 border-t border-cream/15">{items.map(line)}</ul>
      )}
      <div className="flex items-baseline justify-between gap-4 pt-4">
        <span className="font-body text-sm font-semibold text-cream">{t("itemsTotal")}</span>
        <span className="font-display text-xl font-bold tabular-nums text-cream">
          {tc("subtotalValue", { amount: subtotal })}
        </span>
      </div>
      {/* Greens the chosen address is outside the area for: shown, greyed,
          and not counted — they stay in the cart after this order. */}
      {setAside.length > 0 && (
        <div className="mt-5 rounded-xl border border-cream/15 bg-cream/5 p-3.5">
          <p className="font-body text-[11px] font-semibold uppercase tracking-widest text-cream/70">
            {t("setAsideHeading")}
          </p>
          <ul className="mt-1 opacity-55 grayscale [&>li:last-child]:border-b-0 [&_.line-price]:line-through">
            {setAside.map(line)}
          </ul>
          <p className="mt-2 font-body text-xs leading-relaxed text-cream/70">{t("setAsideBody")}</p>
        </div>
      )}
    </section>
    );
  };

  return (
    <div className="co-page">
      <section className="mx-auto max-w-[1400px] px-6 pb-12 pt-8 md:px-12 md:pb-16 md:pt-10">
        <h1 className="flex items-center gap-2.5 font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
          <Sprout aria-hidden className="size-[0.8em] text-sage" strokeWidth={2} />
        </h1>
        <p className="mt-1 font-body text-sm text-stone">{t("subheading")}</p>

        <div className="mt-5">
          {cart.unavailable.length > 0 || cart.overStock.length > 0 ? (
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
                <div className="co-card co-card--dark p-5 md:p-6">{summaryFor(true)}</div>
              </aside>
            </div>
          ) : (
            <PayForm
              locale={locale}
              summary={summaryFor(true)}
              /* Only when there is something to set aside and something left. */
              summaryOutside={mixed ? summaryFor(false) : null}
              subtotalOutside={reachable.kept.reduce((sum, i) => sum + i.lineTotal, 0)}
              payable={open}
              gatewayLabel={provider ? GATEWAY_LABEL[provider.name] : ""}
              subtotal={cart.subtotal}
              partners={shippingProviders().map((p) => p.name)}
              greensOnly={greens && !mixed}
              addresses={deliverable.map((a) => ({
                addrId: a.addrId,
                recipient: a.recipient,
                street: [a.line1, a.line2, a.landmark].filter(Boolean).join(", "),
                place: formatPlace(a),
                phone: formatPhone(a.phone),
                isDefault: a.isDefault,
                outsideArea: outside(a.pincode),
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

/**
 * The cart's lines by the day each is ready, earliest first, with the reasons
 * that day is what it is. Keyed on the kind first and the line's sourcing
 * second — shelf or brought in — for the kinds we hold.
 */
function readyGroups(items: readonly CartItem[]) {
  const byDay = new Map<string, { iso: string; date: Date; items: CartItem[]; reasons: string[] }>();
  for (const item of items) {
    const iso = istDateISO(item.readyDate);
    const g = byDay.get(iso) ?? { iso, date: item.readyDate, items: [], reasons: [] };
    const reason =
      item.kind === "variety"
        ? "reasonGrow"
        : item.kind === "rack"
          ? "reasonBuild"
          : item.sourcing === "shelf"
            ? "reasonShelf"
            : "reasonOrdered";
    if (!g.reasons.includes(reason)) g.reasons.push(reason);
    g.items.push(item);
    byDay.set(iso, g);
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

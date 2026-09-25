import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Lock, ShieldCheck, ShoppingBag, Sprout, Truck } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { PinnedColumn } from "@/components/ui/PinnedColumn";
import { KindIcon } from "@/components/cart/KindIcon";
import { hydrateCart } from "@/lib/cart/server";
import { lineId } from "@/lib/cart/cart";
import { lineHref, lineUnits, stepKey } from "@/lib/cart/line-display";
import { clearCart } from "./actions";
import { CartLineControls } from "./CartLineControls";

/**
 * /cart — SPEC §18.6. The ad-hoc basket.
 *
 * Reads the cookie and **recomputes every figure** from DynamoDB and the
 * content files (`hydrateCart`). No price, name or total is ever taken from the
 * cookie, so a customer cannot edit their own total and a price change reaches
 * an abandoned cart (SPEC §9).
 *
 * The button leads to `/checkout`, which re-reads the cart itself: nothing on
 * this page is passed forward.
 *
 * Checkout's layout (the owner, 24 Sep 2026): the lines scroll on the left
 * and the summary stays pinned on the right (`PinnedColumn`).
 *
 * **No delivery date here, and no delivery price** (the owner, 24 Sep 2026).
 * Both depend on the address — the date on which courier carries it, the
 * price on where it is going — so a date on this page was a promise checkout
 * then contradicted ("Everything arrives Fri 2 Oct" here, "Arrives Mon 5 Oct"
 * with Delhivery there). Checkout groups the lines by when each is ready and
 * gives the arrival date once a partner is picked.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/cart"),
    /* A basket is per-person and has nothing to index. */
    robots: { index: false, follow: true },
  };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("cart");
  const cart = await hydrateCart(locale);

  if (cart.items.length === 0) {
    return (
      <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-12 md:py-24">
        <h1 className="font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h1>
        <p className="mt-4 font-display text-lg font-semibold text-forest">
          {t("empty")}
        </p>
        <p className="mt-2 max-w-md font-body text-sm text-stone">
          {t("emptyBody")}
        </p>
        <Link
          href="/microgreens"
          className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-forest px-7 py-3 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          <ShoppingBag size={17} strokeWidth={1.75} />
          {t("browse")}
        </Link>
      </section>
    );
  }

  return (
    <div className="co-page">
      <section className="mx-auto max-w-[1400px] px-6 pb-14 pt-8 md:px-12 md:pb-20 md:pt-10">
        <p className="font-body text-[11px] uppercase tracking-widest text-stone">
          {t("count", { count: cart.items.length })}
        </p>
        <h1 className="mt-2 flex items-center gap-2.5 font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
          <Sprout aria-hidden className="size-[0.8em] text-sage" strokeWidth={2} />
        </h1>
        <p className="mt-1 font-body text-sm text-stone">{t("subheading")}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
          <div className="min-w-0 space-y-3">
            {cart.unavailable.length > 0 && (
              <div className="rounded-2xl border border-terracotta/25 bg-terracotta/[0.04] p-5">
                <h2 className="font-display text-base font-semibold text-terracotta">
                  {t("unavailableHeading")}
                </h2>
                <p className="mt-1.5 font-body text-sm text-ink">
                  {t("unavailableBody", {
                    count: cart.unavailable.length,
                    keys: cart.unavailable.join(", "),
                  })}
                </p>
              </div>
            )}

            <ul className="space-y-3">
              {cart.items.map((item) => (
                <li
                  key={lineId(item)}
                  className="co-card flex flex-wrap items-center gap-x-5 gap-y-3 p-4 transition-shadow hover:shadow-md md:p-5"
                >
                  {/* Three catalogues, three routes. The kind is what decides,
                      which is also why it is part of a line's identity in the
                      cookie: a seed and a green can share a content key. */}
                  <Link href={lineHref(item)} className="group flex min-w-0 flex-1 basis-64 items-center gap-4">
                    <span className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-sand md:size-24">
                      {item.image ? (
                        <Image
                          src={item.image.src}
                          alt={item.image.alt}
                          fill
                          sizes="96px"
                          className="object-contain transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <KindIcon kind={item.kind} className="absolute inset-0 m-auto size-11 bg-forest text-cream" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-base font-semibold leading-snug text-forest transition-colors group-hover:text-stone">
                        {item.name}
                      </span>
                      {/* The unit differs by kind, so both halves of this
                          line do: a seed per 100 g, a green per tray, a
                          tray-product per pack, a rack per rack
                          (`lineUnits`). */}
                      <span className="mt-1 block font-body text-xs text-stone">{lineUnits(item, t)}</span>
                      {/* The shelf fell below this line after it was added
                          (the owner, 25 Sep 2026: stock is the limit).
                          Checkout waits until it is reduced; how much is
                          left is never said. */}
                      {item.units > item.maxUnits && (
                        <span role="status" className="mt-1 block font-body text-xs font-semibold text-terracotta">
                          {item.maxUnits === 0 ? t("lineSoldOut") : t("lineOverStock")}
                        </span>
                      )}
                    </span>
                  </Link>

                  <div className="flex flex-1 basis-56 items-center justify-between gap-4 sm:flex-none sm:basis-auto">
                    <CartLineControls
                      kind={item.kind}
                      contentKey={item.key}
                      units={item.units}
                      /* The per-line wholesale cap, the same for every kind. */
                      max={item.maxUnits}
                      /* The step labels name the unit, so they follow the kind:
                         "one less 100 g" beside a pack of two trays is wrong to
                         a screen reader and to nobody else. */
                      labels={{
                        decrease: t(stepKey(item.kind, "decrease"), { name: item.name }),
                        increase: t(stepKey(item.kind, "increase"), { name: item.name }),
                        remove: t("remove", { name: item.name }),
                        removeShort: t("removeShort"),
                      }}
                    />
                    <span className="w-20 shrink-0 text-right font-display text-lg font-bold tabular-nums text-forest">
                      {t("subtotalValue", { amount: item.lineTotal })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-4 px-1 pt-2">
              <Link
                href="/microgreens"
                className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-forest transition-colors hover:text-stone"
              >
                <ArrowLeft aria-hidden size={15} strokeWidth={2} />
                {t("keepBrowsing")}
              </Link>
              <form action={clearCart}>
                <ConfirmSubmit
                  label={t("clear")}
                  title={t("clearTitle")}
                  message={t("clearConfirm")}
                  confirmLabel={t("clearYes")}
                  cancelLabel={t("cancel")}
                  className="font-body text-sm text-stone underline underline-offset-4 transition-colors hover:text-terracotta"
                />
              </form>
            </div>
          </div>

          <PinnedColumn className="lg:self-start">
            <div className="pin-column__scroll co-card co-card--dark p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-cream">{t("summaryHeading")}</h2>
              <dl className="mt-4 space-y-3 border-t border-cream/15 pt-4 font-body text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-cream/75">{t("count", { count: cart.items.length })}</dt>
                  <dd className="font-semibold tabular-nums text-cream">
                    {t("subtotalValue", { amount: cart.subtotal })}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-cream/75">{t("delivery")}</dt>
                  <dd className="text-cream/75">{t("deliveryLater")}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-cream/15 pt-4">
                <span className="font-body text-sm font-semibold text-cream">{t("itemsTotal")}</span>
                <span className="font-display text-2xl font-bold tabular-nums text-cream">
                  {t("subtotalValue", { amount: cart.subtotal })}
                </span>
              </div>

              <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-cream/10 px-3.5 py-3 font-body text-xs leading-relaxed text-cream/85">
                <Truck aria-hidden size={16} strokeWidth={1.75} className="mt-px shrink-0 text-cream" />
                {t("deliveryAtCheckout")}
              </p>

              {/* Checkout is signed-in only for now, so a guest goes through
                  login and comes back to /checkout (src/proxy.ts). Held back
                  while a seed line asks for more than the shelf has. */}
              {cart.overStock.length > 0 ? (
                <p className="mt-5 rounded-xl bg-terracotta/20 px-4 py-3 text-center font-body text-sm font-semibold text-cream">
                  {t("overStockBlock")}
                </p>
              ) : (
                <Link
                  href="/checkout"
                  className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full bg-cream px-7 py-3.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage"
                >
                  <Lock size={16} strokeWidth={1.75} />
                  {t("checkoutCta")}
                </Link>
              )}
              <p className="mt-3 flex items-center justify-center gap-1.5 font-body text-xs text-cream/65">
                <ShieldCheck aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
                {t("secureNote")}
              </p>
            </div>
          </PinnedColumn>
        </div>
      </section>
    </div>
  );
}

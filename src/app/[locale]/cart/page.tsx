import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck, Info, ShoppingBag } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { hydrateCart } from "@/lib/cart/server";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { formatDeliveryDate } from "@/lib/delivery-date";
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
 * **There is deliberately no pay button.** Cashfree is not wired up (SPEC §9),
 * so a checkout CTA could only fail. The page says so in a sentence instead,
 * which is the honest version of the same information.
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
  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";

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
    <section className="mx-auto max-w-[1400px] px-6 py-12 md:px-12 md:py-16">
      <p className="font-body text-[11px] uppercase tracking-widest text-stone">
        {t("count", { count: cart.items.length })}
      </p>
      <h1 className="mt-3 font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-tight tracking-tight text-forest">
        {t("heading")}
      </h1>

      {cart.unavailable.length > 0 && (
        <div className="mt-8 rounded-2xl border border-terracotta/25 bg-terracotta/[0.04] p-5">
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

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
        <ul className="border-t border-forest/15">
          {cart.items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-x-5 gap-y-4 border-b border-forest/15 py-5"
            >
              <Link
                href={`/microgreens/${item.key}`}
                className="group flex min-w-0 flex-1 items-center gap-4"
              >
                <span className="relative block size-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                  {item.image && (
                    <Image
                      src={item.image.src}
                      alt={item.image.alt}
                      fill
                      sizes="80px"
                      className="object-contain"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-semibold text-forest transition-colors group-hover:text-stone">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-stone">
                    {t("linePrice", { price: item.pricePer100g })}
                    {" · "}
                    {t("lineGrams", { grams: item.grams })}
                  </span>
                  <span className="mt-0.5 block font-body text-xs text-stone/80">
                    {t("colReady")}: {formatDeliveryDate(item.readyDate, dateLocale)}
                  </span>
                </span>
              </Link>

              <CartLineControls
                contentKey={item.key}
                units={item.units}
                max={MAX_UNITS_PER_LINE}
                labels={{
                  decrease: t("decrease", { name: item.name }),
                  increase: t("increase", { name: item.name }),
                  remove: t("remove", { name: item.name }),
                  removeShort: t("removeShort"),
                }}
              />

              <span className="w-20 shrink-0 text-right font-display text-base font-semibold tabular-nums text-forest">
                {t("subtotalValue", { amount: item.lineTotal })}
              </span>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl bg-sand p-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-body text-sm text-stone">{t("subtotal")}</span>
              <span className="font-display text-2xl font-bold tabular-nums text-forest">
                {t("subtotalValue", { amount: cart.subtotal })}
              </span>
            </div>
            <p className="mt-1 font-body text-xs text-stone">
              {t("totalGrams", { grams: cart.grams })}
            </p>
            <p className="mt-4 border-t border-forest/15 pt-4 font-body text-xs leading-relaxed text-stone">
              {t("deliveryNote")}
            </p>
          </div>

          {cart.readyDate && (
            <div className="mt-5 rounded-2xl border border-forest/15 p-6">
              <h2 className="flex items-start gap-2.5 font-display text-base font-semibold text-forest">
                <CalendarCheck size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                {t("readyHeading", {
                  date: formatDeliveryDate(cart.readyDate, dateLocale),
                })}
              </h2>
              {/* Two different explanations, because the reason for the date is
                  different. A single-window cart is simply "sown tomorrow"; a
                  mixed one needs to say why the fast green waits for the slow
                  one, which SPEC §18.6 flags as the thing not to leave as a
                  surprise. */}
              <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                {cart.splitDates ? t("readySplit") : t("readySingle")}
              </p>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-dashed border-forest/25 p-6">
            <h2 className="flex items-start gap-2.5 font-display text-base font-semibold text-forest">
              <Info size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              {t("checkoutHeading")}
            </h2>
            <p className="mt-2 font-body text-xs leading-relaxed text-stone">
              {t("checkoutBody")}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-5">
            <Link
              href="/microgreens"
              className="font-body text-sm font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
            >
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
        </aside>
      </div>
    </section>
  );
}

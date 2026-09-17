import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck, Info, ShoppingBag } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { hydrateCart } from "@/lib/cart/server";
import { lineId } from "@/lib/cart/cart";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { rackLineHref } from "@/lib/racks/cart-key";
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
              key={lineId(item)}
              className="flex flex-wrap items-center gap-x-5 gap-y-4 border-b border-forest/15 py-5"
            >
              {/* Three catalogues, three routes. The kind is what decides,
                  which is also why it is part of a line's identity in the
                  cookie: a seed and a green can share a content key. */}
              <Link
                href={lineHref(item)}
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
                  {/* The unit differs by kind, so both halves of this line
                      do: a green and a seed are priced per 100 g and counted
                      in grams, a tray per pack, a rack per rack.
                      `item.grams` is null for both unweighed kinds rather than
                      0, which is what makes this a branch instead of a "0 g" —
                      but null alone no longer says *which* unit, so the kind
                      is what picks the words. */}
                  <span className="mt-0.5 block font-body text-xs text-stone">
                    {lineUnits(item, t)}
                  </span>
                  {/* Every line has a date, and the *reason* differs by kind:
                      a green is grown, a seed either comes off our shelf
                      tomorrow or is ordered in, a tray is always ordered in.
                      Saying which is what stops a ten-day seed looking like a
                      mistake next to a seven-day green.

                      Keyed on the kind first and the sourcing second, because
                      `sourcing` is null for two of the three kinds — reading
                      it alone would have put a tray on the greens wording. */}
                  <span className="mt-0.5 block font-body text-xs text-stone/80">
                    {lineTiming(item, dateLocale, t)}
                  </span>
                </span>
              </Link>

              <CartLineControls
                kind={item.kind}
                contentKey={item.key}
                units={item.units}
                /* The per-line wholesale cap, the same for every kind. It was
                   a seed's stock as well until 17 Sep 2026 — that is now a
                   delivery date, not a ceiling (SPEC §22.2). */
                max={item.maxUnits}
                /* The step labels name the unit, so they follow the kind: a
                   stepper that says "one less 100 g" beside a pack of two
                   trays is wrong to a screen reader and to nobody else, which
                   is exactly the kind of error that survives. */
                labels={{
                  decrease: t(stepKey(item.kind, "decrease"), { name: item.name }),
                  increase: t(stepKey(item.kind, "increase"), { name: item.name }),
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
            {/* Only when something in the cart is sold by weight. A
                trays-only cart weighs nothing we quote, and "0 g in total"
                under a ₹160 subtotal reads as a fault. */}
            {cart.grams > 0 && (
              <p className="mt-1 font-body text-xs text-stone">
                {t("totalGrams", { grams: cart.grams })}
              </p>
            )}
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
              {/* One sentence for the reason the date is what it is, chosen in
                  order of what dominates it. A mixed cart needs the "why is the
                  fast thing waiting" explanation SPEC §18.6 flags as the thing
                  not to leave as a surprise; a greens-only cart is simply
                  "sown tomorrow"; a seed-only cart is a dispatch, and which
                  dispatch depends on whether we are ordering any of it in. */}
              <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                {cart.splitDates
                  ? t("readySplit")
                  : cart.hasVarieties
                    ? t("readySingle")
                    : cart.hasTrays
                      ? t("readyTray")
                      : cart.hasRacks
                        ? t("readyRack")
                        : cart.hasVendorSeeds
                          ? t("readySeedVendor")
                          : t("readySeedShelf")}
              </p>
              {/* Why the greens are not arriving separately. `readySplit` states
                  the rule without naming a cause, because a split cart can be
                  all seed; the cause belongs in whichever of these applies. */}
              {cart.splitDates && cart.hasVarieties && (
                <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                  {t("readyGrowNote")}
                </p>
              )}
              {/* Why a seed order is taking a week and a half. Said only when
                  the sentence above has not already said it — a seed-only
                  vendor cart is covered by `readySeedVendor`. */}
              {cart.hasVendorSeeds && (cart.splitDates || cart.hasVarieties) && (
                <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                  {t("readyVendorNote")}
                </p>
              )}
              {/* Why a tray is taking a week. Same rule: only when the
                  sentence above was about something else, which for a tray is
                  any cart that is not trays-only. */}
              {cart.hasTrays && (cart.splitDates || cart.hasVarieties || cart.hasSeeds) && (
                <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                  {t("readyTrayNote")}
                </p>
              )}
              {/* Why a rack is taking three days, and only when the sentence
                  above was about something else. A rack is the *fastest* thing
                  in the shop after a shelf seed, so in a mixed cart the note
                  is doing the opposite job to the tray one: it explains a line
                  that is waiting for the others, not one the others wait for. */}
              {cart.hasRacks &&
                (cart.splitDates || cart.hasVarieties || cart.hasSeeds || cart.hasTrays) && (
                  <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                    {t("readyRackNote")}
                  </p>
                )}
              {/* Only when the cart mixes the two: a seed needs no growing, so
                  the thing worth saying is that it does not travel separately
                  (SPEC §7 — everything consolidates onto one run). */}
              {cart.hasSeeds && cart.hasVarieties && !cart.hasVendorSeeds && (
                <p className="mt-2 font-body text-xs leading-relaxed text-stone">
                  {t("readyWithSeeds")}
                </p>
              )}
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

/**
 * Back to the page this line was added from.
 *
 * A rack is the only kind whose link carries a query string: the other three
 * are one key to one page, while a rack key is a SKU that has to be unpacked
 * into the height, size and colour the detail page reads (`rackLineHref`).
 *
 * `/shop/racks` is the fallback for a rack key that will not parse — a cart can
 * hold a line written by an older format, and the range index is a true answer
 * where a 404 would not be.
 */
function lineHref(item: { kind: string; key: string }): string {
  if (item.kind === "seed") return `/seeds/${item.key}`;
  if (item.kind === "tray") return `/shop/trays/${item.key}`;
  if (item.kind === "rack") return rackLineHref(item.key) ?? "/shop/racks";
  return `/microgreens/${item.key}`;
}

/**
 * The price-and-quantity line, whose **unit** is the kind's.
 *
 * Extracted when racks arrived and made `item.grams === null` ambiguous: it
 * had meant "a pack" while trays were the only unweighed kind, and a rack
 * priced "per pack" and counted in "packs" is the exact class of wrong number
 * that survives review because the code reads fine.
 */
function lineUnits(
  item: { kind: string; unitPrice: number; units: number; grams: number | null },
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (item.kind === "rack") {
    return `${t("linePriceRack", { price: item.unitPrice })} · ${t("lineRacks", { count: item.units })}`;
  }
  if (item.grams === null) {
    return `${t("linePricePack", { price: item.unitPrice })} · ${t("linePacks", { count: item.units })}`;
  }
  return `${t("linePrice", { price: item.unitPrice })} · ${t("lineGrams", { grams: item.grams })}`;
}

/**
 * Which stepper label names this kind's unit.
 *
 * A screen reader hearing "one less 100 g" beside a rack is the only person
 * this affects, which is precisely why it is worth a function: it is invisible
 * to everyone reviewing the page.
 */
function stepKey(kind: string, dir: "decrease" | "increase"): string {
  if (kind === "rack") return dir === "decrease" ? "decreaseRack" : "increaseRack";
  if (kind === "tray") return dir === "decrease" ? "decreasePack" : "increasePack";
  return dir;
}

/**
 * The one-line reason a cart line arrives when it does.
 *
 * Extracted from the JSX because it is now a three-way on the kind with a
 * nested two-way inside one arm, and nested ternaries that deep in a template
 * are where a wrong branch hides. Takes the already-scoped `t` so it resolves
 * no messages of its own.
 */
function lineTiming(
  item: { kind: string; readyDate: Date; sourcing: string | null },
  dateLocale: string,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const date = formatDeliveryDate(item.readyDate, dateLocale);
  /* A rack is built rather than ordered in or grown — its own wording, because
     "ordered in for you" would credit a supplier that does not exist. */
  if (item.kind === "rack") return t("lineBuild", { date });
  if (item.kind === "tray") return t("lineSupplier", { date });
  if (item.kind === "seed") {
    return item.sourcing === "shelf"
      ? t("lineShelf", { date })
      : t("lineVendor", { date });
  }
  return `${t("colReady")}: ${date}`;
}

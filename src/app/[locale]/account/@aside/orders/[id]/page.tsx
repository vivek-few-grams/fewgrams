import { getTranslations } from "next-intl/server";
import { MapPin, Phone } from "lucide-react";
import { formatPhone, formatPlace } from "@/lib/account/validation";
import { loadVisibleOrder } from "../../../orders/[id]/load";

/**
 * "Delivering to", above the account menu on an order's page (the owner,
 * 26 Sep 2026). From `lg` only — below it the menu is a row of tabs on top and
 * the order page shows the address in its own card instead.
 *
 * Renders nothing for an order the visitor may not see; the page itself
 * answers that with a 404.
 */
export default async function OrderAside({ params }: PageProps<"/[locale]/account/orders/[id]">) {
  const { id } = await params;
  const order = await loadVisibleOrder(id);
  if (!order) return null;

  const t = await getTranslations("account.orders.detail");
  const a = order.address;
  const street = [a.line1, a.line2, a.landmark].filter(Boolean).join(", ");

  return (
    /* `flex-1` takes the height the column gains to line up with the hero,
       and the phone row sits at the foot of it. */
    <section className="hidden rounded-2xl border border-forest/15 bg-cream p-5 lg:flex lg:flex-1 lg:flex-col">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-forest">
        <MapPin aria-hidden size={17} strokeWidth={1.75} />
        {t("deliverTo")}
      </h2>
      <address className="mt-3 font-body text-sm not-italic leading-relaxed text-forest">
        <span className="block font-semibold">{a.recipient}</span>
        <span className="block text-stone">{street}</span>
        <span className="block text-stone">{formatPlace(a)}</span>
      </address>
      <p className="mt-3 flex items-center gap-2 border-t border-forest/10 pt-3 font-body text-sm text-forest lg:mt-auto">
        <Phone aria-hidden size={15} strokeWidth={1.75} className="text-stone" />
        {formatPhone(a.phone)}
      </p>
    </section>
  );
}

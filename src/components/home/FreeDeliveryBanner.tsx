import { getTranslations } from "next-intl/server";
import { Truck } from "lucide-react";
import { FREE_DELIVERY_FROM } from "@/lib/shipping/fee";

/**
 * The free-delivery strip above the hero (the owner, 4 Oct 2026).
 *
 * The figure comes from `FREE_DELIVERY_FROM`, the same constant checkout
 * charges by (SPEC §7.4), so the banner cannot promise a threshold the
 * checkout does not honour. It names the threshold and nothing else — no
 * claim about what the prices include.
 */
export async function FreeDeliveryBanner() {
  const t = await getTranslations("home.freeDelivery");
  return (
    <p className="flex items-center justify-center gap-2 bg-forest px-4 py-2 text-center font-body text-sm font-semibold text-cream">
      <Truck aria-hidden size={16} strokeWidth={1.75} className="shrink-0" />
      {t("banner", { amount: FREE_DELIVERY_FROM })}
    </p>
  );
}

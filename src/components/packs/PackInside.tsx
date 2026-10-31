import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import type { SellablePack } from "@/lib/packs/catalogue";

/**
 * What a starter pack holds, one line per part — the pack's own page (SPEC
 * §29.3). The comparison on `/shop/packs` is a table of the same parts, a row
 * each, built from the same numbers.
 *
 * Every count and size is printed from the pack's row and the rows it names,
 * never from the copy: the content file says what the pack is *for* and is
 * barred from stating figures (`pack-contract.ts`). The consultation line is
 * the one place the city is named, and only for a pack whose `onSite` is set
 * (the owner's exception, 30 Oct 2026).
 */
export async function PackInside({ sellable }: { sellable: SellablePack }) {
  const t = await getTranslations("shop.packs");
  const { pack, rack, tray, medium } = sellable;

  const lines: string[] = [
    ...(rack
      ? [
          `${t("racks", { count: pack.rackCount, height: rack.heightFt, shelves: rack.shelves })}. ${t(
            "rackSize",
            { depth: rack.depthFt, length: rack.lengthFt },
          )}`,
        ]
      : []),
    t("items", { count: pack.trayCount, name: tray.name }),
    t("seeds", { count: pack.seedCount, grams: GRAMS_PER_UNIT }),
    ...(medium ? [t("items", { count: pack.mediumCount, name: medium.name })] : []),
    t(pack.onSite ? "consultOnSite" : "consultVideo"),
  ];

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line} className="flex gap-2.5 font-body text-sm text-forest">
          <Check size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-forest" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

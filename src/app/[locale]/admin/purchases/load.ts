import { routing } from "@/i18n/routing";
import { growMediumNameMap, listGrowMediumContent } from "@/lib/content/grow-media";
import { listSeedContent, seedNameMap } from "@/lib/content/seeds";
import { listTrayContent, trayNameMap } from "@/lib/content/trays";
import { isCreditNote, type StockKind } from "@/lib/purchases/bill";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listBills } from "@/lib/repo/purchases";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listVendors } from "@/lib/repo/vendors";
import type { BillOption, ItemOption, VendorOption } from "./BillEditor";

/** Every stock item's English name, by kind and content key — for a notice
 *  that names them away from the bill form. */
export async function stockItemNames(): Promise<Record<StockKind, Record<string, string>>> {
  const locale = routing.defaultLocale;
  const [tray, media, seed] = await Promise.all([
    trayNameMap(locale),
    growMediumNameMap(locale),
    seedNameMap(locale),
  ]);
  return { tray, media, seed };
}

/**
 * What the bill form offers: vendors, and every catalogue row a stock line
 * can add to, named from its content file in English like every admin
 * screen (SPEC §4.4). A vendor switched off is still offered on a bill that
 * already names it.
 *
 * `suggestions` are the content files with no row yet, per kind — offered as
 * keys when "+ New product" adds one, the way the add forms it replaced did.
 *
 * `bills` are every bill (not credit note) in the register, newest first —
 * what a credit note can say it is against, filtered to its vendor on the
 * form.
 */
export async function billFormOptions(currentVendorId?: string): Promise<{
  vendors: VendorOption[];
  items: ItemOption[];
  suggestions: Record<StockKind, string[]>;
  bills: BillOption[];
}> {
  const locale = routing.defaultLocale;
  const [
    vendors,
    trays,
    media,
    seeds,
    trayNames,
    mediaNames,
    seedNames,
    trayFiles,
    mediaFiles,
    seedFiles,
    register,
  ] = await Promise.all([
    listVendors(),
    listTrays(),
    listGrowMedia(),
    listSeeds(),
    trayNameMap(locale),
    growMediumNameMap(locale),
    seedNameMap(locale),
    listTrayContent(locale),
    listGrowMediumContent(locale),
    listSeedContent(locale),
    listBills(),
  ]);
  const byName = (a: ItemOption, b: ItemOption) => a.label.localeCompare(b.label);
  const unrowed = (files: { key: string }[], rows: { contentKey: string }[]) => {
    const taken = new Set(rows.map((r) => r.contentKey));
    return files.map((f) => f.key).filter((k) => !taken.has(k));
  };
  return {
    bills: register
      .filter((b) => !isCreditNote(b))
      .map((b) => ({ id: b.id, vendorId: b.vendor.id, number: b.number, date: b.date })),
    suggestions: {
      seed: unrowed(seedFiles, seeds),
      tray: unrowed(trayFiles, trays),
      media: unrowed(mediaFiles, media),
    },
    vendors: vendors
      .filter((v) => v.active || v.id === currentVendorId)
      .map((v) => ({
        id: v.id,
        name: v.name,
        kind: v.kind,
        stateCode: v.state?.code ?? null,
        supplies: v.supplies,
      })),
    items: [
      ...trays
        .map((x) => ({
          value: `tray:${x.contentKey}`,
          label: trayNames[x.contentKey] ?? x.contentKey,
          kind: "tray" as const,
        }))
        .sort(byName),
      ...media
        .map((x) => ({
          value: `media:${x.contentKey}`,
          label: mediaNames[x.contentKey] ?? x.contentKey,
          kind: "media" as const,
        }))
        .sort(byName),
      ...seeds
        .map((x) => ({
          value: `seed:${x.contentKey}`,
          label: seedNames[x.contentKey] ?? x.contentKey,
          kind: "seed" as const,
        }))
        .sort(byName),
    ],
  };
}

import { routing } from "@/i18n/routing";
import { getPackContent } from "@/lib/content/packs";
import { angleRackSku } from "@/lib/racks/pricing";
import { listPacks } from "@/lib/repo/packs";
import { listAngleRackModels, loadRateCard } from "@/lib/repo/racks";
import type { AngleRackModel, Pack } from "@/lib/types";

/**
 * The starter pack a delete would pull a part out from under — SPEC §29.
 *
 * A pack names its parts by key — `trayKey`, `mediumKey`, an open-frame
 * rack's `rackSku` — and never copies them, so deleting the row behind a key
 * leaves a pack that `listSellablePacks` drops from the site for good, with
 * nothing on any screen saying why. The tray, grow media and rack screens ask
 * here before a delete and refuse it, naming the pack.
 *
 * Every pack counts, switched on or off: one switched off still names the
 * part, and would be broken the day it is switched back on.
 *
 * Not a "use server" module: a plain helper the actions import.
 */

/** The first pack `uses` matches, by its English name (its key while it has
 *  no content file), or null when none does. */
export async function packUsing(uses: (pack: Pack) => boolean): Promise<string | null> {
  const pack = (await listPacks()).find(uses);
  if (!pack) return null;
  return (await getPackContent(pack.contentKey, routing.defaultLocale))?.text.name ?? pack.contentKey;
}

/**
 * The pack whose rack would stop existing if every open-frame model `gone`
 * matches were deleted — the model itself, or each one built on a footprint
 * or an angle grade about to go. A SKU another model still builds is not
 * lost, so a duplicate can be cleared away from under a pack.
 */
export async function packLosingRack(gone: (model: AngleRackModel) => boolean): Promise<string | null> {
  const [card, models] = await Promise.all([loadRateCard(), listAngleRackModels()]);
  const skuOf = (m: AngleRackModel): string | null => {
    const frame = card.frames.find((f) => f.id === m.config.frameId);
    const angle = card.angles.find((a) => a.id === m.config.angleId);
    return frame && angle ? angleRackSku(m.config, frame, angle).toLowerCase() : null;
  };
  const kept = new Set(models.filter((m) => !gone(m)).map(skuOf));
  const lost = new Set(
    models
      .filter(gone)
      .map(skuOf)
      .filter((sku): sku is string => sku !== null && !kept.has(sku)),
  );
  if (lost.size === 0) return null;
  /* Compared lowercased, as the pack catalogue matches it. */
  return packUsing((p) => p.rackSku !== null && lost.has(p.rackSku.toLowerCase()));
}

import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/guard";
import { listPacks } from "@/lib/repo/packs";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listPackContent } from "@/lib/content/packs";
import { attachSeedContent } from "@/lib/content/seeds";
import { attachTrayContent } from "@/lib/content/trays";
import { attachGrowMediumContent } from "@/lib/content/grow-media";
import { listSellableRacks } from "@/lib/racks/catalogue";
import { packSeedMenu } from "@/lib/packs/menu";
import { routing } from "@/i18n/routing";
import type { Pack } from "@/lib/types";
import { PackRow, type PackStatus } from "./PackRow";

export const dynamic = "force-dynamic";

/**
 * `/admin/packs` — SPEC §29.7. The plans screen's pattern: a row per content
 * file in `content/packs/`, the numbers and the parts only, no text input.
 *
 * Each row says whether its pack is on sale right now and, if not, which part
 * is holding it back — a pack is shown to customers only when every part is
 * (`listSellablePacks`), and without the reason here a pack would simply be
 * missing from the site with nothing to say why.
 *
 * Read in English whatever the admin's locale (SPEC §4.4).
 */
export default async function PacksAdmin() {
  await requireRole("admin");
  const t = await getTranslations("admin.packs");
  const en = routing.defaultLocale;

  const [packs, content, racks, trayRows, mediumRows, seedRows] = await Promise.all([
    listPacks(),
    listPackContent(en),
    listSellableRacks(),
    listTrays(),
    listGrowMedia(),
    listSeeds({ activeOnly: true }),
  ]);
  const [trays, media, seeds] = await Promise.all([
    attachTrayContent(trayRows, en),
    attachGrowMediumContent(mediumRows, en),
    attachSeedContent(seedRows, en),
  ]);
  const angle = racks.filter((r) => r.range === "angle");
  const named = seeds.filter((s) => s.content);

  const rackOptions = [
    { value: "", label: t("rackNone") },
    ...angle.map((r) => ({
      value: r.sku,
      label: t("rackOption", {
        height: r.heightFt,
        shelves: r.shelves,
        depth: r.depthFt,
        length: r.lengthFt,
        price: r.price,
        sku: r.sku,
      }),
    })),
  ];
  const trayOptions = trays.map((tr) => ({
    value: tr.contentKey,
    label: tr.content?.text.name ?? tr.contentKey,
  }));
  const mediumOptions = [
    { value: "", label: t("mediumNone") },
    ...media.map((m) => ({ value: m.contentKey, label: m.content?.text.name ?? m.contentKey })),
  ];

  /* A part a pack names but the list no longer offers — a rack switched off,
     a tray or block deleted — is still listed, marked, so the row's dropdown
     shows what is stored. A controlled select whose value matches no option
     shows and posts its first option instead, which once saved a rack pack
     with no rack in it (31 Oct 2026). */
  const keepStored = <T extends { value: string }>(options: T[], stored: (string | null)[], label: (v: string) => string) => {
    const missing = [...new Set(stored)].filter((v): v is string => !!v && !options.some((o) => o.value === v));
    return [...options, ...missing.map((v) => ({ value: v, label: label(v) }))];
  };
  const rackChoices = keepStored(rackOptions, packs.map((p) => p.rackSku), (sku) => t("rackOffSale", { sku }));
  const trayChoices = keepStored(trayOptions, packs.map((p) => p.trayKey), (key) => t("partMissing", { key }));
  const mediumChoices = keepStored(mediumOptions, packs.map((p) => p.mediumKey), (key) => t("partMissing", { key }));

  /** On sale, or the first part that stops it — the same tests, in the same
   *  order, as `listSellablePacks`. */
  const statusOf = (pack: Pack): PackStatus => {
    const menu = packSeedMenu(named, pack.menuSize).length;
    const reason = !(pack.price > 0)
      ? "price"
      : pack.rackSku !== null && !angle.some((r) => r.sku.toLowerCase() === pack.rackSku!.toLowerCase())
        ? "rack"
        : !trays.some((tr) => tr.contentKey === pack.trayKey && tr.active && tr.content)
          ? "tray"
          : pack.mediumKey !== null &&
              !media.some((m) => m.contentKey === pack.mediumKey && m.active && m.content)
            ? "medium"
            : menu < pack.seedCount
              ? "menu"
              : null;
    return { reason: reason && t(`reasons.${reason}`), menu };
  };

  const stored = new Map(packs.map((p) => [p.contentKey, p]));
  const rows = content
    .map((c) => ({ contentKey: c.key, name: c.text.name, pack: stored.get(c.key) ?? null }))
    .sort((a, b) => (a.pack?.sortOrder ?? 99) - (b.pack?.sortOrder ?? 99));
  const orphans = packs
    .filter((p) => !content.some((c) => c.key === p.contentKey))
    .map((p) => ({ contentKey: p.contentKey, name: null, pack: p }));
  const configured = rows.filter((r) => r.pack !== null).length;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introMenu")}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-forest">
          {t("configuredCount", { configured, total: rows.length })}
        </h2>
        {[...rows, ...orphans].map((row) => (
          <PackRow
            key={row.contentKey}
            contentKey={row.contentKey}
            name={row.name}
            pack={row.pack}
            status={row.pack ? statusOf(row.pack) : null}
            rackOptions={rackChoices}
            trayOptions={trayChoices}
            mediumOptions={mediumChoices}
          />
        ))}
      </section>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { listTrays } from "@/lib/repo/trays";
import { attachTrayContent, listTrayContent } from "@/lib/content/trays";
import { routing } from "@/i18n/routing";
import { AddTrayForm } from "./AddTrayForm";
import { TrayTable } from "./TrayTable";

export const dynamic = "force-dynamic";

/**
 * `/admin/trays` — SPEC §23.4. Trays and drainage cells.
 *
 * Built 17 Sep 2026 on the owner's instruction:
 *
 * > *"Next final product that I would like to have admin UI is for trays and
 * > drainage cells … even these are ordered based on the request this would
 * > take minimum of seven days to deliver."*
 *
 * Fourth purpose-built catalogue screen, after varieties, plans and seeds. It
 * is **not** the generic products form coming back: that screen was one
 * pipe-delimited textarea serving four categories at once and was deleted on
 * 17 Sep 2026 (SPEC §22.3). This one knows what it is for.
 *
 * Like its siblings it owns the **numbers only** — the pack price and the lead
 * time — so there is not one text input on the page. Every word a customer
 * reads lives in `content/trays/<key>.json` (SPEC §4.3).
 *
 * ## The two numbers, and why the second one is here at all
 *
 * Price is obvious. Lead days is on the row rather than in a constant because
 * these three items already come from two suppliers, so a single figure would
 * be an average pretending to be a promise — the exact thing §22.8 still has
 * open for seeds. The bounds live in `src/lib/trays/lead-time.ts`, never at a
 * call site.
 *
 * An item can be priced **before** its content file exists. What keeps a
 * nameless item off the site is downstream: the row is flagged in red with the
 * exact path to create, and the public page skips an item it cannot name.
 *
 * Content is read in English regardless of the admin's locale: SPEC §4.4
 * scopes Kannada to customer-facing pages, and an operator setting a price
 * wants one stable set of labels.
 */
export default async function TraysAdmin() {
  const t = await getTranslations("admin.trays");

  const [rows, content] = await Promise.all([
    listTrays(),
    listTrayContent(routing.defaultLocale),
  ]);

  const withContent = await attachTrayContent(rows, routing.defaultLocale);
  /* Suggestions only — content files that exist but are not yet priced. The
     field accepts anything well-formed, so this is a convenience rather than a
     constraint. */
  const taken = new Set(rows.map((r) => r.contentKey));
  const suggestions = content.filter((c) => !taken.has(c.key)).map((c) => c.key);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
        {/* Both paragraphs run the full content width, stacked — this is an
            internal screen and the owner asked for the width rather than a
            narrow reading measure. */}
        <div className="mt-2 space-y-2">
          <p className="font-body text-sm text-stone">{t("intro")}</p>
          <p className="font-body text-sm text-stone">{t("introOps")}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">{t("addTitle")}</h2>

        <AddTrayForm suggestions={suggestions} />
        <p className="mt-4 font-body text-xs text-stone">{t("howTo")}</p>
      </section>

      <TrayTable
        trays={withContent.map((row) => ({
          tray: {
            id: row.id,
            contentKey: row.contentKey,
            price: row.price,
            leadDays: row.leadDays,
            active: row.active,
          },
          name: row.content?.text.name ?? null,
        }))}
      />
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import type { AngleGrade, RackSettings } from "@/lib/types";
import { AngleTable } from "../racks/AngleTable";
import { RatesForm } from "../racks/RatesForm";

/**
 * The rates this screen prices from, **editable here** — the same
 * `RatesForm`, writing the same shared `SETTINGS` row, as Shelf racks (the
 * owner, 3 Oct 2026: a read-only copy behind a link read as a form that had
 * to be unlocked). One row, so still one bolt price; a save here reprices all
 * three ranges exactly as a save there does.
 *
 * The angle grades are editable here too, with the same `AngleTable` — a link
 * to them on Shelf racks landed at the top of that page, nowhere near the
 * table, and served no purpose a table here does not serve better.
 */
export async function SharedRates({
  settings,
  angles,
}: {
  settings: RackSettings | null;
  angles: AngleGrade[];
}) {
  const t = await getTranslations("admin.angleRacks");

  return (
    <div className="mt-5 space-y-4">
      <RatesForm settings={settings} />

      {/* The grades themselves, editable here: the rate per foot is what an
          open-frame rack is almost entirely made of. The same table, rows and
          actions as on Shelf racks — one list, two screens. */}
      <div className="border-t border-forest/12 pt-4">
        <p className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("gradesLabel")}
        </p>
        <AngleTable angles={angles} />
      </div>
    </div>
  );
}

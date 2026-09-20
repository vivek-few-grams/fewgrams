import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AngleGrade, RackSettings } from "@/lib/types";
import { Swatch } from "../racks/ColourSelect";

/**
 * The rates this screen prices from, **read-only, with a link to where they
 * are edited.**
 *
 * There is no second rates form on purpose. Bolt, bush, legs, bolt pairs per
 * shelf, bushes per rack, the heights on sale, markup, rounding and the angle
 * grades are one DynamoDB row and one list, shared by both rack categories. A
 * form here would be a second place to change a bolt price and one of them to
 * forget — which is precisely the recalculation the owner asked to be rid of.
 *
 * But an operator pricing open-frame racks still has to see the numbers doing
 * the pricing, or the cost column is unexplained. So: shown, not editable, and
 * one click from the form that owns them.
 */
export async function SharedRates({
  settings,
  angles,
}: {
  settings: RackSettings | null;
  angles: AngleGrade[];
}) {
  const t = await getTranslations("admin.angleRacks");
  const tr = await getTranslations("admin.racks");

  const active = angles.filter((a) => a.active);

  return (
    <div className="mt-5 space-y-4">
      {settings === null ? (
        <p className="rounded-xl border border-dashed border-forest/20 p-5 font-body text-sm text-stone">
          {t("noRates")}
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t("boltSetPrice")} value={t("rupees", { amount: settings.boltSetPrice })} />
          <Fact label={t("bushPrice")} value={t("rupees", { amount: settings.bushPrice })} />
          <Fact label={t("markupPercent")} value={t("percent", { value: settings.markupPercent })} />
          <Fact label={t("roundUpToNearest")} value={t("rupees", { amount: settings.roundUpToNearest })} />
          <Fact label={t("legsPerRack")} value={String(settings.legsPerRack)} />
          <Fact label={t("boltSetsPerShelf")} value={String(settings.boltSetsPerShelf)} />
          <Fact label={t("bushesPerRack")} value={String(settings.bushesPerRack)} />
          <Fact label={t("heightsFt")} value={settings.heightsFt.join(", ")} />
        </dl>
      )}

      {/* The grades, because the rate per foot is what an open-frame rack is
          almost entirely made of — a gauge change moves every price in the
          range, so it belongs on this screen even though it is edited on the
          other one. Only the active ones: a retired gauge cannot price a new
          rack. */}
      <div className="border-t border-forest/12 pt-4">
        <p className="font-body text-xs font-medium uppercase tracking-wider text-stone">
          {t("gradesLabel")}
        </p>
        {active.length === 0 ? (
          <p className="mt-2 font-body text-sm text-stone">{t("noGrades")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {active.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-full bg-sage/50 px-3 py-1 font-body text-[11px] text-forest"
              >
                {t("gradeChip", { thickness: a.thicknessMm, rate: a.ratePerFt })}
                <span className="flex items-center gap-1">
                  {a.colours.map((slug) => (
                    <Swatch
                      key={slug}
                      slug={slug}
                      /* Falls back to the slug rather than rendering a raw
                         key, for a colour that has left the palette. */
                      title={tr.has(`colours.${slug}`) ? tr(`colours.${slug}`) : slug}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/admin/racks"
        className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-forest underline underline-offset-2 transition-colors hover:text-stone"
      >
        {t("editRates")}
        <ExternalLink size={13} strokeWidth={2} />
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[10px] font-medium uppercase tracking-widest text-stone">
        {label}
      </dt>
      <dd className="mt-0.5 font-body text-sm tabular-nums text-forest">{value}</dd>
    </div>
  );
}

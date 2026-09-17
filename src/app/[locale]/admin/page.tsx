import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listPlans } from "@/lib/repo/plans";
import { listSeeds } from "@/lib/repo/seeds";
import { listTrays } from "@/lib/repo/trays";
import { listVarieties } from "@/lib/repo/varieties";

export const dynamic = "force-dynamic";

/**
 * `/admin` — the overview. One card per catalogue screen, with a live count.
 *
 * The Products card was replaced by Seeds on 17 Sep 2026 when the generic
 * products screen was removed (SPEC §22.3), and Trays & drainage joined it the
 * same day (SPEC §23.4) — which is what took the grid off three columns.
 * Racks are not counted here on purpose: three ranges of a hundred published models each would make this the
 * loudest number on the page while being the least actionable — the rack
 * screens are a price calculator, not a stock list.
 */
export default async function AdminHome() {
  const t = await getTranslations("admin.overview");

  const [varieties, plans, seeds, trays] = await Promise.all([
    listVarieties(),
    listPlans(),
    listSeeds(),
    listTrays(),
  ]);

  const cards = [
    {
      label: t("varieties"),
      count: varieties.length,
      href: "/admin/varieties",
      hint: t("varietiesHint"),
    },
    { label: t("plans"), count: plans.length, href: "/admin/plans", hint: t("plansHint") },
    { label: t("seeds"), count: seeds.length, href: "/admin/seeds", hint: t("seedsHint") },
    { label: t("trays"), count: trays.length, href: "/admin/trays", hint: t("traysHint") },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-2xl border border-forest/15 p-6 transition-colors hover:border-forest"
        >
          <p className="font-display text-4xl font-bold tabular-nums text-forest">
            {c.count}
          </p>
          <p className="mt-1 font-display text-base font-semibold text-forest">
            {c.label}
          </p>
          <p className="mt-2 font-body text-xs leading-relaxed text-stone">{c.hint}</p>
        </Link>
      ))}
    </div>
  );
}

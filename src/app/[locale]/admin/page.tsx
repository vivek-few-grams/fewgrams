import Link from "next/link";
import { listPlans } from "@/lib/repo/plans";
import { listProducts } from "@/lib/repo/products";
import { listVarieties } from "@/lib/repo/varieties";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [varieties, plans, products] = await Promise.all([
    listVarieties(),
    listPlans(),
    listProducts(),
  ]);

  const cards = [
    {
      label: "Varieties",
      count: varieties.length,
      href: "/admin/varieties",
      hint: "Yield per tray and grow days — the two numbers the sow plan computes from",
    },
    {
      label: "Plans",
      count: plans.length,
      href: "/admin/plans",
      hint: "The bundles on the home page, and their 4-week rotation",
    },
    {
      label: "Products",
      count: products.length,
      href: "/admin/products",
      hint: "Racks, trays, seeds and snacks",
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-2xl border border-forest/15 p-6 transition-colors hover:border-forest"
        >
          <p className="font-display text-4xl font-bold text-forest tabular-nums">
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

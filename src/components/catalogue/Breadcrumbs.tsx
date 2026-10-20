import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { breadcrumbLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";

export type Crumb = { href: string; label: string };

/**
 * Home › Microgreens › Kale — where a detail page sits, above its title.
 *
 * It took the place of the single "All varieties" back link (20 Oct 2026):
 * the trail still goes one step back, and it also goes home and tells a
 * search engine how the site is arranged. The structured copy is rendered
 * here from the same list, so the trail a reader sees and the one Google
 * reads cannot disagree.
 *
 * The last item is the page itself — printed, not linked, and marked
 * `aria-current`. Separators are drawn, not read out.
 */
export async function Breadcrumbs({ trail, current, currentHref }: { trail: Crumb[]; current: string; currentHref: string }) {
  const locale = await getLocale();
  const t = await getTranslations("common.breadcrumb");
  const all: Crumb[] = [{ href: "/", label: t("home") }, ...trail];

  return (
    <nav aria-label={t("label")}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs uppercase tracking-widest text-stone">
        {all.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-2">
            <Link href={crumb.href} className="transition-colors hover:text-forest">
              {crumb.label}
            </Link>
            <span aria-hidden="true" className="text-stone/50">
              /
            </span>
          </li>
        ))}
        <li aria-current="page" className="text-forest">
          {current}
        </li>
      </ol>
      <JsonLd
        data={breadcrumbLd(locale, [
          ...all.map((c) => ({ name: c.label, path: c.href })),
          { name: current, path: currentHref },
        ])}
      />
    </nav>
  );
}

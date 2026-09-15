import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CATEGORIES, type Category } from "@/lib/types";

/**
 * Persistent category navigation inside the shop — SPEC §18.1.
 *
 * This is the piece that makes dropping the SHOP dropdown free. Moving from
 * trays to seeds is one click, same as a dropdown would be, but it is always
 * visible rather than summoned, it shows which category you are in, and there
 * is no hover target to miss on a touch screen.
 */
export async function CategoryStrip({ current }: { current?: Category }) {
  const t = await getTranslations("common.categoryStrip");
  const c = await getTranslations("common.categories");

  return (
    <nav aria-label={t("ariaLabel")} className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
      <ul className="flex gap-2 whitespace-nowrap">
        <li>
          <Link
            href="/shop"
            aria-current={current ? undefined : "page"}
            className={`ui-label inline-block rounded-full border px-4 py-1.5 font-body transition-colors [--label-size:12px] ${
              current
                ? "border-forest/20 text-stone hover:border-forest/40 hover:text-forest"
                : "border-forest bg-forest text-cream"
            }`}
          >
            {t("all")}
          </Link>
        </li>
        {CATEGORIES.map((cat) => {
          const active = cat === current;
          return (
            <li key={cat}>
              <Link
                href={`/shop/${cat}`}
                aria-current={active ? "page" : undefined}
                className={`ui-label inline-block rounded-full border px-4 py-1.5 font-body transition-colors [--label-size:12px] ${
                  active
                    ? "border-forest bg-forest text-cream"
                    : "border-forest/20 text-stone hover:border-forest/40 hover:text-forest"
                }`}
              >
                {c(cat)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

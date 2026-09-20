import { getTranslations } from "next-intl/server";
import { PRODUCT_TYPES } from "@/lib/types";
import { getDisabledProductTypes } from "@/lib/repo/catalogue-visibility";
import { toggleProductType } from "./actions";

/**
 * `/admin/settings` — SPEC §12. Turn a whole product type on or off.
 *
 * One row per `PRODUCT_TYPE`, one button each — no per-row form state to
 * manage, so unlike a variety or seed row this needs no client component at
 * all: the toggle is a plain `<form action={toggleProductType}>` around a
 * server action reference, which React runs as a progressive-enhancement
 * form post.
 *
 * This is deliberately not a per-item `active` field repeated across the
 * catalogue screens — a category is either on the site or it is not, and an
 * owner reaching for "hide snacks" should not have to flip every snack SKU
 * inactive one at a time and then remember to flip them all back. The switch
 * lives in one place and every menu and route checks it — see
 * `@/lib/catalogue/visibility`.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations("admin.settings");
  const label = await getTranslations("common.categories");
  const disabled = new Set(await getDisabledProductTypes());

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
      <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-stone">
        {t("intro")}
      </p>

      <ul className="mt-8 max-w-lg divide-y divide-forest/10 rounded-2xl border border-forest/12">
        {PRODUCT_TYPES.map((type) => {
          const visible = !disabled.has(type);
          return (
            <li key={type} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <span className="font-body text-sm font-semibold text-forest">
                {label(type)}
              </span>
              <form action={toggleProductType}>
                <input type="hidden" name="type" value={type} />
                <button
                  /* Hover moves toward what the click does, same rule as the
                     variety table's active toggle: darker/greener when it will
                     switch ON, plain when it will switch OFF. */
                  className={`rounded-full px-3 py-1 font-body text-xs font-semibold transition-colors ${
                    visible
                      ? "bg-sage text-forest hover:bg-forest hover:text-cream"
                      : "bg-forest/10 text-stone hover:bg-sage hover:text-forest"
                  }`}
                >
                  {visible ? t("visible") : t("hidden")}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Message loading — SPEC §4.4.
 *
 * Messages are split one file per area rather than one large catalogue, so a
 * change to the shop cannot conflict with a change to checkout, and a
 * translator can be handed a single file. Namespaces map to file names:
 * `t("cart")` inside `useTranslations("common")` reads
 * `messages/<locale>/common.json`.
 *
 * **English is always loaded first and deep-merged under the active locale**,
 * which implements the §4.4 rule: fall back to English on any missing key, and
 * never render an empty string or a raw message key. A missing Kannada file is
 * therefore a non-event — the page renders in English.
 */
export const NAMESPACES = [
  "common",
  "home",
  "shop",
  "microgreens",
  "seeds",
  "story",
  "cart",
  "plans",
  "auth",
  "account",
  "admin",
] as const;

type Messages = Record<string, unknown>;

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value;
  }
  return out;
}

const isPlainObject = (v: unknown): v is Messages =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function load(locale: string, namespace: string): Promise<Messages> {
  try {
    return (await import(`../../messages/${locale}/${namespace}.json`)).default;
  } catch {
    // A namespace with no file in this locale falls back to English entirely.
    return {};
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const en = await load(routing.defaultLocale, ns);
      if (locale === routing.defaultLocale) return [ns, en] as const;
      return [ns, deepMerge(en, await load(locale, ns))] as const;
    }),
  );

  return {
    locale,
    messages: Object.fromEntries(entries),
    timeZone: "Asia/Kolkata",
  };
});

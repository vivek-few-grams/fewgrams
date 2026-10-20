import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";

/**
 * Everything a public page tells a crawler about itself, built one way —
 * title, description, canonical, `hreflang`, and the share preview that
 * WhatsApp, Instagram and X draw from a pasted link.
 *
 * **One helper, because Next merges metadata shallowly.** A page that sets
 * `openGraph` replaces the layout's whole `openGraph`, so a page that set only
 * a title would silently lose the site name, the locale and the picture.
 * Building all of it here is what keeps every page's preview complete.
 *
 * The title goes through the layout's `%s | Fewgrams` template unless
 * `absoluteTitle` is set — the home page, whose title already leads with the
 * brand.
 */

/** `og:locale` takes a territory as well as a language. */
const OG_LOCALE: Record<string, string> = { en: "en_IN", kn: "kn_IN" };

/**
 * The picture a page without one of its own is shared with: the home page's
 * bowl of mixed greens. Close to the 1.91:1 frame every preview crops to,
 * and a JPEG, which every preview reads (not every one reads WebP).
 */
const SHARE_IMAGE = { src: "/img/brand/hero-bowl.jpg", width: 1774, height: 887 };

/** A format every link preview reads. The cocopeat photographs are WebP, and
 *  a page whose picture is not one of these is shared with `SHARE_IMAGE`. */
const PREVIEWABLE = /\.(jpe?g|png)$/i;

export type SharePicture = { src: string; alt: string };

export async function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  absoluteTitle = false,
}: {
  locale: string;
  /** Without the locale: `/microgreens/kale`. */
  path: string;
  title: string;
  description: string;
  /** The page's own photograph — a product's hero. A JPEG, for the reason above. */
  image?: SharePicture | null;
  absoluteTitle?: boolean;
}): Promise<Metadata> {
  const alternates = localeAlternates(locale, path);
  const text = clipDescription(description);
  const picture =
    image && PREVIEWABLE.test(image.src)
      ? { url: image.src, alt: image.alt }
      : {
          url: SHARE_IMAGE.src,
          width: SHARE_IMAGE.width,
          height: SHARE_IMAGE.height,
          alt: (await getTranslations({ locale, namespace: "common.seo" }))("shareImageAlt"),
        };

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: text,
    alternates,
    openGraph: {
      type: "website",
      siteName: brand.name,
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      url: alternates.canonical,
      title,
      description: text,
      images: [picture],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: text,
      images: [picture.url],
    },
  };
}

/**
 * A description short enough not to be cut mid-word in a search result.
 *
 * Google shows roughly 160 characters. Past that, this keeps whole sentences
 * when at least half the room is used, and otherwise stops at the last whole
 * word with an ellipsis — never a word chopped in two.
 */
export function clipDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  /* One character more than the limit, so a sentence ending exactly at the
     limit is still seen as ending there. */
  const window = flat.slice(0, max + 1);
  const end = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (end >= max / 2) return flat.slice(0, end + 1);
  const space = flat.lastIndexOf(" ", max - 1);
  return `${flat.slice(0, space).replace(/[,;:]$/, "")}…`;
}

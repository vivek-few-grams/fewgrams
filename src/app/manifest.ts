import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";

/**
 * `/manifest.webmanifest` — the name, icons and colours a phone uses when the
 * site is added to its home screen (SPEC §28.7). Next links it from every page.
 *
 * **`minimal-ui`, not `standalone`.** An iPhone gives a standalone home-screen
 * app its own cookies, apart from Safari's, and sign-in is a link opened from
 * an email — it would sign in Safari and leave the app signed out. iOS treats
 * `minimal-ui` as an ordinary browser tab, so the shortcut opens Safari with
 * the visitor's own session; Android opens a window of its own with a back
 * and reload bar, sharing Chrome's cookies.
 *
 * The 192 and 512 px icons are `src/app/icon.svg` rendered with sharp, the
 * sizes Android asks for. White for the browser bar, as the header is.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "common.seo" });
  return {
    id: "/",
    name: brand.name,
    short_name: brand.name,
    description: t("homeDescription"),
    lang: "en-IN",
    start_url: "/",
    scope: "/",
    display: "minimal-ui",
    background_color: "#fbf9f3",
    theme_color: "#ffffff",
    icons: [
      { src: "/img/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/img/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

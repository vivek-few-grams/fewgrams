import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Montserrat, Noto_Sans_Kannada, Quicksand } from "next/font/google";
import { brand } from "@/lib/brand";
import { clipDescription } from "@/lib/seo/metadata";
import { CLIENT_MESSAGES, pickMessages } from "@/i18n/client-messages";
import { Header } from "@/components/chrome/Header";
import { Footer } from "@/components/chrome/Footer";
import { LeafBackdrop } from "@/components/chrome/LeafBackdrop";
import { PageLoader } from "@/components/chrome/PageLoader";
import { TitleTicker } from "@/components/chrome/TitleTicker";
import { GardenBadge } from "@/components/chrome/GardenBadge";
import { loaderInitScript } from "@/components/chrome/loader-init";
import { currentActor } from "@/lib/auth/guard";
import { routing } from "@/i18n/routing";
import { NAV_CATEGORIES } from "@/lib/types";
import "../globals.css";

/* SPEC §17.2. Self-hosted by next/font — no runtime request to Google and
   no layout shift. Kannada ships on every page rather than only the /kn
   routes, because the language switch has to render its own endonym. */
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const notoKannada = Noto_Sans_Kannada({
  variable: "--font-noto-kannada",
  subsets: ["kannada"],
  /* 500 is not optional: the nav uses `font-medium`, and without it the
     browser falls back to 400 for Kannada while Latin renders at 500 — the
     Kannada nav then reads as lighter and "smaller" beside its Latin
     siblings, which is a weight mismatch, not a size one. */
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** SPEC §4.4 — both locales are prerenderable. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    /* Turns every relative URL in a page's metadata — share pictures above all
       — into an address on the live site. */
    metadataBase: new URL(brand.url),
    title: {
      default: `${brand.name} | ${t("seo.homeTitle")}`,
      /* Pages name themselves ("Kale microgreens") and the brand follows.
         Applies to child segments only, so the home page — this segment —
         takes the default, which already leads with the brand. */
      template: `%s | ${brand.name}`,
    },
    description: clipDescription(t("seo.homeDescription")),
    /* Canonical, hreflang and the share preview are deliberately NOT set
       here — a layout cannot know the current path, so it would claim every
       Kannada page lives at /kn. Each page sets them through pageMetadata()
       (src/lib/seo/metadata.ts). */
    applicationName: t("footer.brand"),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  /* Opts this render into static rendering rather than forcing dynamic on
     every page just because it reads the locale. */
  setRequestLocale(locale);

  const actor = await currentActor();

  /* The tab ticker's words, resolved here because it is a client component.
     Taken from `NAV_CATEGORIES` in nav order rather than from a list of its
     own, so the tab always names the same five things the header does — and
     adding a sixth category means editing one array, not two. */
  const cat = await getTranslations("common.categories");
  const tickerWords = NAV_CATEGORIES.map((c) => cat(c.slug));

  /* Only what the header and footer read. `NextIntlClientProvider` with no
     `messages` serialises the *whole* catalogue into every page — admin
     strings included, until 15 Sep 2026 — and even the customer namespaces
     alone were 54 KB of every English page (20 Oct 2026). A page whose own
     client components read messages hands them over itself with
     `ClientMessages` (src/i18n/client-messages.tsx); the admin subtree
     re-provides the full set in admin/layout.tsx. */
  const chromeMessages = pickMessages(await getMessages(), CLIENT_MESSAGES.chrome);

  return (
    <html
      lang={locale}
      // The inline script below sets data-loader on <html> before React
      // hydrates, which is a deliberate mismatch. Documented pattern — see
      // node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
      suppressHydrationWarning
      className={`${quicksand.variable} ${montserrat.variable} ${notoKannada.variable} h-full antialiased`}
    >
      <head>
        {/* Must run before first paint — see PageLoader. */}
        <script dangerouslySetInnerHTML={{ __html: loaderInitScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={chromeMessages}>
          <PageLoader />
          <TitleTicker brand={brand.name} words={tickerWords} />
          <Header actor={actor && { email: actor.email, role: actor.role }} />
          {/* `relative isolate` gives the leaves a layer of their own under the
              page content — see LeafBackdrop. */}
          <main className="relative isolate flex-1">
            <LeafBackdrop />
            {children}
          </main>
          <Footer />
          {/* The way into the play garden from any customer page; it hides
              itself on the garden, admin, cart and checkout (SPEC §25). */}
          <GardenBadge />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

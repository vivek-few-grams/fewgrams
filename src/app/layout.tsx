import type { Metadata } from "next";
import { Montserrat, Noto_Sans_Kannada, Quicksand } from "next/font/google";
import { brand } from "@/lib/brand";
import { Header } from "@/components/chrome/Header";
import { Footer } from "@/components/chrome/Footer";
import { PageLoader, loaderInitScript } from "@/components/chrome/PageLoader";
import { listVarieties } from "@/lib/repo/varieties";
import { currentActor } from "@/lib/auth/guard";
import "./globals.css";

/* SPEC §17.2. Self-hosted by next/font — no runtime request to Google and
   no layout shift. */
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
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.subline,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The PRODUCTS overlay lives in the header on every page, so the variety
  // list is fetched here rather than per-page.
  const [varieties, actor] = await Promise.all([
    listVarieties({ activeOnly: true }),
    currentActor(),
  ]);

  return (
    <html
      lang="en"
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
        <PageLoader />
        <Header
          varieties={varieties}
          actor={actor && { email: actor.email, role: actor.role }}
        />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

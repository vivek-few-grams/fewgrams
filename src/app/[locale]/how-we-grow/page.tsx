import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { getStoryBook } from "@/lib/content/story";
import { StoryBook } from "@/components/story/StoryBook";

/**
 * /how-we-grow — SPEC §18.5. The process page, as a picture book.
 *
 * **Resolves the §18.5 open decision** (22 Sep 2026). It was posed as
 * "rotating 3D models versus our own photographs", and the answer turned out
 * to be neither: a **scroll-turned storybook of commissioned illustrations**.
 *
 * The photography does not exist and will not for months — the room, the
 * racks and the trays are all real but none of it is shot, and a process page
 * is the one page that cannot ship with placeholders. 3D models were the more
 * expensive half of the same problem. Illustration buys the whole sequence
 * now, at a consistent quality, and it does something neither option could:
 * it lets the page tell the *reason* alongside the method. A photograph of a
 * sterilised tray says what we do; a page that opens on a child eating crisps
 * says why anyone should care, and the hygiene claim three pages later is
 * read by somebody who now wants it to be true.
 *
 * It also closes a dead link. `/how-we-grow` has been in the header since the
 * nav was built and 404ing ever since — called out in SPEC §4.4's admin note
 * as the one broken item in the public nav.
 *
 * Every word is in `content/story/book.json`, in both languages, and not one
 * of them is in DynamoDB: nothing on this page is a number the business
 * tunes, so there is nothing for a row to hold and no admin screen to build.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/how-we-grow">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "story" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/how-we-grow"),
  };
}

export default async function HowWeGrowPage({
  params,
}: PageProps<"/[locale]/how-we-grow">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("story");
  const pages = await getStoryBook(locale);

  return (
    <>
      {/* No page header above the book. The first page IS the title page —
          it carries the `h1` — and a heading stacked above it would say the
          same thing twice before the reader had turned anything. */}
      <StoryBook pages={pages} />

      {/* The one thing the book deliberately does not do: sell. It ends on
          "small steps, big impact" and the offer waits until the cover is
          closed. */}
      <section className="border-t border-forest/10 bg-sand px-6 py-14 md:px-12 md:py-20">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <h2 className="font-display text-[clamp(1.4rem,3vw,2.2rem)] font-bold leading-tight tracking-tight text-forest">
            {t("close.heading")}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/microgreens"
              className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-body text-sm font-medium text-cream transition-colors hover:bg-forest-deep"
            >
              {t("close.shop")}
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 rounded-full border border-forest/30 px-6 py-3 font-body text-sm font-medium text-forest transition-colors hover:border-forest hover:bg-forest hover:text-cream"
            >
              {t("close.grow")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

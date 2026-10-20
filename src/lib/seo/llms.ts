import { getTranslations } from "next-intl/server";
import { absoluteUrl } from "@/i18n/alternates";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { searchCatalogue } from "@/lib/search/catalogue";
import type { SearchKind } from "@/lib/search/match";

/**
 * `/llms.txt` — a plain guide to the site for AI assistants and agents, in
 * the llmstxt.org shape: the name, a one-line summary, then sections of links
 * with a note each, and an "Optional" section an assistant may skip. SPEC
 * §28.7.
 *
 * Google says it does not read one; some assistants do, and it costs a file.
 *
 * **The products are `searchCatalogue`'s**, which lists exactly what the grids
 * show (SPEC §27), so an item switched off in admin leaves here too. Prices
 * are read with the list, worded as the search page words them.
 *
 * English, linking the English pages; the Kannada site is one line under
 * "Optional". Every word is a message or a content file, like any other page.
 */

/** Each catalogue kind's section, in the order a visitor meets them. */
const SECTIONS: Array<{ kind: SearchKind; heading: { ns: string; key: string } }> = [
  { kind: "variety", heading: { ns: "common.categories", key: "microgreens" } },
  { kind: "plan", heading: { ns: "common.nav", key: "plans" } },
  { kind: "seed", heading: { ns: "common.categories", key: "seeds" } },
  { kind: "tray", heading: { ns: "common.categories", key: "trays" } },
  { kind: "media", heading: { ns: "common.categories", key: "media" } },
  { kind: "rack", heading: { ns: "common.categories", key: "racks" } },
];

/** Pages that are always there, each described by its own metadata. */
const ABOUT = [
  { path: "/how-we-grow", ns: "story" },
  { path: "/faq", ns: "help.faq" },
  { path: "/contact", ns: "help.contact" },
];
const POLICIES = [
  { path: "/terms", ns: "legal.terms" },
  { path: "/privacy", ns: "legal.privacy" },
  { path: "/refund-policy", ns: "legal.refunds" },
  { path: "/shipping-policy", ns: "legal.shipping" },
];

const line = (name: string, url: string, note: string) =>
  `- [${name}](${url}): ${note.replace(/\s+/g, " ").trim()}`;

export async function llmsTxt(): Promise<string> {
  const locale = routing.defaultLocale;
  const tr = (namespace: string) => getTranslations({ locale, namespace });
  const [catalogue, seo, llms, greens, seeds, price] = await Promise.all([
    searchCatalogue(locale),
    tr("common.seo"),
    tr("common.seo.llms"),
    tr("microgreens.seo"),
    tr("seeds.seo"),
    tr("search.price"),
  ]);

  /* A microgreen and a seed share a name ("Broccoli"), so each is called what
     its page title calls it. */
  const title = (kind: SearchKind, name: string) =>
    kind === "variety" ? greens("itemTitle", { name }) : kind === "seed" ? seeds("itemTitle", { name }) : name;

  /* A plan is a card on the home page; its own address is the checkout step,
     which robots.txt keeps crawlers out of. */
  const link = (kind: SearchKind, href: string) =>
    kind === "plan" ? `${brand.url}/#plans` : absoluteUrl(locale, href);

  const products = await Promise.all(
    SECTIONS.map(async ({ kind, heading }) => {
      const entries = catalogue.filter((entry) => entry.kind === kind);
      if (entries.length === 0) return [];
      const label = (await tr(heading.ns))(heading.key);
      return [
        `## ${label}`,
        "",
        ...entries.map((entry) =>
          line(
            title(kind, entry.name),
            link(kind, entry.href),
            [entry.price === null ? null : `${price(kind, { price: entry.price })}.`, entry.blurb]
              .filter(Boolean)
              .join(" "),
          ),
        ),
        "",
      ];
    }),
  );

  const pages = async (list: Array<{ path: string; ns: string }>) =>
    Promise.all(
      list.map(async ({ path, ns }) => {
        const t = await tr(ns);
        return line(t("title"), absoluteUrl(locale, path), t("description"));
      }),
    );
  const [about, policies] = await Promise.all([pages(ABOUT), pages(POLICIES)]);

  return [
    `# ${brand.name}`,
    "",
    `> ${seo("homeDescription")}`,
    "",
    ...products.flat(),
    `## ${llms("about")}`,
    "",
    ...about,
    "",
    `## ${llms("policies")}`,
    "",
    ...policies,
    "",
    /* "Optional" is the format's own keyword for a section an assistant with
       little room may skip, so it stays in English. */
    "## Optional",
    "",
    line(llms("kannada"), absoluteUrl("kn", "/"), llms("kannadaNote")),
    line(llms("sitemap"), `${brand.url}/sitemap.xml`, llms("sitemapNote")),
    line(llms("feed"), `${brand.url}/feeds/products.xml`, llms("feedNote")),
    "",
  ].join("\n");
}

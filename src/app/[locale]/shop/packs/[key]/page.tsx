import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClientMessages } from "@/i18n/client-messages";
import { Breadcrumbs } from "@/components/catalogue/Breadcrumbs";
import { PackBuilder } from "@/components/packs/PackBuilder";
import { PackInside } from "@/components/packs/PackInside";
import { GRAMS_PER_UNIT } from "@/lib/cart/cart";
import { findSellablePack, packPictures } from "@/lib/packs/catalogue";
import { colourHex } from "@/lib/racks/colours";
import { placeholderFor } from "@/lib/images/placeholder";
import { placeholderProps } from "@/lib/images/placeholder-props";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * `/shop/packs/[key]` — one starter pack, and where its seeds and rack colour
 * are chosen (SPEC §29.4). What is inside and what it is for on the left; the
 * choosing, which needs the browser, on the right (`PackBuilder`).
 *
 * The seed menu is worked out on every request (`packSeedMenu`), so it is the
 * cheapest seeds on the shelf now, not when the page was built.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/packs/[key]">) {
  const { locale, key } = await params;
  const found = await findSellablePack(key, locale);
  if (!found) return {};
  const picture = packPictures(found)[0];
  return pageMetadata({
    locale,
    path: `/shop/packs/${key}`,
    title: found.text.name,
    description: found.text.tagline,
    image: picture ? { src: picture, alt: found.text.name } : null,
  });
}

export default async function PackPage({ params }: PageProps<"/[locale]/shop/packs/[key]">) {
  const { locale, key } = await params;
  setRequestLocale(locale);

  const sellable = await findSellablePack(key, locale);
  if (!sellable) notFound();
  const { pack, text, rack, menu } = sellable;

  const t = await getTranslations("shop.packs");
  const shop = await getTranslations("shop.index");
  const nav = await getTranslations("common.nav");
  const colourLabel = await getTranslations("shop.racks.colours");
  const pictures = packPictures(sellable);

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-5 md:px-12 md:pb-24 md:pt-6">
      <Breadcrumbs
        trail={[
          { href: "/shop", label: shop("title") },
          { href: "/shop/packs", label: nav("packs") },
        ]}
        current={text.name}
        currentHref={`/shop/packs/${key}`}
      />

      {/* `grid-cols-1` is not a no-op: an implicit column sizes to its widest
          child, and the picker's full-bleed bar pushed the page 42px past a
          phone's edge. */}
      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          {/* One square per part, all the same size and centred on one line
              (the owner, 31 Oct 2026). Not bottom-aligned: the cut-outs carry
              different margins below the object — the seed packets none, the
              tray and the block about a seventh — but each is centred in its
              own file, so the centres line up where the bottoms cannot. */}
          <div
            className="flex items-center justify-evenly gap-3 rounded-3xl bg-sand px-4 py-5 md:px-6"
            aria-hidden
          >
            {pictures.map((src, i) => (
              <span key={src} className="relative aspect-square min-w-0 max-w-28 flex-1">
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain"
                  {...(i === 0 ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
                  {...placeholderProps(placeholderFor(src), "contain")}
                />
              </span>
            ))}
          </div>

          <h1 className="mt-6 font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-tight tracking-tight text-forest">
            {text.name}
          </h1>
          <p className="mt-2 font-body text-base text-forest/80">{text.tagline}</p>
          <p className="mt-4 font-display text-3xl font-bold text-forest">
            ₹{pack.price.toLocaleString("en-IN")}
          </p>
          <p className="font-body text-xs text-stone">{t("taxNote")}</p>

          <p className="mt-6 font-body text-sm leading-relaxed text-stone">{text.description}</p>

          <h2 className="mt-8 font-body text-xs font-semibold uppercase tracking-widest text-stone">
            {t("inside")}
          </h2>
          <div className="mt-3">
            <PackInside sellable={sellable} />
          </div>

          <ul className="mt-6 space-y-1.5 border-t border-forest/10 pt-5">
            {text.highlights.map((h) => (
              <li key={h} className="font-body text-sm text-forest/75">
                {h}
              </li>
            ))}
          </ul>
        </div>

        <ClientMessages entry="packs">
          <PackBuilder
            packKey={pack.contentKey}
            seedCount={pack.seedCount}
            grams={GRAMS_PER_UNIT}
            hintTwoRacks={pack.rackCount > 1}
            colours={(rack?.colours ?? []).map((slug) => ({
              slug,
              label: colourLabel(slug),
              hex: colourHex(slug) ?? "#ccc",
            }))}
            seeds={menu.map((s) => ({
              key: s.key,
              name: s.name,
              image: s.image ? { src: s.image.src, placeholder: placeholderFor(s.image.src) } : null,
            }))}
          />
        </ClientMessages>
      </div>
    </section>
  );
}

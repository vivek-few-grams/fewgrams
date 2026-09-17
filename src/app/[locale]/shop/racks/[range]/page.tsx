import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { DetailPage } from "@/components/catalogue/DetailPage";
import { AddToCart } from "@/components/catalogue/AddToCart";
import type { Shot } from "@/components/catalogue/Gallery";
import { MAX_UNITS_PER_LINE } from "@/lib/cart/cart";
import { readCartUnitsFor } from "@/lib/cart/server";
import { formatDeliveryDate } from "@/lib/delivery-date";
import { listRacksInRange, type SellableRack } from "@/lib/racks/catalogue";
import { rackCartKey, rackRangeOf } from "@/lib/racks/cart-key";
import { rackLineName, rackSizeLabel } from "@/lib/racks/describe";
import { rackReadyDate } from "@/lib/racks/lead-time";
import { isRackColour, type RackColour } from "@/lib/racks/colours";

/**
 * `/shop/racks/[range]` — SPEC §19.7. Choose a rack and buy it.
 *
 * This is where §19.5's line finally moves: a rack model *is* projected to a
 * customer now, because the owner asked for add-to-cart on 17 Sep 2026. What
 * has not changed is the reasoning behind it — a model still has no stored
 * customer-facing name, and it still is not a `ProductVariant`. It is described
 * by its own figures at read time (`rackLineName`), which is what §19.5 said a
 * model is identified by.
 *
 * ## The choice is in the URL, not in client state
 *
 * `?h=6&s=1.25x3&c=orange`. Three consequences, and they are why:
 *
 * 1. **The price is computed on the server.** A rack's price is per model, so a
 *    client-side selector would need every model's price and twenty
 *    pre-formatted totals for each of them in its payload — 45 models × 20
 *    quantities on the pipe range. With the choice in the URL, this page
 *    resolves one model and formats one set, exactly as the tray page does.
 * 2. **No JavaScript is involved in choosing.** The options are `Link`s, so
 *    they work before hydration and on a dead connection, and the selected
 *    rack is in the address bar to be shared or bookmarked.
 * 3. **`AddToCart` needs no changes.** It takes a fixed key, which is true
 *    again once the key is decided by the request rather than by a useState.
 *
 * The cost is a round trip per option tap. For a page whose whole content is
 * one price that only the server can compute, that is the honest trade.
 *
 * ## Nothing 404s on a bad option
 *
 * An unknown range 404s — it is a route segment and there are three. But a
 * height, size or colour that does not exist **falls back to the nearest
 * offered one** rather than erroring, because those come from a query string
 * that a stale bookmark or a retired part can invalidate. A rack was on sale at
 * that URL last week; the right answer is the range's current options, not a
 * dead end.
 *
 * The exception worth seeing: when a height and a size are each offered but not
 * *together*, the page says so (`noneForSize`) instead of silently moving the
 * customer to a rack they did not pick.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/shop/racks/[range]">) {
  const { locale, range } = await params;
  const r = rackRangeOf(range);
  if (!r) return {};
  const t = await getTranslations({ locale, namespace: "shop.racks" });
  return {
    title: t(`ranges.${r}.name`),
    description: t(`ranges.${r}.line`),
    alternates: localeAlternates(`/shop/racks/${r}`),
  };
}

/** `1.25x3`, the footprint as it appears in the SKU and in the query string —
 *  one spelling for both, so a URL can be read against a packing slip. */
function sizeParam(rack: SellableRack): string {
  return `${rack.depthFt}x${rack.lengthFt}`;
}

/** An option row. Links rather than a `<select>` — see the note at the top of
 *  the page component. At module scope because a component declared inside a
 *  render is a new type on every render, which resets any state it holds. */
function Options({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[11px] uppercase tracking-widest text-stone">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** One chip. `scroll={false}` so tapping an option does not jump the page back
 *  to the top — the options and the price are both below the fold on a phone,
 *  and losing your place is the whole reason a `<select>` would have been
 *  tempting. `aria-current` rather than `aria-selected`, which belongs to
 *  listbox and tab roles these are not. */
function Chip({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={`rounded-full border px-3 py-1.5 font-body text-xs transition-colors ${
        on
          ? "border-forest bg-forest text-cream"
          : "border-forest/25 text-forest hover:border-forest/60"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function RackRangePage({
  params,
  searchParams,
}: PageProps<"/[locale]/shop/racks/[range]">) {
  const { locale, range } = await params;
  setRequestLocale(locale);

  const r = rackRangeOf(range);
  if (!r) notFound();

  const racks = await listRacksInRange(r);
  /* An empty range is a 404 rather than an empty page: with no models there is
     nothing to name, nothing to price and nothing to buy, so a page would be a
     heading over a blank. The range card that links here is only rendered when
     the range has stock of models, so this is the stale-link case. */
  if (racks.length === 0) notFound();

  const t = await getTranslations("shop.racks");
  const d = await getTranslations("shop.racks.detail");
  /* The only strings still shared with the tray page, and deliberately: an
     invalid quantity or a full cart is a fact about the cart, not about what
     is in it. */
  const e = await getTranslations("shop.trays.detail.errors");

  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  /* Heights and sizes are the two axes, listed from what is actually published
     rather than from `RackSettings.heightsFt` — a height whose models were all
     deactivated must not be offered. */
  const heights = [...new Set(racks.map((x) => x.heightFt))].sort((a, b) => a - b);
  const sizes = [...new Map(racks.map((x) => [sizeParam(x), x])).values()].sort(
    (a, b) => a.lengthFt - b.lengthFt || a.depthFt - b.depthFt,
  );

  const wantHeight = Number(one(q.h));
  const height = heights.includes(wantHeight) ? wantHeight : heights[0];

  const wantSize = one(q.s);
  const size = sizes.some((x) => sizeParam(x) === wantSize)
    ? wantSize!
    : sizeParam(sizes[0]);

  /* Both axes are valid on their own; the pair may still not be built. */
  const rack = racks.find((x) => x.heightFt === height && sizeParam(x) === size) ?? null;

  const wantColour = one(q.c);
  const colour: RackColour | null =
    rack === null || rack.colours.length === 0
      ? null
      : wantColour && isRackColour(wantColour) && rack.colours.includes(wantColour)
        ? wantColour
        : rack.colours[0];

  const cartKey = rack ? rackCartKey(rack.sku, colour) : null;
  const inCart = cartKey ? await readCartUnitsFor("rack", cartKey) : 0;

  const dateLocale = locale === "kn" ? "kn-IN" : "en-IN";
  /* One date for every rack and every quantity: three days is our own build
     time, not a per-model figure (`RACK_LEAD_DAYS`). */
  const ready = t("dispatch", {
    date: formatDeliveryDate(rackReadyDate(), dateLocale),
  });

  const url = (next: { h?: number; s?: string; c?: string }) => {
    const p = new URLSearchParams({
      h: String(next.h ?? height),
      s: next.s ?? size,
    });
    /* Colour is omitted for pipe, and dropped when the size changes to one
       whose grade offers a different palette — the page will pick again. */
    const nc = next.c ?? colour;
    if (nc) p.set("c", nc);
    return `/shop/racks/${r}?${p.toString()}`;
  };

  const shots: Shot[] = [
    {
      src: `/racks/${r}/cutout.webp`,
      alt: t(`ranges.${r}.imageAlt`),
    },
  ];

  const facts = rack
    ? [
        {
          label: d("height"),
          value: d("heightOption", { height: rack.heightFt, shelves: rack.shelves }),
        },
        { label: d("size"), value: rackSizeLabel(t, rack) },
        ...(rack.gaugeMm !== null
          ? [{ label: d("steel"), value: d("steelValue", { mm: rack.gaugeMm }) }]
          : []),
        ...(rack.capacityKg !== null
          ? [
              {
                label: d("capacity"),
                value: d("capacityValue", {
                  kg: rack.capacityKg,
                  shelves: rack.shelves,
                }),
              },
            ]
          : []),
        /* The SKU, shown deliberately: it is what a packing slip and a
           WhatsApp message about the order will both say, and a customer who
           can quote it is a customer we can answer quickly. */
        { label: d("sku"), value: rack.sku },
      ]
    : [];

  return (
    <DetailPage
      back={{ href: "/shop/racks", label: d("back") }}
      name={rack ? rackLineName(t, rack, colour) : t(`ranges.${r}.name`)}
      shortDescription={t(`ranges.${r}.line`)}
      gallery={{
        shots,
        thumbLabels: shots.map((_, i) =>
          d("thumb", { n: i + 1, total: shots.length }),
        ),
        prevLabel: d("prevPhotos"),
        nextLabel: d("nextPhotos"),
      }}
      facts={facts}
      buy={
        /* A rule and top padding, because this slot sits directly under the
           facts grid: without them "CODE / RK-2F-1S-1x2-1.4" ran straight into
           the "HEIGHT" chip label and the two read as one block. A bare block
           comment, not a `{/* … *\/}` one — inside an attribute's expression
           container that would be a second child. */
        <div className="flex flex-col gap-6 border-t border-forest/10 pt-6">
          <Options label={d("height")}>
            {heights.map((h) => (
              <Chip key={h} href={url({ h })} on={h === height}>
                {d("heightOption", { height: h, shelves: h - 1 })}
              </Chip>
            ))}
          </Options>

          <Options label={d("size")}>
            {sizes.map((x) => (
              <Chip
                key={sizeParam(x)}
                href={url({ s: sizeParam(x) })}
                on={sizeParam(x) === size}
              >
                {rackSizeLabel(t, x)}
              </Chip>
            ))}
          </Options>

          {/* A range with one finish gets a sentence, not a selector with one
              option: a control that cannot change anything invites a tap that
              does nothing. */}
          {rack && rack.colours.length > 0 ? (
            <Options label={d("colour")}>
              {rack.colours.map((slug) => (
                <Chip key={slug} href={url({ c: slug })} on={slug === colour}>
                  {t(`colours.${slug}`)}
                </Chip>
              ))}
            </Options>
          ) : (
            <div>
              <p className="font-body text-[11px] uppercase tracking-widest text-stone">
                {d("colour")}
              </p>
              <p className="mt-2 font-body text-sm text-forest">{d("colourNone")}</p>
            </div>
          )}

          {rack && cartKey ? (
            <AddToCart
              /* Re-keyed on the chosen rack so the stepper reseeds from that
                 rack's own line. `inCart` is an initial value inside
                 `AddToCart`, not a synced one, so without this a stepper set to
                 3 on the 6 ft would carry that 3 over to the 4 ft. */
              key={cartKey}
              kind="rack"
              contentKey={cartKey}
              /* The per-line wholesale cap, and the only cap: a rack is built
                 to order, so there is no stock to run out of (SPEC §19). */
              max={MAX_UNITS_PER_LINE}
              inCart={inCart}
              labels={{
                quantity: d("quantity"),
                /* Its own strings rather than the tray page's: a rack is not a
                   pack, so "One pack fewer" would be wrong on this screen even
                   though the control is identical. */
                decrease: d("decrease"),
                increase: d("increase"),
                add: d("addToCart"),
                update: d("updateCart"),
                added: d("added"),
                updated: d("updated"),
                viewCart: d("viewCart"),
                /* Identical for every quantity: two racks are one build and one
                   delivery. */
                dispatch: Array.from({ length: MAX_UNITS_PER_LINE }, () => ready),
                totals: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
                  d("lineTotal", { total: (i + 1) * rack.price }),
                ),
                breakdowns: Array.from({ length: MAX_UNITS_PER_LINE }, (_, i) =>
                  d("lineBreakdown", { count: i + 1, price: rack.price }),
                ),
                note: t("leadNote"),
                errors: {
                  unitsInvalid: e("unitsInvalid"),
                  notSellable: e("notSellable"),
                  cartFull: e("cartFull"),
                  generic: e("generic"),
                },
              }}
            />
          ) : (
            /* Both axes offered, this pair not built — said out loud rather
               than quietly moving the customer to a different rack. */
            <p className="rounded-2xl border border-dashed border-forest/25 p-4 font-body text-sm text-stone">
              {d("noneForSize")}
            </p>
          )}
        </div>
      }
    />
  );
}

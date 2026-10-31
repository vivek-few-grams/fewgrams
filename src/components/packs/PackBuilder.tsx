"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { setCartQuantity } from "@/app/[locale]/cart/actions";
import { IDLE } from "@/lib/forms";
import { packCartKey } from "@/lib/packs/key";
import type { RackColour } from "@/lib/racks/colours";
import { placeholderProps, type Placeholder } from "@/lib/images/placeholder-props";

export type BuilderSeed = {
  key: string;
  name: string;
  image: { src: string; placeholder?: Placeholder } | null;
};
export type BuilderColour = { slug: RackColour; label: string; hex: string };

/**
 * Choosing what goes in a starter pack — SPEC §29.4: a rack colour when the
 * pack has racks, and exactly `seedCount` different seeds from its menu.
 *
 * The choice becomes the cart key (`packCartKey`), and the add goes through
 * the cart's own `setCartQuantity`, so the server checks the pack, the colour
 * and every seed against the menu exactly as it would any other add — this
 * component only stops an incomplete choice being sent.
 *
 * Seeds are checkboxes and colours radios, styled as tiles and chips: a
 * keyboard and a screen reader get the native controls, and a full set
 * disables the unticked seeds rather than silently ignoring a press.
 */
export function PackBuilder({
  packKey,
  seedCount,
  grams,
  colours,
  seeds,
  hintTwoRacks,
}: {
  packKey: string;
  seedCount: number;
  /** Grams of each seed — the cart's unit, printed in the hint. */
  grams: number;
  /** Empty for a pack with no rack. */
  colours: BuilderColour[];
  seeds: BuilderSeed[];
  /** True when the pack has more than one rack, for the colour hint. */
  hintTwoRacks: boolean;
}) {
  const t = useTranslations("shop.packs");
  const format = useFormatter();
  const [colour, setColour] = useState<RackColour | null>(colours[0]?.slug ?? null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* Set once the pack is in the cart, and never cleared: the page is on its
     way to checkout, and the button must not offer a second press while the
     next page loads. */
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();

  const full = chosen.length >= seedCount;
  const left = seedCount - chosen.length;
  const ready = left === 0 && (colours.length === 0 || colour !== null);

  const toggle = (key: string) => {
    setError(null);
    setChosen((now) =>
      now.includes(key) ? now.filter((k) => k !== key) : now.length < seedCount ? [...now, key] : now,
    );
  };

  /* Into the cart and straight on to checkout (the owner, 31 Oct 2026): a
     pack is the whole set-up, so there is nothing to keep shopping for. The
     whole cart goes to checkout, as from the cart page. */
  const buy = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("kind", "pack");
      fd.set("key", packCartKey(packKey, colours.length > 0 ? colour : null, chosen));
      fd.set("units", "1");
      const res = await setCartQuantity(IDLE, fd);
      if (res.status === "error") {
        setError(res.code);
        return;
      }
      setLeaving(true);
      router.push("/checkout");
    });

  const errorText = (code: string) =>
    ["notSellable", "soldOut", "overStock", "cartFull"].includes(code)
      ? t(`errors.${code}`)
      : t("errors.failed");

  return (
    <div className="space-y-10">
      {colours.length > 0 && (
        <fieldset>
          <legend className="font-display text-lg font-bold text-forest">{t("colourHeading")}</legend>
          <p className="mt-1 font-body text-sm text-stone">
            {hintTwoRacks ? t("colourHint") : t("colourHintOne")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {colours.map((c) => (
              <label
                key={c.slug}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 font-body text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest ${
                  colour === c.slug
                    ? "border-forest bg-forest text-cream"
                    : "border-forest/25 bg-cream text-forest hover:border-forest"
                }`}
              >
                <input
                  type="radio"
                  name="colour"
                  value={c.slug}
                  checked={colour === c.slug}
                  onChange={() => {
                    setError(null);
                    setColour(c.slug);
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="size-3.5 rounded-full ring-1 ring-forest/20"
                  style={{ backgroundColor: c.hex }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="font-display text-lg font-bold text-forest">{t("seedsHeading")}</legend>
        <p className="mt-1 font-body text-sm text-stone">{t("seedsHint", { count: seedCount, grams })}</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {seeds.map((s) => {
            /* The badge shows the order it was picked in — 1 to 4 — rather
               than a tick (the owner, 31 Oct 2026), so the count left is
               readable off the tiles themselves. Unticking one moves the
               later picks up a place. */
            const order = chosen.indexOf(s.key) + 1;
            const on = order > 0;
            const locked = full && !on;
            return (
              <li key={s.key}>
                <label
                  className={`relative flex h-full flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest ${
                    on
                      ? "border-forest bg-sage"
                      : locked
                        ? "border-forest/10 bg-cream opacity-50"
                        : "border-forest/15 bg-cream hover:border-forest"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => toggle(s.key)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border font-display text-xs font-bold tabular-nums ${
                      on ? "border-forest bg-forest text-cream" : "border-forest/30 bg-cream"
                    }`}
                  >
                    {on && format.number(order)}
                  </span>
                  <span className="relative size-20">
                    {s.image && (
                      <Image
                        src={s.image.src}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-contain"
                        {...placeholderProps(s.image.placeholder, "contain")}
                      />
                    )}
                  </span>
                  <span className="font-body text-sm font-semibold leading-snug text-forest">{s.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Sticky on a phone, where the seed list runs past the screen: the
          count and the button stay in reach while the list scrolls. The right
          padding keeps the button out from under the floating garden badge
          (`GardenBadge`), which is an icon on a phone and a pill from `sm`. */}
      <div className="sticky bottom-0 -mx-6 border-t border-forest/10 bg-cream/95 py-4 pl-6 pr-24 backdrop-blur-sm sm:pr-48 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <p role="status" className="font-body text-sm text-forest">
          {full ? t("full", { count: seedCount }) : t("chosen", { chosen: chosen.length, count: seedCount })}
        </p>
        <button
          type="button"
          onClick={buy}
          disabled={!ready || pending || leaving}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest px-6 py-3 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:bg-forest/40 md:w-auto"
        >
          <ShoppingBag size={16} aria-hidden />
          {pending || leaving
            ? t("buying")
            : colours.length > 0 && colour === null
              ? t("chooseColour")
              : left > 0
                ? t("chooseMore", { left })
                : t("buyNow")}
        </button>
        {error !== null && <p className="mt-2 font-body text-xs text-terracotta">{errorText(error)}</p>}
      </div>
    </div>
  );
}

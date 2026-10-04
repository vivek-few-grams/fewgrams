"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Bike, CalendarCheck, Gift, HandHeart, Loader2, Radar, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import { FREE_DELIVERY_FROM } from "@/lib/shipping/fee";
import type { DeliveryScan, ScanOption } from "./state";

export type PartnerName = "delhivery" | "ekart" | "shiprocket" | "velocity";

/**
 * The delivery-partner step — SPEC §7: once an address is accepted, every
 * connected courier is asked at once, the customer watches it happen, and
 * then sees the partner booked on each parcel — the cheapest — and when it
 * arrives.
 *
 * **No courier prices and no choice** (the owner, 4 Oct 2026, SPEC §7.4).
 * The customer pays one delivery figure — free from ₹999 of goods, otherwise
 * the couriers' cost capped at ₹79 — so a courier's own quote would be a
 * number they are not charged. Each parcel's row shows the customer's own
 * share on the right, and one line above the parcels says whether delivery
 * is free or how much more reaches it.
 *
 * **One booked partner per parcel.** An order ships from as many places as it
 * has pickups. With more than one, each is headed "Parcel n" and what is in
 * it — never where it comes from (CLAUDE.md, "No city name in customer
 * copy"). The own run, when there are greens, is parcel 1.
 *
 * Presentational only: `PayForm` runs the scan and posts the booked options.
 *
 * The scan shows each partner being asked, by name, because that is what is
 * happening — the rows are the couriers `scanDelivery` will call, not
 * decoration. It is held on screen for a moment even when the answers come
 * back fast (`PayForm`), so it reads as a comparison rather than a flicker.
 */
export function DeliveryPartners({
  n,
  locked,
  partners,
  scan,
  heading,
}: {
  n: number;
  /** No address accepted yet. */
  locked: boolean;
  /** Who will be asked, in order — for the scanning rows. */
  partners: PartnerName[];
  /** Null while scanning. */
  scan: DeliveryScan | null;
  /** The step heading, rendered by `PayForm` so the numbering matches. */
  heading: (props: { id: string; n: number; done: boolean; muted: boolean; children: ReactNode }) => ReactNode;
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const done = !locked && scan !== null && scan.status !== "none";
  /* Named "parcel 1, parcel 2" only when there is more than one — a single
     parcel is simply the delivery, as it always was. */
  const shipments = scan?.status === "ready" ? (scan.ownRun ? 1 : 0) + scan.parcels.length : 0;
  const split = shipments > 1;

  return (
    <section
      aria-labelledby="partner-heading"
      aria-busy={!locked && scan === null}
      className={`co-card co-card--leaf p-5 transition-opacity duration-300 md:p-6 ${locked ? "opacity-80" : ""}`}
    >
      {heading({ id: "partner-heading", n, done, muted: locked, children: t("partnerHeading") })}

      {locked ? (
        <p className="mt-2 font-body text-sm leading-relaxed text-stone">{t("partnerLocked")}</p>
      ) : scan === null ? (
        <div className="mt-4">
          <p className="flex items-center gap-2 font-body text-sm font-semibold text-forest">
            <Radar aria-hidden size={16} strokeWidth={1.75} className="motion-safe:animate-spin [animation-duration:2.4s]" />
            {t("scanning")}
          </p>
          <p className="mt-1 font-body text-xs text-stone">{t("scanningBody")}</p>
          <div aria-hidden className="scan-bar mt-4 h-1 overflow-hidden rounded-full bg-forest/10">
            <span className="block h-full w-1/3 rounded-full bg-sage" />
          </div>
          <ul className="mt-4 space-y-2">
            {partners.map((p, i) => (
              <li
                key={p}
                style={{ animationDelay: `${i * 140}ms` }}
                className="scan-row flex items-center justify-between gap-3 rounded-xl border border-forest/10 bg-cream/70 px-4 py-3"
              >
                <span className="flex items-center gap-3">
                  <CourierLogo courier={p} />
                  <span className="font-body text-sm font-semibold text-forest">{t(`partners.${p}`)}</span>
                </span>
                <span className="flex items-center gap-1.5 font-body text-xs text-stone">
                  <Loader2 aria-hidden size={14} strokeWidth={2} className="motion-safe:animate-spin" />
                  {t("checking")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : scan.status === "ready" ? (
        <div className="scan-reveal mt-3 space-y-4">
          {/* What the customer pays, and why (SPEC §7.4). No claim about what
              the product prices include — they are prices, nothing more. */}
          <p className="flex items-start gap-2.5 rounded-lg bg-sage/20 px-3 py-2.5 font-body text-xs leading-relaxed text-forest">
            {scan.fee.free ? (
              <Gift aria-hidden size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            ) : (
              <Truck aria-hidden size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            )}
            <span>
              {scan.fee.free
                ? t.rich("freeDeliveryNote", {
                    from: FREE_DELIVERY_FROM,
                    b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
                  })
                : t.rich("deliveryFeeNote", {
                    amount: scan.fee.total,
                    short: scan.fee.short,
                    from: FREE_DELIVERY_FROM,
                    b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
                  })}
            </span>
          </p>
          {scan.parcels.length > 0 && (
            /* When delivery is charged, say plainly what we promise about it
               (the owner, 4 Oct 2026). Only what the code keeps true: the
               cheapest partner is booked, and `customerDelivery` never
               charges more than the courier's quote or the cap. Never a claim
               about what the product prices do or do not include — the
               margins were raised to carry free delivery from the threshold,
               so "delivery is not in our prices" would be false. */
            <p className="flex items-start gap-2.5 px-1 font-body text-xs leading-relaxed text-stone">
              <HandHeart aria-hidden size={16} strokeWidth={1.75} className="mt-px shrink-0 text-forest/70" />
              <span>
                {scan.fee.free
                  ? t("scanned", { count: partners.length })
                  : t.rich("honestDelivery", {
                      count: partners.length,
                      b: (chunks) => <strong className="font-semibold text-forest">{chunks}</strong>,
                    })}
              </span>
            </p>
          )}
          {split && (
            <p className="rounded-lg bg-sage/20 px-3 py-2 font-body text-xs leading-relaxed text-forest">
              {t("splitNote", { count: shipments })}
            </p>
          )}
          {scan.ownRun && (
            <div>
              {split && <ParcelHeading n={1} items={scan.ownRun.items} />}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-l-4 border-forest/10 border-l-sage bg-cream px-4 py-3 shadow-sm">
                <span className="flex items-start gap-3">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-cream">
                    <Bike size={16} strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block font-body text-sm font-semibold text-forest">{t("ownRunTitle")}</span>
                    <span className="mt-0.5 block font-body text-xs leading-relaxed text-stone">{t("ownRunBody")}</span>
                  </span>
                </span>
                <span className="shrink-0 font-display text-base font-bold tabular-nums text-forest">
                  {scan.fee.free ? t("deliveryFree") : tc("subtotalValue", { amount: scan.ownRun.amount })}
                </span>
              </div>
            </div>
          )}
          {scan.parcels.map((p, i) => (
            <div key={p.id}>
              {split && <ParcelHeading n={i + 1 + (scan.ownRun ? 1 : 0)} items={p.items} />}
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-l-4 border-forest/10 border-l-sage bg-cream px-4 py-3 shadow-sm">
                <OptionBody option={p.option} charge={p.charge} free={scan.fee.free} />
              </div>
            </div>
          ))}
        </div>
      ) : scan.operatorNote ? (
        <div role="status" className="mt-4 rounded-xl bg-terracotta/[0.07] p-4 font-body text-sm text-terracotta">
          <p>{scan.operatorNote.body}</p>
          <Link
            href="/admin/delivery"
            className="mt-2 inline-block font-semibold underline underline-offset-4 transition-colors hover:text-forest"
          >
            {scan.operatorNote.cta}
          </Link>
        </div>
      ) : (
        <p role="status" className="mt-4 rounded-xl bg-terracotta/[0.07] p-4 font-body text-sm text-terracotta">
          {t("deliveryUnavailableBody")}
        </p>
      )}
    </section>
  );
}

type Option = ScanOption;

/** "Parcel 2 · Drainage cell mats, Shelf rack" — what is in it, never where
 *  it comes from. */
function ParcelHeading({ n, items }: { n: number; items: string[] }) {
  const t = useTranslations("checkout");
  return (
    <p className="mb-2 flex flex-wrap items-baseline gap-x-2 font-body text-xs">
      <span className="font-semibold uppercase tracking-wider text-forest">{t("parcel", { n })}</span>
      <span className="text-stone">{items.join(", ")}</span>
    </p>
  );
}

/**
 * Each courier's own icon, in a small circle where a generic truck used to be
 * (the owner, 26 Sep 2026: "can we use their real logo?", then "smaller
 * icons" — their app-icon marks rather than the wordmarks). The name stays as
 * text beside it, so the icon is decorative and `alt` is empty. Each is shown
 * as the square it is, not cropped to a circle.
 *
 * Built from each courier's own artwork (`public/couriers/README.md`). An
 * aggregator's row names the carrier it books ("Xpressbees via Velocity") but
 * shows the aggregator's icon, since the aggregator is who is booked. Used on
 * the scan's "checking" rows too, so each courier looks the same while it is
 * asked and once it has answered. A `Record`, so another courier is a type
 * error until it has one.
 */
const COURIER_ICON: Record<PartnerName, string> = {
  delhivery: "/couriers/delhivery-icon.png",
  ekart: "/couriers/ekart-icon.png",
  shiprocket: "/couriers/shiprocket-icon.png",
  velocity: "/couriers/velocity-icon.png",
};

function CourierLogo({ courier }: { courier: PartnerName }) {
  return (
    /* The courier's square app icon on its own, corners softened — no disc
       around it (the owner, 26 Sep 2026). */
    <Image
      src={COURIER_ICON[courier]}
      alt=""
      width={36}
      height={36}
      /* Served as the file itself, not through the optimiser: the icons are
         128 px already, and the optimiser's cache does not notice a file
         replaced in place — a re-cut icon kept showing the old crop. */
      unoptimized
      className="size-9 shrink-0 rounded-lg"
    />
  );
}

/**
 * The partner booked on a parcel: who and when on the left — the arrival
 * date in bold under the name — and what the customer pays for this parcel
 * on the right (the owner, 4 Oct 2026). That figure is the customer's share
 * of the delivery charge, not the courier's quote: the cheaper of the two
 * under ₹79, ₹79 when capped, "Free" from the free-delivery threshold
 * (SPEC §7.4).
 */
function OptionBody({ option: o, charge, free }: { option: Option; charge: number; free: boolean }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const localeTag = useLocale() === "kn" ? "kn-IN" : "en-IN";
  return (
    <>
      <CourierLogo courier={o.courier} />
      <span className="min-w-0 flex-1">
        <span className="block font-body text-sm font-semibold text-forest">
          {o.carrier ? t("via", { carrier: o.carrier, partner: t(`partners.${o.courier}`) }) : t(`partners.${o.courier}`)}
        </span>
        {o.arrives && (
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <CalendarCheck aria-hidden size={14} strokeWidth={1.75} className="text-forest/70" />
            <span className="font-body text-[10px] font-medium uppercase tracking-wider text-stone">
              {t("arrivesLabel")}
            </span>
            <span className="font-display text-sm font-bold text-forest">
              {formatDeliveryDate(fromIstDateISO(o.arrives), localeTag)}
            </span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-right font-display text-base font-bold tabular-nums text-forest">
        {free ? t("deliveryFree") : tc("subtotalValue", { amount: charge })}
      </span>
    </>
  );
}

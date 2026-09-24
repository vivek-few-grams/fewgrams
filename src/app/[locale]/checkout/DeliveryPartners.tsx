"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bike, CalendarCheck, Check, ChevronDown, Loader2, PackageCheck, Radar, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import type { DeliveryScan } from "./state";

export type PartnerName = "delhivery" | "ekart" | "shiprocket";

/**
 * The delivery-partner step — SPEC §7 (the owner, 24 Sep 2026): once an
 * address is accepted, every connected courier is asked at once, the
 * customer watches it happen, and then sees each option's price with the
 * cheapest picked and theirs to change.
 *
 * Presentational only: `PayForm` runs the scan and owns the choice, because
 * the choice sets the total and the pay form posts it.
 *
 * **Only the chosen option is shown**, with the rest one click away (the
 * owner, 24 Sep 2026): three rows of courier names read as a form to fill in,
 * where one price with "see other partners" reads as a decision already made
 * well. Picking another closes the list again.
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
  chosen,
  onChoose,
  heading,
}: {
  n: number;
  /** No address accepted yet. */
  locked: boolean;
  /** Who will be asked, in order — for the scanning rows. */
  partners: PartnerName[];
  /** Null while scanning. */
  scan: DeliveryScan | null;
  chosen: string | null;
  onChoose: (id: string) => void;
  /** The step heading, rendered by `PayForm` so the numbering matches. */
  heading: (props: { id: string; n: number; done: boolean; muted: boolean; children: ReactNode }) => ReactNode;
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const done = !locked && scan !== null && scan.status !== "none";

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
                  <span aria-hidden className="grid size-9 place-items-center rounded-full bg-forest text-cream">
                    <Truck size={16} strokeWidth={1.75} />
                  </span>
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
      ) : scan.status === "ownRun" ? (
        <div className="scan-reveal mt-4 flex items-center justify-between gap-3 rounded-xl border border-sage bg-sage/15 px-4 py-3">
          <span className="flex items-start gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-cream">
              <Bike size={16} strokeWidth={1.75} />
            </span>
            <span>
              <span className="block font-body text-sm font-semibold text-forest">{t("ownRunTitle")}</span>
              <span className="mt-0.5 block font-body text-xs leading-relaxed text-stone">{t("ownRunBody")}</span>
            </span>
          </span>
          <span className="shrink-0 font-body text-sm font-semibold tabular-nums text-forest">
            {tc("subtotalValue", { amount: scan.amount })}
          </span>
        </div>
      ) : scan.status === "options" ? (
        <OptionList options={scan.options} pickup={scan.pickup} chosen={chosen} onChoose={onChoose} />
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

type Option = Extract<DeliveryScan, { status: "options" }>["options"][number];

function OptionList({
  options,
  pickup,
  chosen,
  onChoose,
}: {
  options: Option[];
  pickup: string | null;
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const t = useTranslations("checkout");
  const localeTag = useLocale() === "kn" ? "kn-IN" : "en-IN";
  const [open, setOpen] = useState(false);
  const picked = options.find((o) => o.id === chosen) ?? options[0];
  const others = options.length - 1;

  const row = (o: Option, radio: boolean) => (
    <>
      {radio && (
        <input
          type="radio"
          name="deliveryChoice"
          value={o.id}
          checked={o.id === chosen}
          onChange={() => {
            onChoose(o.id);
            setOpen(false);
          }}
          className="size-4 shrink-0 accent-forest"
        />
      )}
      <OptionBody option={o} cheapest={o.id === options[0].id} />
    </>
  );

  return (
    <div className="scan-reveal mt-3">
      <p className="font-body text-xs leading-relaxed text-stone">{t("scanned", { count: options.length })}</p>
      {pickup && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-sage/20 px-3 py-2 font-body text-xs leading-relaxed text-forest">
          <PackageCheck aria-hidden size={14} strokeWidth={1.75} className="mt-px shrink-0" />
          <span>
            {t.rich("pickupNote", {
              date: formatDeliveryDate(fromIstDateISO(pickup), localeTag),
              b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            })}
          </span>
        </p>
      )}

      {open ? (
        <fieldset className="scan-reveal mt-3">
          <legend className="sr-only">{t("chooseOption")}</legend>
          <div className="space-y-2">
            {options.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-l-4 border-forest/10 border-l-transparent bg-cream/70 px-4 py-3 transition-colors hover:border-forest/25 has-[:checked]:border-l-sage has-[:checked]:bg-cream has-[:checked]:shadow-sm"
              >
                {row(o, true)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-l-4 border-forest/10 border-l-sage bg-cream px-4 py-3 shadow-sm">
          {row(picked, false)}
        </div>
      )}

      {others > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-body text-xs font-semibold text-forest transition-colors hover:bg-sage/30"
        >
          {open ? t("hideOthers") : t("showOthers", { count: others })}
          <ChevronDown
            aria-hidden
            size={14}
            strokeWidth={2}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

/**
 * One option: who, when, how much. **The date is as prominent as the price**
 * (the owner, 24 Sep 2026) — it sits in its own column in bold beside it,
 * not as a caption under the courier's name, because when it arrives is half
 * of what the customer is choosing.
 */
function OptionBody({ option: o, cheapest }: { option: Option; cheapest: boolean }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const localeTag = useLocale() === "kn" ? "kn-IN" : "en-IN";
  return (
    <>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-cream">
        <Truck size={16} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-body text-sm font-semibold text-forest">
          {o.carrier ? t("via", { carrier: o.carrier, partner: t(`partners.${o.courier}`) }) : t(`partners.${o.courier}`)}
        </span>
        {cheapest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-forest px-2 py-px font-body text-[10px] font-semibold uppercase tracking-wider text-cream">
            <Check aria-hidden size={11} strokeWidth={2.5} />
            {t("cheapest")}
          </span>
        )}
      </span>
      {o.arrives && (
        <span className="flex shrink-0 items-center gap-2 border-forest/10 sm:border-r sm:pr-4">
          <CalendarCheck aria-hidden size={16} strokeWidth={1.75} className="hidden text-forest/70 sm:block" />
          <span className="text-right sm:text-left">
            <span className="block font-body text-[10px] font-medium uppercase tracking-wider text-stone">
              {t("arrivesLabel")}
            </span>
            <span className="block font-display text-sm font-bold text-forest md:text-base">
              {formatDeliveryDate(fromIstDateISO(o.arrives), localeTag)}
            </span>
          </span>
        </span>
      )}
      <span className="w-16 shrink-0 text-right font-display text-base font-bold tabular-nums text-forest">
        {tc("subtotalValue", { amount: o.amount })}
      </span>
    </>
  );
}

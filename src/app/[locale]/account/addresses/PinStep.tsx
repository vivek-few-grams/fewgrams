"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Heart, Mail, MapPin, MessageCircle, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { mailtoHref, whatsappHref } from "@/lib/content/contact";
import type { PinPlace } from "@/lib/pincode/place";
import { lookupPinAction } from "../actions";

/** A PIN we deliver to, and what India Post says it is (null: unknown). */
export type CheckedPin = { pincode: string; place: PinPlace | null };

/**
 * The first step of every address: the PIN, on its own — the owner's layout,
 * 23 Sep 2026.
 *
 * Asked before anything else so that a customer outside the delivery area
 * hears it before typing a whole address, and so that district and state
 * arrive already filled. `lookupPinAction` checks the area first and only
 * then asks India Post. It decides nothing: `saveAddressAction` checks the
 * PIN again.
 *
 * Checked on the sixth digit, and on Check / Enter for anyone who pastes or
 * edits in the middle. Once passed it collapses to one line with "Change".
 */
export function PinStep({
  checked,
  onChecked,
  onChange,
  onCancel,
}: {
  checked: CheckedPin | null;
  onChecked: (c: CheckedPin) => void;
  /** Reopen the step; the parent drops the address form until it passes again. */
  onChange: () => void;
  /** Close the whole "add an address" box. The form's own Cancel only exists
   *  once a PIN has passed, so without this a PIN we do not serve left the
   *  customer in a box with no way out. */
  onCancel?: () => void;
}) {
  const t = useTranslations("account.addresses");
  const e = useTranslations("account.errors");
  const [pin, setPin] = useState(checked?.pincode ?? "");
  const [status, setStatus] = useState<"idle" | "checking" | "notServed" | "invalid" | "failed">("idle");
  /* The PIN an answer is for, so a slow reply for a PIN since changed is
     dropped instead of passing the wrong one. */
  const asked = useRef("");

  function check(value: string) {
    if (!/^\d{6}$/.test(value)) {
      setStatus("invalid");
      return;
    }
    asked.current = value;
    setStatus("checking");
    lookupPinAction(value)
      .then((r) => {
        if (asked.current !== value) return;
        if (r.status === "served") {
          setStatus("idle");
          onChecked({ pincode: value, place: r.place });
        } else setStatus(r.status);
      })
      .catch(() => asked.current === value && setStatus("failed"));
  }

  if (checked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest/10 bg-sage/25 px-4 py-3 md:px-5">
        <p className="flex items-center gap-3 font-body text-sm text-forest">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest text-cream">
            <Check size={14} strokeWidth={2.5} />
          </span>
          <span>
            <span className="font-semibold">{t("pinServed", { pincode: checked.pincode })}</span>
            {checked.place && (
              <span className="text-stone">
                {" · "}
                {checked.place.district}, {checked.place.state}
              </span>
            )}
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            asked.current = "";
            setStatus("idle");
            onChange();
          }}
          aria-label={t("pinChangeLabel")}
          className="rounded-full px-3 py-1.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-sage/40"
        >
          {t("pinChange")}
        </button>
      </div>
    );
  }

  /* Outside the area is not an input error, so it is not shown as one: it
     gets its own card below, with a way to order anyway. */
  const error =
    status === "invalid"
        ? e("pincodeInvalid")
        : status === "failed"
          ? t("pinCheckFailed")
          : null;

  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        check(pin);
      }}
    >
      <label htmlFor="pin-step" className="font-body text-xs font-medium uppercase tracking-wider text-stone">
        {t("pincode")}
      </label>
      <div className="mt-1.5 flex gap-3">
        <input
          id="pin-step"
          name="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={pin}
          aria-invalid={error ? true : undefined}
          aria-describedby="pin-step-note"
          onChange={(ev) => {
            const value = ev.target.value.replace(/\D/g, "").slice(0, 6);
            setPin(value);
            asked.current = "";
            if (value.length === 6) check(value);
            else setStatus("idle");
          }}
          className={`w-40 rounded-lg border bg-cream px-3 py-2.5 font-body text-sm tabular-nums tracking-widest outline-none placeholder:text-stone/50 focus:border-forest ${
            error ? "border-terracotta" : "border-forest/25"
          }`}
        />
        <button
          type="submit"
          disabled={status === "checking"}
          className="flex items-center gap-2 rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          <MapPin size={15} strokeWidth={1.75} />
          {status === "checking" ? t("pinChecking") : t("pinCheck")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-sm text-stone underline underline-offset-4 transition-colors hover:text-forest"
          >
            {t("cancel")}
          </button>
        )}
      </div>
      <p
        id="pin-step-note"
        role={error ? "alert" : undefined}
        className={`mt-1.5 font-body text-xs ${error ? "text-terracotta" : "text-stone/80"}`}
      >
        {error ?? t("pincodeHint")}
      </p>
      {status === "notServed" && (
        <OutsideArea
          pincode={pin}
          onClose={() => {
            asked.current = "";
            setPin("");
            setStatus("idle");
          }}
        />
      )}
    </form>
  );
}

/**
 * A PIN outside the delivery area — a thank-you and a way to order anyway,
 * not an error. The owner's wording, 24 Sep 2026: the team looks at each
 * request and delivers where it can.
 *
 * Inline rather than a modal: it appears where the customer was looking,
 * leaves the PIN field usable for a typo, and needs nothing dismissed. Both
 * buttons open with the PIN already in the message, so the team knows where
 * the request is from without asking. Numbers and inbox come from
 * `content/contact.json`; WhatsApp is offered only while it has one.
 */
function OutsideArea({ pincode, onClose }: { pincode: string; onClose: () => void }) {
  const t = useTranslations("account.addresses.outsideArea");
  const message = t("prefill", { pincode, brand: brand.name });
  const mailto = mailtoHref(t("subject", { pincode }), message);
  const whatsapp = whatsappHref(message);

  return (
    <div
      role="status"
      className="relative mt-4 rounded-2xl border border-terracotta/15 bg-gradient-to-br from-tan/35 via-sand to-terracotta/10 p-5 md:p-6"
    >
      {/* Closes the card and empties the PIN box, so the next move — a
          corrected PIN — needs nothing else cleared first. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-stone transition-colors hover:bg-cream hover:text-forest"
      >
        <X size={16} strokeWidth={2} />
      </button>
      <p className="flex items-center gap-3 pr-8 font-display text-base font-semibold text-forest">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-terracotta text-cream shadow-sm">
          <Heart size={16} strokeWidth={2} fill="currentColor" />
        </span>
        {t("heading", { pincode })}
      </p>
      <p className="mt-3 font-body text-sm leading-relaxed text-stone">{t("body")}</p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            <MessageCircle size={16} strokeWidth={1.75} />
            {t("whatsapp")}
          </a>
        )}
        <a
          href={mailto}
          className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-body text-sm font-semibold transition-colors ${
            whatsapp
              ? "border border-forest/20 bg-cream/70 text-forest hover:border-forest hover:bg-cream"
              : "bg-forest text-cream hover:bg-forest-deep"
          }`}
        >
          <Mail size={16} strokeWidth={1.75} />
          {t("email")}
        </a>
      </div>
      <p className="mt-4 font-body text-xs text-stone">{t("thanks", { brand: brand.name })}</p>
    </div>
  );
}

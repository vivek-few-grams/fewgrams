"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MapPin, X } from "lucide-react";
import { brand, isServiceable } from "@/lib/brand";
import { firstDeliveryDate, formatDeliveryDate } from "@/lib/delivery-date";

type Result = { pin: string; served: boolean } | null;

/**
 * Serviceability check — SPEC §18.3, still an OPEN DECISION.
 *
 * Placed as one quiet expanding line in the hero, which was the recommendation
 * but not yet confirmed. It is self-contained precisely so it can be moved to a
 * bar under the header or down to the bundle cards without touching anything
 * else.
 *
 * TODO: validate server-side against `PIN#<pincode>` in DynamoDB. SPEC §8 is
 * explicit that these rules must be enforced in server actions and not only in
 * the UI — this client check is convenience, never the gate.
 */
export function PinCheck() {
  const t = useTranslations("home.pinCheck");
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<Result>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return;
    setResult({ pin, served: isServiceable(pin) });
  };

  if (result?.served) {
    return (
      <p className="flex items-center gap-2 font-body text-sm text-forest">
        <Check size={16} strokeWidth={2} className="text-forest" />
        {t("served", { pin: result.pin })}{" "}
        <strong className="font-semibold">
          {formatDeliveryDate(firstDeliveryDate())}
        </strong>
        .
      </p>
    );
  }

  if (result && !result.served) {
    return (
      <div className="font-body text-sm">
        <p className="flex items-center gap-2 text-terracotta">
          <X size={16} strokeWidth={2} />
          {t("notServed", { pin: result.pin })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            className="w-56 rounded-full border border-forest/25 bg-cream px-4 py-2 text-sm outline-none placeholder:text-stone/60 focus:border-forest"
          />
          <button
            type="button"
            className="rounded-full bg-forest px-5 py-2 text-sm font-medium text-cream transition-colors hover:bg-forest-deep"
          >
            {t("notifyMe")}
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPin("");
            }}
            className="text-sm text-stone underline underline-offset-4 hover:text-forest"
          >
            {t("tryAnother")}
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 font-body text-sm text-stone transition-colors hover:text-forest"
      >
        <MapPin size={16} strokeWidth={1.5} className="text-forest" />
        {t("prompt", { city: brand.city })} ·{" "}
        <span className="text-forest underline underline-offset-4 group-hover:decoration-2">
          {t("checkYourPin")}
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder={t("inputPlaceholder")}
        aria-label={t("inputLabel")}
        className="w-32 rounded-full border border-forest/25 bg-cream px-4 py-2 font-body text-sm tabular-nums outline-none placeholder:text-stone/50 focus:border-forest"
      />
      <button
        type="submit"
        className="rounded-full bg-forest px-5 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-forest-deep"
      >
        {t("check")}
      </button>
    </form>
  );
}

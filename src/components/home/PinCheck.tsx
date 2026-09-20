"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MapPin, X } from "lucide-react";
import { brand, isServiceable } from "@/lib/brand";
import { firstDeliveryDate, formatDeliveryDate } from "@/lib/delivery-date";

type Result = { pin: string; served: boolean } | null;

/**
 * Serviceability check — SPEC §7. **Currently mounted nowhere.**
 *
 * It lived as one quiet expanding line in the hero until 16 Sep 2026, when the
 * §18.3 open decision was closed the other way: the check belongs in checkout,
 * before payment, and nowhere else. Kept rather than deleted because that is
 * where it is going, and because it is already self-contained — it owns its
 * own state and reads nothing from the page around it.
 *
 * It still lives under `components/home/` for now; move it when checkout
 * mounts it, so the folder does not lie about where it is used.
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

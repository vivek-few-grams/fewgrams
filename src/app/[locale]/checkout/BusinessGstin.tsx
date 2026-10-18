"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidGstin, normaliseGstin, OUR_GSTIN } from "@/lib/tax/gstin";

type Problem = "gstinMissing" | "gstinWrong" | "gstinOurs" | "nameMissing";

/**
 * "Buying for a business? Add GSTIN" — SPEC §26.2. Small text under the
 * total, because almost nobody needs it (the owner, 17 Oct 2026); pressing it
 * opens the GSTIN and business-name fields inside the pay form, so they post
 * with the order. `startCheckout` checks the GSTIN's check digit and refuses
 * a bad one rather than drop it, since the buyer is counting on the credit.
 *
 * Closing it again clears both fields, so a half-typed GSTIN is never sent.
 * Both are controlled, so a GSTIN refused at checkout stays on screen to be
 * corrected rather than being wiped by the form's reset.
 *
 * **Checked here first, in the site's own words** (the owner, 18 Oct 2026:
 * the browser's "Please match the format requested." bubble is neither our
 * design nor Kannada). So no `required` or `pattern`: the same check digit
 * the action runs is run here, the error sits under its field the way the
 * address form's do, and the pay form's submit is stopped until it passes.
 * The action still checks — this is for the customer, not the gate.
 */
export function BusinessGstin() {
  const t = useTranslations("checkout.business");
  const [open, setOpen] = useState(false);
  const [gstin, setGstin] = useState("");
  const [name, setName] = useState("");
  /* Errors show once a field has been left or the customer has pressed Pay,
     never while the first characters are going in. */
  const [touched, setTouched] = useState({ gstin: false, name: false });
  const ref = useRef<HTMLFieldSetElement>(null);
  const gstinRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const code = normaliseGstin(gstin);
  const gstinProblem: Problem | null = !code
    ? "gstinMissing"
    : !isValidGstin(code)
      ? "gstinWrong"
      : code === OUR_GSTIN
        ? "gstinOurs"
        : null;
  const nameProblem: Problem | null = name.trim() ? null : "nameMissing";
  /* A full fifteen characters is as good as leaving the field. */
  const showGstin = (touched.gstin || code.length === 15) && gstinProblem;
  const showName = touched.name && nameProblem;

  /* Stop the pay form's submit — its action is React's, and React skips an
     action whose submit event was already prevented. */
  useEffect(() => {
    const form = ref.current?.form;
    if (!open || !form || (!gstinProblem && !nameProblem)) return;
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      setTouched({ gstin: true, name: true });
      (gstinProblem ? gstinRef : nameRef).current?.focus();
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [open, gstinProblem, nameProblem]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start font-body text-xs text-stone underline underline-offset-4 transition-colors hover:text-forest"
      >
        {t("toggle")}
      </button>
    );
  }

  const field = (error: boolean) =>
    `mt-1 w-full rounded-xl border bg-white px-3 py-2 font-body text-sm text-forest outline-none transition-colors focus:border-forest ${
      error ? "border-terracotta" : "border-forest/25"
    }`;
  const message = (id: string, problem: Problem) => (
    <span id={id} role="alert" className="mt-1 block font-body text-xs text-terracotta">
      {t(problem)}
    </span>
  );
  return (
    <fieldset ref={ref} className="flex flex-col gap-3 rounded-xl border border-forest/15 p-4">
      <legend className="px-1 font-body text-xs font-semibold text-forest">{t("heading")}</legend>
      <label className="font-body text-xs text-stone">
        {t("gstin")}
        <input
          ref={gstinRef}
          name="gstin"
          maxLength={15}
          autoComplete="off"
          spellCheck={false}
          value={gstin}
          aria-invalid={showGstin ? true : undefined}
          aria-describedby={showGstin ? "gstin-error" : undefined}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          onBlur={() => setTouched((x) => ({ ...x, gstin: true }))}
          className={`${field(!!showGstin)} uppercase tracking-wider`}
        />
        {showGstin && message("gstin-error", showGstin)}
      </label>
      <label className="font-body text-xs text-stone">
        {t("name")}
        <input
          ref={nameRef}
          name="gstName"
          maxLength={120}
          autoComplete="organization"
          value={name}
          aria-invalid={showName ? true : undefined}
          aria-describedby={showName ? "gst-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((x) => ({ ...x, name: true }))}
          className={field(!!showName)}
        />
        {showName && message("gst-name-error", showName)}
      </label>
      <p className="font-body text-xs leading-relaxed text-stone">{t("note")}</p>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setGstin("");
          setName("");
          setTouched({ gstin: false, name: false });
        }}
        className="self-start font-body text-xs text-stone underline underline-offset-4 transition-colors hover:text-forest"
      >
        {t("remove")}
      </button>
    </fieldset>
  );
}

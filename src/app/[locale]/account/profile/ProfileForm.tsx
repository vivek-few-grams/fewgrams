"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, Field, FormMessage, PrimaryButton } from "../ui";
import { saveProfileAction } from "../actions";
import { IDLE, type FormState } from "@/lib/forms";

/**
 * The profile form.
 *
 * Client-side only for `useActionState`, which gives three things a plain
 * form action does not: the pending flag for the button, a result to render
 * without navigating, and a validation failure that does not blow up as an
 * error page.
 *
 * The action returns a message *key*; the wording is chosen here, from
 * `account.errors` (CLAUDE.md). That is what keeps a server action out of the
 * business of writing English.
 */
export function ProfileForm({
  email,
  name,
  phone,
}: {
  email: string;
  name: string;
  phone: string;
}) {
  const t = useTranslations("account.profile");
  const e = useTranslations("account.errors");
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveProfileAction,
    IDLE,
  );

  const errorFor = (field: string) =>
    state.status === "error" && state.field === field
      ? e(state.code, state.values ?? {})
      : undefined;

  return (
    <Card>
      <form action={action} className="space-y-5">
        <Field
          label={t("name")}
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={name}
          placeholder={t("namePlaceholder")}
          error={errorFor("name")}
        />

        <Field
          label={t("phone")}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone}
          placeholder={t("phonePlaceholder")}
          hint={t("phoneHint")}
          error={errorFor("phone")}
        />

        {/* Read-only rather than absent: people want to see which address
            they signed in with, and the hint explains why they cannot change
            it here. */}
        <Field
          label={t("email")}
          name="email"
          type="email"
          defaultValue={email}
          readOnly
          disabled
          hint={t("emailHint")}
        />

        <div className="flex flex-wrap items-center gap-4">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </PrimaryButton>

          {state.status === "saved" && <FormMessage tone="ok">{t("saved")}</FormMessage>}
          {/* An error with no field is one that belongs to the form as a
              whole, so it has nowhere else to appear. */}
          {state.status === "error" && !state.field && (
            <FormMessage tone="bad">{e(state.code, state.values ?? {})}</FormMessage>
          )}
        </div>
      </form>
    </Card>
  );
}

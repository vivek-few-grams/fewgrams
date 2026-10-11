import { getTranslations } from "next-intl/server";
import { redirect as nextRedirect } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { signIn } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { MAGIC_LINK_REFUSALS } from "@/lib/auth/magic-link-quota";

/** Google is optional so the whole flow can be built with no Google project. */
export const googleConfigured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

/**
 * The two ways in — Google, then an emailed link — SPEC §8.1. Shared by
 * `/login` and by `/checkout`'s first step, so a signed-out shopper signs in
 * without leaving checkout, and either way lands back on `callbackUrl`.
 *
 * `callbackUrl` must already be a path on this site (`safeCallbackPath`): it
 * is handed to Auth.js and, for a refused email link, to our own redirect.
 *
 * `emailExhausted` — out of email links for today: the email form goes and,
 * with Google available, so does the "or" between them.
 */
export async function SignInOptions({
  callbackUrl,
  locale,
  emailExhausted = false,
}: {
  callbackUrl: string;
  locale: string;
  emailExhausted?: boolean;
}) {
  const t = await getTranslations("auth.login");

  return (
    <div>
      {googleConfigured && (
        <>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full border border-forest/20 bg-white px-5 py-3 font-body text-sm font-semibold text-forest shadow-sm transition-colors hover:border-forest/40 hover:bg-sand"
            >
              <GoogleMark />
              {t("google")}
            </button>
          </form>

          {!emailExhausted && (
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-forest/15" />
              <span className="font-body text-[11px] uppercase tracking-widest text-stone">{t("or")}</span>
              <span className="h-px flex-1 bg-forest/15" />
            </div>
          )}
        </>
      )}

      {!(emailExhausted && googleConfigured) && (
        <form
          action={async (formData: FormData) => {
            "use server";
            const to = await signIn("email", {
              email: String(formData.get("email") ?? "").trim(),
              redirectTo: callbackUrl,
              redirect: false,
            });
            /* A refused link comes back as Auth.js's redirect to
               `/login?error=…` with no locale. Re-issue it through the
               locale-aware redirect so a Kannada visitor reads the reason in
               Kannada. */
            const refusal = new URL(to, "http://localhost").searchParams.get("error");
            if (refusal && (MAGIC_LINK_REFUSALS as readonly string[]).includes(refusal)) {
              redirect({
                href: { pathname: "/login", query: { error: refusal, callbackUrl } },
                locale,
              });
            }
            /* Anything else is Auth.js's own destination (the check-your-email
               page), followed exactly as `signIn` would have followed it. */
            nextRedirect(to);
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="font-body text-xs font-semibold text-forest">{t("emailLabel")}</span>
            <span className="relative mt-2 block">
              <Mail
                aria-hidden
                size={17}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone"
              />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                className="w-full rounded-xl border border-forest/20 bg-white py-3 pl-11 pr-4 font-body text-sm text-ink outline-none transition-shadow placeholder:text-stone/50 focus:border-forest focus:ring-4 focus:ring-sage/35"
              />
            </span>
          </label>
          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-full bg-forest px-5 py-3.5 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            {t("sendLink")}
            <ArrowRight
              aria-hidden
              size={16}
              strokeWidth={2}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </form>
      )}
    </div>
  );
}

/** Google's "G", in its own four colours, as its sign-in guidelines ask. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-[18px]" focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

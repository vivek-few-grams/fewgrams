import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { auth, signIn } from "@/auth";
import { brand } from "@/lib/brand";
import Image from "next/image";
import { ArrowRight, Mail, MapPin, Package, ShieldCheck, type LucideIcon } from "lucide-react";

/**
 * Sign in — SPEC §8.1. Google SSO + email magic link, no passwords.
 *
 * The Google button only renders when AUTH_GOOGLE_ID is set, so the whole
 * flow is usable with magic links alone and no Google project.
 *
 * One card in two halves (the owner asked for it to look better, 26 Sep
 * 2026): an illustration — a young girl peering at a sprout through a
 * magnifying glass, `public/brand/login-girl.webp`, the owner's pick; a new picture takes a new filename, because `next/image`
 * keeps serving the old one from its cache when a file is replaced in place —
 * with
 * what an account is for over its dark lower third on the left, the form on
 * the right. On a phone the picture shrinks to a banner over the form and
 * keeps only its heading.
 */
export const dynamic = "force-dynamic";

const googleConfigured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

const ERROR_KEYS = ["OAuthAccountNotLinked", "Verification", "AccessDenied"];

/** What an account is for, down the picture half. */
const PERKS: { key: "track" | "addresses" | "noPassword"; icon: LucideIcon }[] = [
  { key: "track", icon: Package },
  { key: "addresses", icon: MapPin },
  { key: "noPassword", icon: ShieldCheck },
];

export async function generateMetadata({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title") };
}

export default async function LoginPage({ params: routeParams, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await routeParams;
  setRequestLocale(locale);

  const t = await getTranslations("auth.login");
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const errorCode = typeof params.error === "string" ? params.error : undefined;

  // Already signed in — no reason to show a login form.
  const session = await auth();
  if (session?.user) redirect({ href: callbackUrl, locale });

  return (
    /* Full screen from `lg` (the owner, 26 Sep 2026): the two halves fill the
       window under the sticky header, 81px tall there. */
    <div className="relative bg-cream">
      <div className="lg:grid lg:min-h-[calc(100svh-81px)] lg:grid-cols-2">
        {/* The picture half: what an account is for. A short banner on a
            phone, the full left half from `lg`. */}
        <div className="relative h-60 overflow-hidden bg-forest md:h-72 lg:h-auto">
          <Image
            src="/brand/login-girl.webp"
            alt={t("panelAlt")}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-[center_22%] lg:object-[center_30%]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-forest-deep/85 from-5% via-forest-deep/30 via-20% to-transparent to-40%"
          />
          {/* The words stay inside the strip of dark leaves at the foot of the
              picture, so they never cover the girl or the trays (the owner,
              26 Sep 2026): one line of heading and a row of small pills. */}
          <div className="absolute inset-x-0 bottom-0 p-6 text-cream md:p-8 lg:px-10 lg:pb-9">
            <h2 className="max-w-md font-display text-2xl font-bold leading-tight tracking-tight md:text-3xl lg:max-w-none lg:text-[1.7rem]">
              {t("panelHeading")}
            </h2>
            <ul className="mt-4 hidden flex-wrap gap-2 lg:flex">
              {PERKS.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-full bg-forest-deep/75 py-1.5 pl-2 pr-3.5 font-body text-xs font-medium ring-1 ring-cream/15 backdrop-blur-sm"
                >
                  <Icon aria-hidden size={14} strokeWidth={1.75} className="text-sage" />
                  {t(`perks.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The form half. Two painted sprigs grow in from its corners, behind
            the form and from `md` only, where the half is wide enough for
            them to stay clear of the fields. */}
        <div className="relative isolate flex flex-col items-center justify-center overflow-hidden px-6 py-10 md:px-12 md:py-14 lg:px-16">
          <Image
            src="/brand/login-sprig-sage.webp"
            alt=""
            width={520}
            height={526}
            sizes="240px"
            className="pointer-events-none absolute -right-12 -top-10 -z-10 hidden w-44 rotate-[200deg] select-none opacity-90 md:block lg:w-60"
          />
          <Image
            src="/brand/login-sprig-chard.webp"
            alt=""
            width={520}
            height={525}
            sizes="224px"
            className="pointer-events-none absolute -bottom-12 -right-10 -z-10 hidden w-40 -rotate-12 select-none opacity-90 md:block lg:w-56"
          />
          <div className="flex w-full max-w-md flex-col">
            <p className="font-body text-[11px] font-semibold uppercase tracking-widest text-stone">{t("welcome")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-forest">
              {t("heading", { brand: brand.name })}
            </h1>
            <p className="mt-2 font-body text-sm text-stone">{t("body")}</p>

            {errorCode && (
              <p className="mt-6 rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 font-body text-sm text-ink">
                {ERROR_KEYS.includes(errorCode) ? t(`errors.${errorCode}`) : t("errors.default")}
              </p>
            )}

            <div className="mt-8">
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

                  <div className="my-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-forest/15" />
                    <span className="font-body text-[11px] uppercase tracking-widest text-stone">{t("or")}</span>
                    <span className="h-px flex-1 bg-forest/15" />
                  </div>
                </>
              )}

              <form
                action={async (formData: FormData) => {
                  "use server";
                  await signIn("email", {
                    email: String(formData.get("email") ?? "").trim(),
                    redirectTo: callbackUrl,
                  });
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
            </div>

            <p className="mt-6 flex items-start gap-3 rounded-xl bg-sand px-4 py-3 font-body text-xs leading-relaxed text-stone">
              <ShieldCheck aria-hidden size={16} strokeWidth={1.75} className="mt-px shrink-0 text-forest" />
              {t("passwordNote")}
            </p>

            {!googleConfigured && (
              <p className="mt-3 rounded-xl border border-dashed border-forest/20 px-4 py-3 font-body text-xs text-stone">
                <strong className="font-semibold text-forest">{t("devNoteTitle")}</strong> {t("devNoteBody")}
              </p>
            )}

            <Link
              href="/"
              className="mt-8 self-start font-body text-sm text-stone underline underline-offset-4 transition-colors hover:text-forest"
            >
              {t("backTo", { brand: brand.name })}
            </Link>
          </div>
        </div>
      </div>
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

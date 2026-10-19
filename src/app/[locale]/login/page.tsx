import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { MAGIC_LINK_REFUSALS } from "@/lib/auth/magic-link-quota";
import { brand } from "@/lib/brand";
import Image from "next/image";
import { placeholderFor } from "@/lib/images/placeholder";
import { placeholderProps } from "@/lib/images/placeholder-props";
import { MapPin, Package, ShieldCheck, type LucideIcon } from "lucide-react";
import { safeCallbackPath } from "@/lib/auth/callback-url";
import { SignInOptions, googleConfigured } from "@/components/auth/SignInOptions";

/**
 * Sign in — SPEC §8.1. Google SSO + email magic link, no passwords.
 *
 * The Google button only renders when AUTH_GOOGLE_ID is set, so the whole
 * flow is usable with magic links alone and no Google project.
 *
 * One card in two halves (the owner asked for it to look better, 26 Sep
 * 2026): an illustration — a young girl peering at a sprout through a
 * magnifying glass, `public/img/brand/login-girl.webp`, the owner's pick; a new picture takes a new filename, because `next/image`
 * keeps serving the old one from its cache when a file is replaced in place —
 * with
 * what an account is for over its dark lower third on the left, the form on
 * the right. On a phone the picture shrinks to a banner over the form and
 * keeps only its heading.
 */
export const dynamic = "force-dynamic";

const ERROR_KEYS = ["OAuthAccountNotLinked", "Verification", "AccessDenied", ...MAGIC_LINK_REFUSALS];

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
  const callbackUrl = safeCallbackPath(params.callbackUrl);
  const errorCode = typeof params.error === "string" ? params.error : undefined;

  /* Out of email links for today (src/lib/auth/magic-link-quota.ts): point
     at Google and take the email form away, rather than leave a button that
     can only fail. Without Google the form stays, and either way the message
     sends them to customer care. */
  const emailExhausted = errorCode === "EmailLimit";
  /* Out of links, the way forward is a person: the message links to /contact,
     which carries the care numbers from content/contact.json. */
  const careLink = (chunks: React.ReactNode) => (
    <Link
      href="/contact"
      className="font-semibold text-forest underline underline-offset-4 hover:text-forest-deep"
    >
      {chunks}
    </Link>
  );
  const errorMessage = !errorCode
    ? null
    : emailExhausted
      ? t.rich(googleConfigured ? "errors.EmailLimit" : "errors.EmailLimitNoGoogle", { link: careLink })
      : ERROR_KEYS.includes(errorCode)
        ? t(`errors.${errorCode}`)
        : t("errors.default");

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
            src="/img/brand/login-girl.webp"
            alt={t("panelAlt")}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-[center_22%] lg:object-[center_30%]"
            {...placeholderProps(placeholderFor("/img/brand/login-girl.webp"), "cover")}
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
            src="/img/brand/login-sprig-sage.webp"
            alt=""
            width={520}
            height={526}
            sizes="240px"
            className="pointer-events-none absolute -right-12 -top-10 -z-10 hidden w-44 rotate-[200deg] select-none opacity-90 md:block lg:w-60"
          />
          <Image
            src="/img/brand/login-sprig-chard.webp"
            alt=""
            width={520}
            height={525}
            sizes="224px"
            className="pointer-events-none absolute -bottom-12 -right-10 -z-10 hidden w-40 -rotate-12 select-none opacity-90 md:block lg:w-56"
          />
          <div className="flex w-full max-w-md flex-col">
            <p className="font-body text-[11px] font-semibold uppercase tracking-widest text-stone">
              {t("welcome")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-forest">
              {t("heading", { brand: brand.name })}
            </h1>
            <p className="mt-2 font-body text-sm text-stone">{t("body")}</p>

            {errorMessage && (
              <p
                role="alert"
                className="mt-6 rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 font-body text-sm text-ink"
              >
                {errorMessage}
              </p>
            )}

            <div className="mt-8">
              <SignInOptions callbackUrl={callbackUrl} locale={locale} emailExhausted={emailExhausted} />
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

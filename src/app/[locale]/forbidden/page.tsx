import { ShieldOff } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { currentActor } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/forbidden">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.forbidden" });
  return { title: t("title") };
}

/**
 * Signed in, but without sufficient rank. Deliberately distinct from /login:
 * telling a signed-in user to "sign in" is a dead end they cannot escape.
 */
export default async function ForbiddenPage({
  params,
}: PageProps<"/[locale]/forbidden">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("auth.forbidden");
  const actor = await currentActor();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-terracotta/10 text-terracotta">
        <ShieldOff size={22} strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-3 font-body text-sm leading-relaxed text-stone">
        {actor
          ? t("signedIn", { who: actor.email ?? "", role: actor.role })
          : t("anonymous")}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-full bg-forest px-5 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
        >
          {t("home")}
        </Link>
        <Link
          href="/account"
          className="rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest hover:bg-forest hover:text-cream"
        >
          {t("account")}
        </Link>
      </div>
    </div>
  );
}

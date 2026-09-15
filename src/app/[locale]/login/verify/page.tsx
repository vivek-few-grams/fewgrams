import { Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: PageProps<"/[locale]/login/verify">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.verify" });
  return { title: t("title") };
}

export default async function VerifyPage({
  params,
}: PageProps<"/[locale]/login/verify">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.verify");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-sage text-forest">
        <Mail size={22} strokeWidth={1.5} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-forest">
        {t("heading")}
      </h1>
      <p className="mt-3 font-body text-sm leading-relaxed text-stone">{t("body")}</p>
      <p className="mt-6 rounded-xl bg-sand px-4 py-3 font-body text-xs text-stone">
        <strong className="font-semibold text-forest">{t("devNoteTitle")}</strong>{" "}
        {t("devNoteBody")}
      </p>
      <Link
        href="/login"
        className="mt-8 font-body text-sm text-stone underline underline-offset-4 hover:text-forest"
      >
        {t("back")}
      </Link>
    </div>
  );
}

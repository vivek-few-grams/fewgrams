import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/guard";
import { getProfile } from "@/lib/repo/profile";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `/account/profile` — SPEC §12.
 *
 * The page reads; the form writes. Loading here rather than inside the client
 * component means the saved values are in the served HTML, so the fields are
 * filled before hydration instead of flashing empty.
 */
export default async function ProfilePage({
  params,
}: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("account.profile");
  const actor = await requireRole("customer");
  const profile = await getProfile(actor.userId);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-forest">{t("heading")}</h2>
        <p className="mt-2 font-body text-sm text-stone">{t("body")}</p>
      </div>

      <ProfileForm
        email={actor.email ?? ""}
        /* Falls back to the identity provider's name, so a Google customer
           sees their name already filled in rather than an empty box they
           have to retype. */
        name={profile?.name ?? actor.name ?? ""}
        phone={profile?.phone ?? ""}
      />
    </div>
  );
}

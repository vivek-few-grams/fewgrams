import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { localeAlternates } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { contact, mailtoHref, whatsappHref } from "@/lib/content/contact";

/**
 * /contact — WhatsApp and email, both from `content/contact.json`. No phone
 * card, by the owner's call (27 Sep 2026): messages only.
 *
 * No form. Nothing server-side sends mail except sign-in, and a form that
 * posts into nowhere is worse than a mailto. Each channel opens pre-filled
 * instead, so the message arrives with a subject.
 *
 * `?about=website` is the footer's "Like our website?" link (SPEC §18.1): the
 * same page, led by the B2B pitch, with the channels pre-filled for it.
 * `whatsapp: null` in the content file drops that card, as everywhere else.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help.contact" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: localeAlternates("/contact"),
  };
}

export default async function ContactPage({ params, searchParams }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("help.contact");
  const website = (await searchParams).about === "website";

  const subject = website ? t("website.subject") : t("email.subject");
  const message = website ? t("website.message") : t("whatsapp.message");
  const wa = whatsappHref(message);

  const channels = [
    wa && {
      key: "whatsapp",
      icon: MessageCircle,
      label: t("whatsapp.label"),
      body: t("whatsapp.body"),
      href: wa,
      action: t("whatsapp.action"),
      external: true,
    },
    {
      key: "email",
      icon: Mail,
      label: t("email.label"),
      body: t("email.body"),
      href: mailtoHref(subject, ""),
      action: contact.email,
      external: false,
    },
  ].filter((c) => !!c);

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-10 md:px-12 md:pb-24 md:pt-14">
      {website ? (
        <>
          <p className="font-body text-[11px] uppercase tracking-widest text-stone">{t("website.eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
            {t("website.heading")}
          </h1>
          <p className="mt-4 max-w-xl font-body text-sm leading-relaxed text-stone">{t("website.body")}</p>
        </>
      ) : (
        <>
          <p className="font-body text-[11px] uppercase tracking-widest text-stone">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
            {t("heading")}
          </h1>
          <p className="mt-4 max-w-xl font-body text-sm leading-relaxed text-stone">{t("intro")}</p>
        </>
      )}

      <ul className="mt-12 grid gap-5 md:grid-cols-2">
        {channels.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.key}>
              <a
                href={c.href}
                {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="group flex h-full flex-col rounded-2xl border border-forest/15 bg-cream p-6 transition-colors hover:border-forest"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-cream">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="mt-5 font-display text-lg font-bold text-forest">{c.label}</span>
                <span className="mt-1 font-body text-sm text-stone">{c.body}</span>
                <span className="mt-6 inline-flex items-center gap-2 break-all font-body text-sm font-medium text-forest transition-colors group-hover:text-forest-deep">
                  {c.action}
                  <ArrowRight
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {!website && (
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Tip
            heading={t("order.heading")}
            body={t("order.body")}
            href="/account/orders"
            link={t("order.link")}
          />
          <Tip heading={t("faq.heading")} body={t("faq.body")} href="/faq" link={t("faq.link")} />
        </div>
      )}
    </section>
  );
}

function Tip({ heading, body, href, link }: { heading: string; body: string; href: string; link: string }) {
  return (
    <div className="rounded-2xl bg-sand p-6">
      <h2 className="font-display text-base font-bold text-forest">{heading}</h2>
      <p className="mt-1 font-body text-sm text-stone">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-2 font-body text-sm font-medium text-forest underline underline-offset-4 transition-colors hover:text-forest-deep"
      >
        {link}
      </Link>
    </div>
  );
}

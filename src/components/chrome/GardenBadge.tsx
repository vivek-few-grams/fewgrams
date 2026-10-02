"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The way into the play garden from anywhere (the owner, 1 Oct 2026): a
 * floating badge, bottom-right, on every customer page — SPEC §25.
 *
 * **Not everywhere.** Hidden on the garden itself (it would link to where you
 * are), on the admin screens (not a customer surface), and on the cart and
 * checkout, where a playful button is the last thing that should pull
 * someone away from paying (the owner's call, 1 Oct 2026).
 *
 * Deliberately unlike the rest of the chrome so it gets noticed: a tray of
 * sprouts that sways now and then (`garden-badge-sway`, still under reduced
 * motion). Below `sm` it is the round mark alone, with its name as the
 * accessible label; from `sm` the name shows beside it. Forest ground, so the
 * icon circle is `bg-forest-deep text-cream` (CLAUDE.md).
 */
const HIDDEN = ["/garden", "/admin", "/cart", "/checkout"];

export function GardenBadge() {
  const t = useTranslations("garden.badge");
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <Link
      href="/garden"
      aria-label={t("aria")}
      className="garden-badge group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] flex items-center gap-2 rounded-full bg-forest p-1.5 text-cream shadow-[0_8px_24px_rgba(3,57,35,0.28)] transition-colors hover:bg-forest-deep sm:right-6 sm:pr-4 md:bottom-6"
    >
      <span className="grid size-11 place-items-center rounded-full bg-forest-deep text-cream">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="size-7">
          <g className="garden-badge-sprouts" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M10 21c0-3 0-5 -.5-7" />
            <path d="M16 21c0-4 0-6 0-9" />
            <path d="M22 21c0-3 0-5 .5-7" />
            <path d="M9.5 14c-2.2-.2-3.4-1.3-3.6-2.8 1.7-.4 3.2.4 3.6 2.8z" fill="#a8cf8e" stroke="none" />
            <path d="M9.5 14c1.7-1.2 3.3-1.1 4.2.1-1.2 1.1-2.8 1.2-4.2-.1z" fill="#a8cf8e" stroke="none" />
            <path d="M16 12c-2-.8-2.8-2.3-2.5-3.8 1.8 0 3 1.1 2.5 3.8z" fill="#a8cf8e" stroke="none" />
            <path d="M16 12c1.3-1.8 2.9-2.2 4.1-1.3-.8 1.5-2.3 2-4.1 1.3z" fill="#a8cf8e" stroke="none" />
            <path d="M22.5 14c-1.6-1.3-1.7-3-.8-4.2 1.5.9 1.9 2.4.8 4.2z" fill="#a8cf8e" stroke="none" />
            <path d="M22.5 14c2-.6 3.5 0 4 1.4-1.6.7-3.1.3-4-1.4z" fill="#a8cf8e" stroke="none" />
          </g>
          <path d="M5 21h22l-1.6 4.2a1.5 1.5 0 0 1-1.4 1H8a1.5 1.5 0 0 1-1.4-1L5 21z" fill="currentColor" />
        </svg>
      </span>
      <span className="hidden font-body text-sm font-semibold sm:inline">{t("label")}</span>
    </Link>
  );
}

import Link from "next/link";
import { brand } from "@/lib/brand";
import { NAV_CATEGORIES } from "@/lib/types";

export function Footer() {
  return (
    <footer className="mt-24 bg-forest text-cream">
      <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-12">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">{brand.name}</p>
            <p className="mt-3 max-w-xs font-body text-sm text-mint">{brand.subline}</p>
            <p className="mt-6 font-body text-sm text-mint/70">
              Saturdays across {brand.city}.
            </p>
          </div>

          <FooterCol title="Shop">
            {NAV_CATEGORIES.map((c) => (
              <FooterLink key={c.slug} href={`/${c.slug}`}>
                {c.label}
              </FooterLink>
            ))}
          </FooterCol>

          <FooterCol title="Fewgrams">
            <FooterLink href="/story">Our story</FooterLink>
            <FooterLink href="/how-we-grow">How we grow</FooterLink>
            <FooterLink href="/recipes">Recipes</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
          </FooterCol>

          {/* SPEC §12: these four are required by the payment gateway for
              merchant approval — not optional, and not to be left to the
              final phase. */}
          <FooterCol title="Legal">
            <FooterLink href="/terms">Terms</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/refund-policy">Refunds</FooterLink>
            <FooterLink href="/shipping-policy">Shipping</FooterLink>
          </FooterCol>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-cream/15 pt-7 font-body text-xs text-mint/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name} · {brand.email}
          </p>
          <p>
            {brand.fssai
              ? `FSSAI Lic. ${brand.fssai}`
              : "FSSAI registration in progress — required before launch"}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[11px] uppercase tracking-widest text-sage">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="font-body text-sm text-mint transition-colors hover:text-cream">
        {children}
      </Link>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag, User } from "lucide-react";
import { brand } from "@/lib/brand";
import { ProductsOverlay } from "./ProductsOverlay";
import type { Variety } from "@/lib/types";
import type { Role } from "@/lib/auth/roles";

/** Global header — SPEC §18.1. */
export function Header({
  varieties,
  actor,
}: {
  varieties: Variety[];
  /** Signed-in user, for rendering only. Authorisation is server-side via
   *  requireRole — SPEC §8. */
  actor: { email: string | null; role: Role } | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-[70] border-b border-forest/10 bg-cream/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-4 md:px-12">
          <Link
            href="/"
            className="font-display text-xl font-bold tracking-tight text-forest"
          >
            {brand.name}
          </Link>

          <nav className="ml-4 hidden items-center gap-7 md:flex">
            <button
              onClick={() => setMenuOpen(true)}
              className="font-body text-[13px] font-medium uppercase tracking-widest text-forest transition-colors hover:text-stone"
            >
              Products
            </button>
            <Link
              href="/#plans"
              className="font-body text-[13px] font-medium uppercase tracking-widest text-forest transition-colors hover:text-stone"
            >
              Plans
            </Link>
            <Link
              href="/how-we-grow"
              className="font-body text-[13px] font-medium uppercase tracking-widest text-forest transition-colors hover:text-stone"
            >
              How we grow
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4 md:gap-6">
            {/* Quiet B2B lead capture — SPEC §18.1 */}
            <Link
              href="/contact?about=website"
              className="group hidden font-body text-xs text-stone lg:block"
            >
              <span className="group-hover:hidden">like our website?</span>
              <span className="hidden text-forest group-hover:inline">
                we can build one for you →
              </span>
            </Link>

            {/* TODO: wire to next-intl locale routing (SPEC §4.4, Phase 1).
                Inert until then rather than linking to a route that 404s. */}
            <span
              className="hidden font-body text-xs text-stone sm:inline"
              aria-label="Language"
            >
              <span className="font-semibold text-forest">EN</span>
              <span className="mx-1 text-forest/30">|</span>
              <span className="font-kannada" aria-disabled="true">
                ಕನ್ನಡ
              </span>
            </span>

            <Link href="/cart" aria-label="Cart" className="relative text-forest hover:text-stone">
              <ShoppingBag size={20} strokeWidth={1.5} />
              <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-forest text-[10px] font-semibold text-cream">
                0
              </span>
            </Link>
            {actor?.role === "admin" && (
              <Link
                href="/admin"
                className="hidden rounded-full bg-sage px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-forest sm:block"
              >
                Admin
              </Link>
            )}
            <Link
              href={actor ? "/account" : "/login"}
              aria-label={actor ? "Account" : "Sign in"}
              title={actor?.email ?? "Sign in"}
              className="relative text-forest hover:text-stone"
            >
              <User size={20} strokeWidth={1.5} />
              {actor && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-sage ring-2 ring-cream" />
              )}
            </Link>

            <button
              onClick={() => setMenuOpen(true)}
              className="font-body text-[13px] font-medium uppercase tracking-widest text-forest md:hidden"
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <ProductsOverlay onClose={() => setMenuOpen(false)} varieties={varieties} />
      )}
    </>
  );
}

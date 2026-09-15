import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation — SPEC §4.4.
 *
 * **Import `Link` from here, never from `next/link`.** These wrappers carry
 * the active locale, so a Kannada visitor clicking a link stays in Kannada.
 * A raw `next/link` silently drops them back to English.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

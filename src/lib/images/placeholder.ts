import manifest from "./placeholders.json";
import type { Placeholder } from "./placeholder-props";

const PLACEHOLDERS: Record<string, { sha: string; url: string }> = manifest;

/**
 * The blurred stand-in for a photo under `public/` — see
 * `scripts/placeholders.mjs`. Undefined for an SVG or a photo the manifest
 * does not have (`placeholders.test.ts` fails on the second), and the photo
 * then loads on its bare panel as it always did.
 *
 * **Server code only.** The manifest holds every photo's preview, about
 * 76 KB, and a `"use client"` module importing this would ship all of it to
 * every visitor. A client component takes the resolved value as a prop — see
 * `Shot` in `Gallery.tsx`.
 */
export function placeholderFor(src: string): Placeholder | undefined {
  /* By path alone: a story plate carries `?v=<mtime>`, and
     NEXT_PUBLIC_IMAGE_BASE_URL may put a host in front of it. */
  const { pathname } = new URL(src, "http://placeholder.invalid");
  return PLACEHOLDERS[pathname]?.url as Placeholder | undefined;
}

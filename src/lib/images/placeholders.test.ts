import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { placeholderFor } from "./placeholder";
import manifest from "./placeholders.json";

/**
 * The blurred stand-ins in `placeholders.json` are built by a script, so the
 * one way they go wrong is someone adding or replacing a photo and not
 * re-running it. Nothing else notices: a missing stand-in just means the photo
 * pops in on a bare panel again, and a stale one blurs the old picture.
 */

const PUBLIC = path.join(process.cwd(), "public");
const SRC = path.join(process.cwd(), "src");
const PLACEHOLDERS: Record<string, { sha: string; url: string }> = manifest;
const FIX = "run `npm run images:placeholders` and commit src/lib/images/placeholders.json";

/** Must match `hashOf` in scripts/placeholders.mjs. */
function hashOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function files(dir: string, test: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full, test);
    return test.test(entry.name) ? [full] : [];
  });
}

const photos = files(path.join(PUBLIC, "img"), /\.(webp|jpe?g|png|avif)$/i).map((file) => ({
  src: `/${path.relative(PUBLIC, file).split(path.sep).join("/")}`,
  file,
}));

describe("photo placeholders", () => {
  it("finds the photos at all", () => {
    expect(photos.length).toBeGreaterThan(100);
  });

  it("has one for every photo under public/img, made from its current bytes", () => {
    const missing = photos.filter(({ src }) => !PLACEHOLDERS[src]).map(({ src }) => src);
    const stale = photos
      .filter(({ src, file }) => PLACEHOLDERS[src] && PLACEHOLDERS[src].sha !== hashOf(readFileSync(file)))
      .map(({ src }) => src);
    expect(missing, `no placeholder — ${FIX}`).toEqual([]);
    expect(stale, `photo replaced since its placeholder was made — ${FIX}`).toEqual([]);
  });

  it("keeps none for a photo that has gone", () => {
    const present = new Set(photos.map(({ src }) => src));
    expect(
      Object.keys(PLACEHOLDERS).filter((src) => !present.has(src)),
      FIX,
    ).toEqual([]);
  });

  /* Each is written into the page twice — the `<img>` style and the React
     payload — and a grid carries eighteen. */
  it("keeps each one a small inline WebP", () => {
    for (const [src, { url }] of Object.entries(PLACEHOLDERS)) {
      expect(url.startsWith("data:image/webp;base64,"), src).toBe(true);
      expect(url.length, src).toBeLessThan(1000);
    }
  });

  it("looks a photo up by its path, whatever host or query string it carries", () => {
    const src = photos[0]!.src;
    expect(placeholderFor(src)).toBe(PLACEHOLDERS[src]!.url);
    expect(placeholderFor(`${src}?v=1729000000000`)).toBe(PLACEHOLDERS[src]!.url);
    expect(placeholderFor(`https://images.example.com${src}`)).toBe(PLACEHOLDERS[src]!.url);
    expect(placeholderFor("/img/brand/fewgrams-logo.svg")).toBeUndefined();
  });

  /* The lookup imports the whole manifest; from a client module that would be
     every photo's preview in every visitor's JavaScript. */
  it("is never imported by a client module", () => {
    const offenders = files(SRC, /\.tsx?$/)
      .filter((file) => {
        const code = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(code) && /from ["']@\/lib\/images\/placeholder["']/.test(code);
      })
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});

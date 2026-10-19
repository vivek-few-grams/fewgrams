/**
 * Builds the blurred stand-in every photograph shows while it loads —
 * `src/lib/images/placeholders.json`, read by `src/lib/images/placeholder.ts`.
 *
 *   npm run images:placeholders
 *
 * Run it after adding or replacing anything under `public/img/`.
 * `placeholders.test.ts` fails until you do, naming the file.
 *
 * ## Why this exists
 *
 * The page's HTML arrives well before its photographs, so every card painted
 * as a bare coloured panel and the photo dropped in a beat later (the owner,
 * 18 Oct 2026: "the page is loaded before images are loaded"). With this the
 * card paints a soft, correctly coloured version of its own photo straight
 * away, and `next/image` swaps the real one in when it has decoded.
 *
 * ## Why at build time and committed
 *
 * The Lambda cannot make these at request time: `public/` lives in S3, not
 * in the deployment package, so there is no file to read. And it is a
 * committed file rather than a generated one so it is reviewed in a diff, and
 * so tests and type checks never depend on a step having run first.
 *
 * ## The recipe
 *
 * 24px on the long side, softened with a 0.8 sigma blur, WebP at quality 40
 * with alpha kept, so a transparent cut-out blurs as a punnet and not as a
 * rectangle. Compared on 19 Oct 2026 against 16px (blocky when stretched over
 * a 300px card) and 32px blurred (no better, a quarter bigger). Each one is
 * 200–530 characters of base64, and it is written into the page twice — the
 * `<img>` style and the React payload — so keep it this small.
 *
 * Unchanged files are skipped by a hash of their bytes, so a re-run takes a
 * second. sharp is the copy Next itself installs for image optimisation.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import sharp from "sharp";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(ROOT, "src/lib/images/placeholders.json");

/** Rasters only. An SVG scales without loss and is served `unoptimized`. */
const RASTER = /\.(webp|jpe?g|png|avif)$/i;

const SIZE = 24;
const SIGMA = 0.8;
const QUALITY = 40;

function photos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return photos(full);
    return RASTER.test(entry.name) ? [full] : [];
  });
}

/** Must match `hashOf` in placeholders.test.ts. */
function hashOf(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

let previous = {};
try {
  previous = JSON.parse(readFileSync(OUT, "utf8"));
} catch {}

const next = {};
let made = 0;
for (const file of photos(join(PUBLIC, "img")).sort()) {
  const src = `/${relative(PUBLIC, file).split(sep).join("/")}`;
  const bytes = readFileSync(file);
  const sha = hashOf(bytes);
  if (previous[src]?.sha === sha) {
    next[src] = previous[src];
    continue;
  }
  const tiny = await sharp(bytes)
    .rotate()
    .resize(SIZE, SIZE, { fit: "inside" })
    .blur(SIGMA)
    .webp({ quality: QUALITY, alphaQuality: QUALITY })
    .toBuffer();
  next[src] = { sha, url: `data:image/webp;base64,${tiny.toString("base64")}` };
  made++;
}

const dropped = Object.keys(previous).filter((src) => !(src in next)).length;
writeFileSync(OUT, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `${Object.keys(next).length} photos · ${made} made · ${dropped} dropped → ${relative(ROOT, OUT)}`,
);

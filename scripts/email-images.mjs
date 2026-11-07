/**
 * Builds the pictures the transactional emails show, as files an inbox can
 * read — `public/img/email/`, listed in `src/lib/notify/email-images.json`.
 *
 *   npm run images:email
 *
 * Run it after adding a product or replacing a product's photo, as for
 * `npm run images:placeholders`. `email-images.test.ts` fails until you do,
 * naming the product.
 *
 * ## Why not the site's own images
 *
 * - **Email clients read neither SVG nor, everywhere, WebP.** Gmail drops an
 *   SVG and Outlook on Windows will not show a WebP, so the logo becomes a
 *   PNG and every photo a JPEG.
 * - **A product photo is 300 KB at 1,500 px**, for a 64 px square in the
 *   email. A 128 px thumbnail is about 6 KB.
 * - **Not the image optimiser** (`/_next/image`): it answers through the
 *   Lambda, which sits behind the site password until launch, and it picks
 *   the format from the client's `Accept` header, which a mail proxy sets.
 *   Files under `public/` go to S3 and CloudFront serves them without the
 *   password (infra/lib/site-gate.ts), so these load in an inbox today.
 *
 * Each entry in the manifest carries `?v=<hash>` of the file it names: mail
 * proxies (Gmail's) cache an image by its URL, so a replaced photo needs a
 * new one.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const OUT = "img/email";
const MANIFEST = join(ROOT, "src/lib/notify/email-images.json");

/** 2× the 64 px the email shows. */
const THUMB = 128;
/** The cream every cut-out is laid on — the email's own ground. */
const CREAM = "#f7f2ea";

/** Content folder → image folder, for the kinds whose photos a content file names. */
const CATALOGUES = { varieties: "varieties", seeds: "seeds", trays: "trays", "grow-media": "grow-media" };

const files = {};

function hashOf(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 10);
}

async function write(rel, pipeline) {
  const abs = join(PUBLIC, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  await pipeline.toFile(abs);
  return `${rel}?v=${hashOf(abs)}`;
}

/** A square thumbnail: a photo cropped to its subject, a cut-out laid on cream. */
function thumb(src) {
  const cutout = src.endsWith("cutout.webp");
  const img = sharp(src);
  return (
    cutout
      ? img
          .resize(THUMB - 16, THUMB - 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .flatten({ background: CREAM })
      : img.resize(THUMB, THUMB, { fit: "cover", position: sharp.strategy.attention })
  ).jpeg({ quality: 78, mozjpeg: true });
}

/* The logo: the stacked lockup, 3× its 110 px in the email header. */
files.logo = await write(`${OUT}/logo.png`, sharp(join(PUBLIC, "img/brand/fewgrams-logo.svg")).resize({ width: 330 }).png());

/* The banner: trays of microgreens with a bowl of seed — every kind of order
   in one picture. 2× the 560 px card, cropped low so the trays stay in. */
files.banner = await write(
  `${OUT}/banner.jpg`,
  sharp(join(PUBLIC, "img/brand/hero-trays.jpg"))
    .resize(1120, 400, { fit: "cover", position: "bottom" })
    .jpeg({ quality: 72, mozjpeg: true, progressive: true }),
);

const thumbs = {};
const missing = [];
for (const [contentFolder, imgFolder] of Object.entries(CATALOGUES)) {
  for (const file of readdirSync(join(ROOT, "content", contentFolder)).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const key = file.slice(0, -".json".length);
    const { images = {} } = JSON.parse(readFileSync(join(ROOT, "content", contentFolder, file), "utf8"));
    /* The hero first — a photograph of the thing — then the cut-out, then
       anything in the gallery. A file the content names but nobody has
       made yet is passed over. */
    const candidates = [images.hero, images.cutout, ...(images.gallery ?? [])].filter(Boolean);
    const src = candidates.map((name) => join(PUBLIC, "img", imgFolder, key, name)).find(existsSync);
    if (!src) {
      missing.push(`${contentFolder}/${key}`);
      continue;
    }
    thumbs[`${contentFolder}/${key}`] = await write(`${OUT}/thumbs/${contentFolder}/${key}.jpg`, thumb(src));
  }
}
/* Racks have no content file: one picture per range, as on the cart. */
for (const range of readdirSync(join(PUBLIC, "img/racks")).sort()) {
  const src = join(PUBLIC, "img/racks", range, "cutout.webp");
  if (!existsSync(src)) continue;
  thumbs[`racks/${range}`] = await write(`${OUT}/thumbs/racks/${range}.jpg`, thumb(src));
}

writeFileSync(MANIFEST, `${JSON.stringify({ ...files, thumbs }, null, 2)}\n`);
console.log(`email images: logo, banner and ${Object.keys(thumbs).length} thumbnails → ${OUT}`);
if (missing.length) console.log(`no photo yet, so no thumbnail: ${missing.join(", ")}`);

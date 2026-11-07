import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./email-images.json";
import { EMAIL_BANNER, EMAIL_LOGO, lineThumb } from "./email-images";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const fileOf = (entry: string) => path.join(PUBLIC, entry.split("?")[0]);

/** Every product a content file describes, with the photos it names. */
function products(folder: string): { key: string; hasPhoto: boolean }[] {
  return readdirSync(path.join(ROOT, "content", folder))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const key = f.slice(0, -".json".length);
      const { images = {} } = JSON.parse(readFileSync(path.join(ROOT, "content", folder, f), "utf8"));
      const names = [images.hero, images.cutout, ...(images.gallery ?? [])].filter(Boolean) as string[];
      const imgFolder = folder;
      return { key, hasPhoto: names.some((n) => existsSync(path.join(PUBLIC, "img", imgFolder, key, n))) };
    });
}

describe("the emails' pictures (npm run images:email)", () => {
  it("has a thumbnail for every product that has a photo — run `npm run images:email` if not", () => {
    const missing: string[] = [];
    for (const folder of ["varieties", "seeds", "trays", "grow-media"]) {
      for (const p of products(folder)) {
        if (p.hasPhoto && !(manifest.thumbs as Record<string, string>)[`${folder}/${p.key}`]) {
          missing.push(`${folder}/${p.key}`);
        }
      }
    }
    expect(missing, `\nno email thumbnail for:\n  ${missing.join("\n  ")}\n`).toEqual([]);
  });

  it("names only files that exist, each tagged with the hash of what is there now", () => {
    const entries = [manifest.logo, manifest.banner, ...Object.values(manifest.thumbs)];
    const absent = entries.filter((e) => !existsSync(fileOf(e)));
    expect(absent).toEqual([]);
    for (const e of entries) expect(e).toMatch(/\?v=[0-9a-f]{10}$/);
  });

  it("points at the live site, in formats every inbox shows", () => {
    expect(EMAIL_LOGO).toMatch(/^https:\/\/fewgrams\.com\/img\/email\/logo\.png\?v=/);
    expect(EMAIL_BANNER).toMatch(/^https:\/\/fewgrams\.com\/img\/email\/banner\.jpg\?v=/);
    for (const e of Object.values(manifest.thumbs)) expect(e).toMatch(/\.jpg\?v=/);
  });

  it("shows a rack by its range and a pack by the rack inside it, or its trays", () => {
    expect(lineThumb({ kind: "rack", key: "rk-6f-5s-1.25x3-1.4-orange" })).toContain("/thumbs/racks/");
    expect(
      lineThumb({ kind: "pack", key: "x", parts: [{ kind: "tray", key: "tray-pair-food-grade", units: 2 }] }),
    ).toContain("/thumbs/trays/tray-pair-food-grade.jpg");
    expect(lineThumb({ kind: "seed", key: "no-such-seed" })).toBeNull();
  });
});

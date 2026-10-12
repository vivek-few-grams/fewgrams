import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `public/` holds one folder, `img/`, and nothing else.
 *
 * cdk-nextjs gives every top-level entry of `public/` its own CloudFront
 * behaviour, and CloudFront matches those before a request ever reaches the
 * Lambda. A folder named like a route therefore swallows the route: while the
 * seed photos lived in `public/seeds/`, `seeds/*` sent `/seeds/basil` to S3
 * and the page answered `NoSuchKey` (12 Oct 2026; `/shop/*` likewise). `img`
 * is not a route and never will be, so one prefix closes the whole class.
 */
const PUBLIC = path.join(process.cwd(), "public");
const APP = path.join(process.cwd(), "src", "app");

describe("public/", () => {
  it("has nothing at its top level but img/", async () => {
    const entries = (await readdir(PUBLIC)).filter((name) => !name.startsWith("."));
    expect(entries).toEqual(["img"]);
  });

  it("is not shadowed by a route segment named img", async () => {
    const routes = [
      ...(await readdir(APP)),
      ...(await readdir(path.join(APP, "[locale]"))),
    ];
    expect(routes).not.toContain("img");
  });
});

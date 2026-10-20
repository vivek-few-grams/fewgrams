import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_MESSAGES, pickMessages } from "./client-messages";

describe("pickMessages", () => {
  const all = {
    common: { nav: { shop: "Shop" } },
    home: { hero: { a: 1 }, trayPlay: { b: 2 } },
    plans: { c: 3 },
  };

  it("keeps whole namespaces and single branches, nothing else", () => {
    expect(pickMessages(all, ["common", "home.trayPlay"])).toEqual({
      common: { nav: { shop: "Shop" } },
      home: { trayPlay: { b: 2 } },
    });
  });

  it("skips a path that does not exist", () => {
    expect(pickMessages(all, ["nope", "home.nope"])).toEqual({});
  });
});

/**
 * Every namespace a customer-facing client component reads must be handed
 * over by some `CLIENT_MESSAGES` entry. Without this, a new client component
 * reading a namespace nobody provides renders its raw message keys in
 * production, and nothing else fails.
 */
describe("client components are covered", () => {
  const SRC = path.join(process.cwd(), "src");

  async function files(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === "admin" ? [] : files(full);
        return /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [full] : [];
      }),
    );
    return nested.flat();
  }

  it("every useTranslations namespace in a client component has an entry", async () => {
    const provided = Object.values(CLIENT_MESSAGES).flat();
    const covered = (ns: string) => provided.some((p) => ns === p || ns.startsWith(`${p}.`));
    const missing: string[] = [];
    let seen = 0;
    for (const file of await files(SRC)) {
      const src = await readFile(file, "utf8");
      if (!/^["']use client["']/m.test(src)) continue;
      for (const [, ns] of src.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)) {
        seen += 1;
        if (!covered(ns)) missing.push(`${path.relative(SRC, file)}: ${ns}`);
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});

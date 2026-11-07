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

  /* The check above passes as long as *some* entry provides a namespace, so
     checkout once rendered `account.errors.phoneInvalid` raw: the account's
     own entry had it, checkout's did not (31 Oct 2026). This one follows the
     imports out of each `<ClientMessages entry>` and holds every client
     component it reaches to that entry. A component can sit outside the
     wrapper on the same page and read the chrome instead, which a static walk
     cannot tell apart — so the chrome counts too. */
  it("every client component under a ClientMessages entry is covered by that entry", async () => {
    const all = await files(SRC);
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/")
        ? path.join(SRC, spec.slice(2))
        : spec.startsWith(".")
          ? path.resolve(path.dirname(from), spec)
          : null;
      if (!base) return null;
      const tries = [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")];
      return tries.find((t) => all.includes(t)) ?? null;
    };
    const source = new Map<string, string>();
    const read = async (f: string) => source.get(f) ?? source.set(f, await readFile(f, "utf8")).get(f)!;

    const missing: string[] = [];
    let wrappers = 0;
    for (const file of all) {
      const src = await read(file);
      for (const [, entry] of src.matchAll(/<ClientMessages\s+entry="(\w+)"/g)) {
        wrappers += 1;
        const provided = [...CLIENT_MESSAGES[entry as keyof typeof CLIENT_MESSAGES], ...CLIENT_MESSAGES.chrome];
        const covered = (ns: string) => provided.some((p) => ns === p || ns.startsWith(`${p}.`));
        /* A layout wraps every page beneath it; a page wraps only itself. */
        const roots = file.endsWith("layout.tsx")
          ? all.filter((f) => f.startsWith(path.dirname(file) + path.sep))
          : [file];
        const seen = new Set<string>();
        const queue = [...roots];
        while (queue.length > 0) {
          const f = queue.pop()!;
          if (seen.has(f)) continue;
          seen.add(f);
          const s = await read(f);
          if (/^["']use client["']/m.test(s)) {
            for (const [, ns] of s.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)) {
              if (!covered(ns)) missing.push(`${entry} → ${path.relative(SRC, f)}: ${ns}`);
            }
          }
          for (const [, spec] of s.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
            const next = resolve(f, spec);
            if (next) queue.push(next);
          }
        }
      }
    }
    expect(wrappers).toBeGreaterThan(5);
    expect([...new Set(missing)]).toEqual([]);
  });
});

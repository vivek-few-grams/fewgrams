import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "./routing";

/**
 * Every message file parses, `admin.json` included. The parity test skips
 * `admin` (English only, by design), so nothing else read it: an edit that
 * left it with a doubled comma passed the whole suite and would have broken
 * every admin page (8 Nov 2026).
 */
describe("message files", () => {
  for (const locale of routing.locales) {
    it(`are valid JSON for ${locale}`, async () => {
      const dir = path.join(process.cwd(), "messages", locale);
      const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const raw = await readFile(path.join(dir, f), "utf8");
        expect(() => JSON.parse(raw), `${locale}/${f}`).not.toThrow();
      }
    });
  }
});

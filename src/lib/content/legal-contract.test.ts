import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkLegalDoc } from "./legal-contract";
import { gstinStateCode, isValidGstin } from "@/lib/tax/gstin";
import { HOME_STATE } from "@/lib/tax/states";
import { BUSINESS, getLegalDoc } from "./legal";

/** The legal-page guard. One row per document as each is written. */
const DOCS = ["terms", "privacy", "refunds", "shipping"] as const;

const load = async (name: string) =>
  JSON.parse(await readFile(path.join(process.cwd(), "content", "legal", `${name}.json`), "utf8")) as Record<
    string,
    unknown
  >;

describe.each(DOCS)("content/legal/%s.json", (name) => {
  it("conforms, and reports every fault at once", async () => {
    const problems = checkLegalDoc(name, await load(name));
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("writes every Kannada paragraph in Kannada", async () => {
    const KANNADA = /[ಀ-೿]/;
    const offenders: string[] = [];
    const walk = (value: unknown, at: string) => {
      if (typeof value === "string") {
        const words = value.replace(/\{\w+\}/g, "").replace(/[^\p{L}]/gu, "");
        if (words.length > 0 && !KANNADA.test(value)) offenders.push(`kn.${at}`);
      } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${at}[${i}]`));
      else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k);
      }
    };
    walk((await load(name)).kn, "");
    expect(offenders).toEqual([]);
  });

  it("renders with every token filled, in both languages", async () => {
    for (const locale of ["en", "kn"]) {
      const doc = await getLegalDoc(name, locale, "FSSAI-TEST");
      const text = [...doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.body])].join("\n");
      expect(text).not.toMatch(/\{\w+\}/);
      /* The E-Commerce Rules and the SPDI Rules require the grievance officer
         to be named; the refund and shipping pages point to the Terms. */
      if (name === "terms" || name === "privacy") expect(text).toContain(BUSINESS.grievanceOfficer);
      if (name === "terms") expect(text).toContain(BUSINESS.gstin);
    }
  });
});

describe("content/legal/business.json", () => {
  /* A mistyped GSTIN goes onto every invoice and every courier booking, and
     a buyer's credit is lost against it. The check digit catches a slip. */
  it("holds a valid GSTIN, issued in Karnataka where the address is", () => {
    expect(isValidGstin(BUSINESS.gstin)).toBe(true);
    expect(gstinStateCode(BUSINESS.gstin)).toBe(HOME_STATE.code);
    expect(BUSINESS.address).toContain(HOME_STATE.name);
  });
});

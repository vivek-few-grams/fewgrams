import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkLegalDoc } from "./legal-contract";
import { BUSINESS, getLegalDoc } from "./legal";

/** The legal-page guard. One row per document as each is written. */
const DOCS = ["terms", "privacy", "refunds", "shipping"] as const;

const load = async (name: string) =>
  JSON.parse(
    await readFile(path.join(process.cwd(), "content", "legal", `${name}.json`), "utf8"),
  ) as Record<string, unknown>;

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
    }
  });
});

describe("checkLegalDoc", () => {
  const valid = () => ({
    updated: "2026-09-27",
    sections: ["about"],
    en: { intro: ["Hi {tradingName}."], sections: { about: { heading: "About", body: ["At {address}."] } } },
    kn: { intro: ["ನಮಸ್ಕಾರ."], sections: { about: { heading: "ಕುರಿತು", body: ["{address}."] } } },
  });

  it("accepts the minimal file", () => {
    expect(checkLegalDoc("t", valid())).toEqual([]);
  });

  it("refuses an unknown token, a price and a missing translation", () => {
    const typo = valid();
    typo.en.sections.about.body = ["At {adress}."];
    expect(checkLegalDoc("t", typo)).toEqual(["t: en.sections.about.body[0] uses unknown token {adress}"]);

    const price = valid();
    price.en.sections.about.body = ["Delivery is ₹200."];
    expect(checkLegalDoc("t", price)).toHaveLength(1);

    const gap = valid();
    delete (gap.kn.sections as Record<string, unknown>).about;
    expect(checkLegalDoc("t", gap)).toEqual(["t: kn.sections.about is required"]);
  });
});

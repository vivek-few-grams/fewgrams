import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkFaqFile } from "./faq-contract";
import { getFaq } from "./faq";

/** The FAQ guard — same job as the storybook's. */
const FILE = path.join(process.cwd(), "content", "faq.json");

const load = async () => JSON.parse(await readFile(FILE, "utf8")) as Record<string, unknown>;

const valid = () => ({
  sections: [{ key: "delivery", questions: ["where-deliver"] }],
  en: {
    sections: { delivery: "Delivery" },
    questions: { "where-deliver": { question: "Where?", answer: ["Selected areas."] } },
  },
  kn: {
    sections: { delivery: "ಡೆಲಿವರಿ" },
    questions: { "where-deliver": { question: "ಎಲ್ಲಿ?", answer: ["ಆಯ್ದ ಪ್ರದೇಶಗಳು."] } },
  },
});

describe("faq content", () => {
  it("conforms, and reports every fault at once", async () => {
    const problems = checkFaqFile(await load());
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("writes every Kannada string in Kannada", async () => {
    const KANNADA = /[ಀ-೿]/;
    const offenders: string[] = [];
    const walk = (value: unknown, at: string) => {
      if (typeof value === "string") {
        if (value.replace(/[^\p{L}]/gu, "").length > 0 && !KANNADA.test(value)) {
          offenders.push(`kn.${at} = ${JSON.stringify(value.slice(0, 50))}`);
        }
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${at}[${i}]`));
      } else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) walk(v, at ? `${at}.${k}` : k);
      }
    };
    walk((await load()).kn, "");
    expect(offenders, `\nnot translated:\n  ${offenders.join("\n  ")}\n`).toEqual([]);
  });

  it("renders every question in both languages, in the file's order", async () => {
    const raw = (await load()) as { sections: { questions: string[] }[] };
    const keys = raw.sections.flatMap((s) => s.questions);
    for (const locale of ["en", "kn"]) {
      const faq = await getFaq(locale);
      expect(faq.flatMap((s) => s.questions.map((q) => q.key))).toEqual(keys);
    }
    const [en, kn] = await Promise.all([getFaq("en"), getFaq("kn")]);
    expect(kn[0].questions[0].question).not.toBe(en[0].questions[0].question);
  });

  it("accepts the minimal valid file", () => {
    expect(checkFaqFile(valid())).toEqual([]);
  });

  it("refuses a price, a day count and the city, in either script", () => {
    const cases: [string, string][] = [
      ["en", "Delivery is ₹200."],
      ["en", "It arrives in 7 days."],
      ["en", "It arrives in seven days."],
      ["en", "We deliver across Bengaluru."],
      ["kn", "ಶುಲ್ಕ ೨೦೦ ರೂ"],
      ["kn", "೭ ದಿನ"],
      ["kn", "ಬೆಂಗಳೂರಿನಲ್ಲಿ"],
    ];
    for (const [locale, text] of cases) {
      const file = valid();
      file[locale as "en" | "kn"].questions["where-deliver"].answer = [text];
      expect(checkFaqFile(file), text).toHaveLength(1);
    }
    const ok = valid();
    ok.en.questions["where-deliver"].answer = ["Packed the next day, delivered every Saturday."];
    expect(checkFaqFile(ok)).toEqual([]);
  });

  it("refuses a missing translation, an orphan and a duplicate key", () => {
    const missing = valid();
    delete (missing.kn.questions as Record<string, unknown>)["where-deliver"];
    expect(checkFaqFile(missing)).toContain("kn.questions.where-deliver is required");

    const orphan = valid();
    (orphan.en.questions as Record<string, unknown>).gone = { question: "?", answer: ["."] };
    expect(checkFaqFile(orphan)).toContain("en.questions.gone is not in any section");

    const dup = valid();
    dup.sections.push({ key: "more", questions: ["where-deliver"] });
    expect(checkFaqFile(dup).some((p) => p.includes('"where-deliver" is already used'))).toBe(true);
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The FAQ — `content/faq.json`, editorial copy per SPEC §4.3.
 *
 * One file, like the storybook and for the same reason: it is an order, not a
 * set. The running order of sections and questions is written once, in
 * `sections`; the words sit under `en` / `kn` by key. Shape and copy rules
 * (no price, no day count, no city name) are enforced by `faq-contract.ts`.
 *
 * No DynamoDB and no admin screen: an answer that needs a number the business
 * tunes — a fee, a grow window — says where the customer will see it instead
 * of restating it.
 */

export type FaqEntry = { question: string; answer: string[] };

type FaqText = {
  sections: Record<string, string>;
  questions: Record<string, FaqEntry>;
};

export type FaqFile = {
  sections: { key: string; questions: string[] }[];
  en: FaqText;
  kn?: Partial<{
    sections: Record<string, string>;
    questions: Record<string, Partial<FaqEntry>>;
  }>;
};

export type FaqSection = {
  key: string;
  title: string;
  questions: (FaqEntry & { key: string })[];
};

const FAQ_PATH = path.join(process.cwd(), "content", "faq.json");

const readFaq = cache(
  async (): Promise<FaqFile> => JSON.parse(await readFile(FAQ_PATH, "utf8")) as FaqFile,
);

/** The FAQ in reading order, each string falling back to English on its own
 *  (SPEC §4.4) — the contract test is what keeps that fallback unused. */
export async function getFaq(locale: string): Promise<FaqSection[]> {
  const file = await readFaq();
  const lang: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const local = lang === "kn" ? file.kn : undefined;

  return file.sections.map((section) => ({
    key: section.key,
    title: local?.sections?.[section.key] || file.en.sections[section.key],
    questions: section.questions.map((key) => {
      const en = file.en.questions[key];
      const kn = local?.questions?.[key];
      return {
        key,
        question: kn?.question || en.question,
        answer: kn?.answer?.length ? kn.answer : en.answer,
      };
    }),
  }));
}

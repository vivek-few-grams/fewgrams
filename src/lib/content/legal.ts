import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import business from "../../../content/legal/business.json";
import { contact, contactPhoneDisplay } from "./contact";
import type { LegalToken } from "./legal-contract";

/**
 * Legal pages — `content/legal/<doc>.json`, shape in `legal-contract.ts`.
 *
 * Who the seller is lives once, in `content/legal/business.json`, and the
 * care email and phone in `content/contact.json`; the documents name them by
 * token and this fills them in. So a new address or number is one edit that
 * every legal page picks up.
 */

export type LegalDocName = "terms" | "privacy" | "refunds" | "shipping";

export type LegalSection = { key: string; heading: string; body: string[] };

export type LegalDoc = {
  /** `YYYY-MM-DD`, from the file. */
  updated: string;
  intro: string[];
  sections: LegalSection[];
};

type Block = {
  intro: string[];
  sections: Record<string, { heading: string; body: string[] }>;
};

type LegalFile = { updated: string; sections: string[]; en: Block; kn?: Partial<Block> };

export type Business = {
  tradingName: string;
  partners: string[];
  grievanceOfficer: string;
  address: string;
};

export const BUSINESS: Business = business;

const read = cache(
  async (name: LegalDocName): Promise<LegalFile> =>
    JSON.parse(
      await readFile(path.join(process.cwd(), "content", "legal", `${name}.json`), "utf8"),
    ) as LegalFile,
);

/**
 * `fssai` is the one token that is a sentence rather than a fact until the
 * licence exists, so the caller passes it already translated.
 */
export function legalTokens(fssai: string, locale: Locale): Record<LegalToken, string> {
  const and = new Intl.ListFormat(locale === "kn" ? "kn-IN" : "en-IN", { type: "conjunction" });
  return {
    tradingName: BUSINESS.tradingName,
    partners: and.format(BUSINESS.partners),
    grievanceOfficer: BUSINESS.grievanceOfficer,
    address: BUSINESS.address,
    email: contact.email,
    phone: `+91 ${contactPhoneDisplay}`,
    fssai,
  };
}

export function fillTokens(text: string, tokens: Record<LegalToken, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in tokens ? tokens[k as LegalToken] : m,
  );
}

export async function getLegalDoc(
  name: LegalDocName,
  locale: string,
  fssai: string,
): Promise<LegalDoc> {
  const file = await read(name);
  const lang: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const local = lang === "kn" ? file.kn : undefined;
  const tokens = legalTokens(fssai, lang);
  const fill = (ps: string[]) => ps.map((p) => fillTokens(p, tokens));

  return {
    updated: file.updated,
    intro: fill(local?.intro?.length ? local.intro : file.en.intro),
    sections: file.sections.map((key) => {
      const en = file.en.sections[key];
      const kn = local?.sections?.[key];
      return {
        key,
        heading: fillTokens(kn?.heading || en.heading, tokens),
        body: fill(kn?.body?.length ? kn.body : en.body),
      };
    }),
  };
}

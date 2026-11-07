import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import type { EmailMessage, NotificationProvider } from "./provider";

const h = vi.hoisted(() => ({
  provider: null as NotificationProvider | null,
  getTranslations: null as unknown as (o: { locale: string; namespace: string }) => Promise<unknown>,
}));
vi.mock("next-intl/server", () => ({ getTranslations: (o: never) => h.getTranslations(o) }));
vi.mock("@/lib/notify", () => ({ notificationProvider: () => h.provider }));

const { subscriptionEmail, sendSubscriptionConfirmation } = await import("./subscription-email");
type Translate = import("./order-email").Translate;

/** The real catalogue, one locale, not merged over English. */
function catalogue(locale: "en" | "kn", namespace: string): Translate {
  const ns = namespace.split(".")[0];
  const messages = { [ns]: JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, `${ns}.json`), "utf8")) };
  return createTranslator({
    locale,
    messages,
    namespace,
    timeZone: "Asia/Kolkata",
    onError: (e: Error) => {
      throw e;
    },
  } as never) as unknown as Translate;
}
const copy = (locale: "en" | "kn") => ({ locale, t: catalogue(locale, "email.subscription") });

const sub = {
  id: "FS0123456789",
  email: "asha@example.in",
  locale: "en",
  invoiceNo: "FG/2627/00043",
  lines: [
    { planId: "p1", planKey: "essential", name: "Everyday Essentials", boxes: 2, monthlyPrice: 1199, lineTotal: 2398, gramsPerBox: 100 },
    { planId: "p2", planKey: "exotic", name: "Rare & Exotic", boxes: 1, monthlyPrice: 1799, lineTotal: 1799, gramsPerBox: 100 },
  ],
  total: 4197,
  /* Out of order on purpose: the email lists them by date. */
  deliveries: [
    { date: "2026-11-21", week: 3 },
    { date: "2026-11-07", week: 1 },
    { date: "2026-11-14", week: 2 },
    { date: "2026-11-28", week: 4 },
  ],
  address: { label: "Home", recipient: "Asha Rao", phone: "9876543210", line1: "12, 3rd Cross", state: "Karnataka", district: "Mysuru", pincode: "570001" },
};

const en = (iso: string) => formatDeliveryDate(fromIstDateISO(iso), "en-IN");

describe("subscriptionEmail", () => {
  it("lists plans × boxes, every Saturday in order, the total and the term note", () => {
    const msg = subscriptionEmail("asha@example.in", sub, copy("en"));
    expect(msg.subject).toBe("Your Fewgrams subscription FG/2627/00043 is confirmed");
    expect(msg.text).toContain("Invoice FG/2627/00043");
    expect(msg.text).toContain("- Everyday Essentials × 2 · ₹2,398\n  2 boxes every Saturday");
    expect(msg.text).toContain("- Rare & Exotic × 1 · ₹1,799\n  1 box every Saturday");
    expect(msg.text).toContain("Total paid · ₹4,197");
    expect(msg.text).toContain("Delivery included");
    expect(msg.text).toContain(
      [
        `- Box 1 · ${en("2026-11-07")}`,
        `- Box 2 · ${en("2026-11-14")}`,
        `- Box 3 · ${en("2026-11-21")}`,
        `- Box 4 · ${en("2026-11-28")}`,
      ].join("\n"),
    );
    expect(msg.text).toContain("It does not renew by itself.");
    expect(msg.text).toContain("https://fewgrams.com/account/subscriptions");
    expect(msg.html).toContain("Rare &amp; Exotic × 1");
    expect(msg.html).toContain('href="https://fewgrams.com/account/subscriptions"');
  });

  it("counts the Saturdays it has rather than assuming four", () => {
    const msg = subscriptionEmail("a@b.in", { ...sub, deliveries: sub.deliveries.slice(0, 2) }, copy("en"));
    expect(msg.text).toContain("Box 2");
    expect(msg.text).not.toContain("Box 3");
  });

  it("writes Kannada for a Kannada subscription, and links the /kn page", () => {
    const msg = subscriptionEmail("a@b.in", { ...sub, locale: "kn", invoiceNo: null }, copy("kn"));
    expect(msg.subject).toBe("ನಿಮ್ಮ Fewgrams ಚಂದಾದಾರಿಕೆ FS0123456789 ದೃಢಪಟ್ಟಿದೆ");
    expect(msg.text).toContain("ಚಂದಾದಾರಿಕೆ FS0123456789");
    expect(msg.text).toContain("ಪ್ರತಿ ಶನಿವಾರ 2 ಡಬ್ಬಿಗಳು");
    expect(msg.text).toContain(`ಡಬ್ಬಿ 1 · ${formatDeliveryDate(fromIstDateISO("2026-11-07"), "kn-IN")}`);
    expect(msg.text).toContain("https://fewgrams.com/kn/account/subscriptions");
    expect(msg.html).toContain('<html lang="kn">');
  });

  it("names no city in its copy, in either language", () => {
    for (const locale of ["en", "kn"]) {
      const file = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "email.json"), "utf8"));
      expect(JSON.stringify(file.subscription)).not.toMatch(/Bengaluru|Bangalore|ಬೆಂಗಳೂರು/);
    }
  });
});

describe("sendSubscriptionConfirmation", () => {
  let sent: EmailMessage[];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    sent = [];
    h.provider = { name: "test", sendEmail: async (m) => void sent.push(m) };
    h.getTranslations = async ({ locale, namespace }) => catalogue(locale as "en" | "kn", namespace);
    error.mockClear();
    warn.mockClear();
  });

  it("sends in the subscription's language", async () => {
    await sendSubscriptionConfirmation({ ...sub, locale: "kn" });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("ಚಂದಾದಾರಿಕೆ");
  });

  it("skips a subscription with no email address", async () => {
    await sendSubscriptionConfirmation({ ...sub, email: null });
    expect(sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("never throws", async () => {
    h.provider = { name: "test", sendEmail: async () => Promise.reject(new Error("SES said no")) };
    await expect(sendSubscriptionConfirmation(sub)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});

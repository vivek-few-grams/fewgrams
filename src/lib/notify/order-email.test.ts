import { readFileSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contact } from "@/lib/content/contact";
import { formatDeliveryDate, fromIstDateISO } from "@/lib/delivery-date";
import type { OrderLine } from "@/lib/orders/order";
import type { EmailMessage, NotificationProvider } from "./provider";

/* The sender reaches next-intl and the transport; both are stood in for, so
   nothing here needs a request, SES or a network. */
const h = vi.hoisted(() => ({
  provider: null as NotificationProvider | null,
  noTransport: false,
  getTranslations: null as unknown as (o: { locale: string; namespace: string }) => Promise<unknown>,
}));
vi.mock("next-intl/server", () => ({ getTranslations: (o: never) => h.getTranslations(o) }));
vi.mock("@/lib/notify", () => ({
  notificationProvider: () => {
    if (h.noTransport) throw new Error("No email transport");
    return h.provider;
  },
}));

const { orderEmail, sendOrderConfirmation } = await import("./order-email");
type Translate = import("./order-email").Translate;

/** The real catalogue, one locale, **not** merged over English — a key
 *  missing in Kannada fails here instead of quietly rendering English. */
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
const copy = (locale: "en" | "kn") => ({
  locale,
  t: catalogue(locale, "email.order"),
  cart: catalogue(locale, "cart"),
});

const line = (over: Partial<OrderLine>): OrderLine => ({
  kind: "variety",
  key: "radish",
  name: "Radish",
  units: 2,
  unitPrice: 160,
  lineTotal: 320,
  grams: 200,
  readyDate: "2026-11-07",
  sourcing: null,
  parts: null,
  ...over,
});

const order = {
  id: "FG0123456789",
  email: "asha@example.in",
  locale: "en",
  invoiceNo: "FG/2627/00042",
  lines: [
    line({}),
    line({ kind: "tray", key: "shallow", name: "Shallow trays", units: 1, unitPrice: 160, lineTotal: 160, grams: null }),
    line({ kind: "media", key: "horti-coir", name: "Horti-Coir 5 kg", units: 1, unitPrice: 1199, lineTotal: 1199, grams: null }),
  ],
  deliveryCharge: 79,
  deliveryMethod: "own_run" as const,
  total: 1758,
  deliveryDate: "2026-11-07",
  address: {
    label: "Home",
    recipient: "Asha Rao",
    phone: "9876543210",
    line1: "12, 3rd Cross",
    line2: undefined,
    landmark: "Near the temple",
    district: "Mysuru",
    state: "Karnataka",
    pincode: "570001",
  },
};

describe("orderEmail", () => {
  it("lists every line as the order page does, with delivery, total and the date", () => {
    const msg = orderEmail("asha@example.in", order, copy("en"));
    expect(msg.to).toBe("asha@example.in");
    expect(msg.subject).toBe("Your Fewgrams order FG/2627/00042 is confirmed");
    expect(msg.text).toContain("Invoice FG/2627/00042");
    /* Units through `lineUnits`: grams for a weighed line, packs, blocks. */
    expect(msg.text).toContain("- Radish · ₹320\n  ₹160/100 g · 200 g");
    expect(msg.text).toContain("- Shallow trays · ₹160\n  ₹160 per pack · 1 pack");
    expect(msg.text).toContain("₹1,199 per block · 1 block");
    expect(msg.text).toContain("Delivery · ₹79");
    expect(msg.text).toContain("Total · ₹1,758");
    expect(msg.text).toContain("Inclusive of all taxes");
    expect(msg.text).toContain(`Arrives by ${formatDeliveryDate(fromIstDateISO("2026-11-07"), "en-IN")}`);
    expect(msg.text).toContain("Asha Rao\n12, 3rd Cross\nNear the temple\nMysuru, Karnataka 570001\n98765 43210");
    expect(msg.text).toContain("https://fewgrams.com/account/orders/FG0123456789");
    expect(msg.text).toContain(contact.email);
    expect(msg.html).toContain('<html lang="en">');
    expect(msg.html).toContain('href="https://fewgrams.com/account/orders/FG0123456789"');
    expect(msg.html).toContain("₹1,758");
  });

  it("writes Kannada for a Kannada order, and links the /kn page", () => {
    const msg = orderEmail("asha@example.in", { ...order, locale: "kn" }, copy("kn"));
    expect(msg.subject).toBe("ನಿಮ್ಮ Fewgrams ಆರ್ಡರ್ FG/2627/00042 ದೃಢಪಟ್ಟಿದೆ");
    expect(msg.text).toContain("200 ಗ್ರಾಂ");
    expect(msg.text).toContain(`${formatDeliveryDate(fromIstDateISO("2026-11-07"), "kn-IN")} ರೊಳಗೆ ತಲುಪುತ್ತದೆ`);
    expect(msg.text).toContain("https://fewgrams.com/kn/account/orders/FG0123456789");
    expect(msg.html).toContain('<html lang="kn">');
    expect(msg.text).not.toMatch(/Delivery|Total|Invoice/);
  });

  it("falls back to the order id, says free for a ₹0 charge, and drops the row on a pre-charge order", () => {
    const free = orderEmail("a@b.in", { ...order, invoiceNo: null, deliveryCharge: 0 }, copy("en"));
    expect(free.subject).toContain("FG0123456789");
    expect(free.text).toContain("Order FG0123456789");
    expect(free.text).toContain("Delivery · Free");

    const old = orderEmail("a@b.in", { ...order, deliveryMethod: null, deliveryCharge: 0 }, copy("en"));
    expect(old.text).not.toContain("Delivery ·");
  });

  it("keeps a green bought by the tray in trays", () => {
    const msg = orderEmail("a@b.in", { ...order, lines: [line({ grams: null, units: 2, unitPrice: 75 })] }, copy("en"));
    expect(msg.text).toContain("₹75 per tray · 2 trays");
  });

  it("escapes what came from the order in the HTML, and only there", () => {
    const msg = orderEmail(
      "a@b.in",
      {
        ...order,
        lines: [line({ name: 'Radish <img src=x onerror="alert(1)"> & co' })],
        address: { ...order.address, recipient: "O'Brien <b>" },
      },
      copy("en"),
    );
    expect(msg.html).not.toContain("<img");
    expect(msg.html).not.toContain("<b>");
    expect(msg.html).toContain("Radish &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; co");
    expect(msg.html).toContain("O&#39;Brien &lt;b&gt;");
    expect(msg.text).toContain('Radish <img src=x onerror="alert(1)"> & co');
  });
});

describe("the copy itself", () => {
  it("names no city, in either language", () => {
    for (const locale of ["en", "kn"]) {
      const file = JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "email.json"), "utf8"));
      expect(JSON.stringify(file.order)).not.toMatch(/Bengaluru|Bangalore|ಬೆಂಗಳೂರು/);
    }
  });
});

describe("sendOrderConfirmation", () => {
  let sent: EmailMessage[];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    sent = [];
    h.noTransport = false;
    h.provider = { name: "test", sendEmail: async (m) => void sent.push(m) };
    h.getTranslations = async ({ locale, namespace }) => catalogue(locale as "en" | "kn", namespace);
    log.mockClear();
    warn.mockClear();
    error.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("sends in the order's language", async () => {
    await sendOrderConfirmation({ ...order, locale: "kn" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("asha@example.in");
    expect(sent[0].subject).toContain("ದೃಢಪಟ್ಟಿದೆ");
    expect(sent[0].text).toContain("/kn/account/orders/FG0123456789");
  });

  it("reads an unknown locale as English", async () => {
    await sendOrderConfirmation({ ...order, locale: "fr" });
    expect(sent[0].subject).toBe("Your Fewgrams order FG/2627/00042 is confirmed");
  });

  it("prints to the terminal when there is no transport (local development)", async () => {
    h.provider = null;
    await sendOrderConfirmation(order);
    expect(sent).toHaveLength(0);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain("Your Fewgrams order FG/2627/00042 is confirmed");
  });

  it("skips an order with no email address", async () => {
    await sendOrderConfirmation({ ...order, email: null });
    expect(sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("never throws — a failed email must not fail a payment", async () => {
    h.provider = { name: "test", sendEmail: async () => Promise.reject(new Error("SES said no")) };
    await expect(sendOrderConfirmation(order)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();

    h.noTransport = true;
    await expect(sendOrderConfirmation(order)).resolves.toBeUndefined();

    h.noTransport = false;
    h.getTranslations = async () => Promise.reject(new Error("no messages"));
    await expect(sendOrderConfirmation(order)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(3);
  });
});

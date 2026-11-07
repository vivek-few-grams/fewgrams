import { readFileSync } from "node:fs";
import path from "node:path";
import { createFormatter, createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The real cart catalogue, one locale at a time, not merged over English —
   so a Kannada key that is missing fails here. */
const h = vi.hoisted(() => ({ locale: "en" as "en" | "kn" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: h.locale,
      messages: {
        cart: JSON.parse(readFileSync(path.join(process.cwd(), "messages", h.locale, "cart.json"), "utf8")),
      },
      namespace: namespace as "cart",
      onError: (e: Error) => {
        throw e;
      },
    } as never),
  getFormatter: async () => createFormatter({ locale: h.locale, timeZone: "Asia/Kolkata" }),
}));

const { removedNotice } = await import("./removed-notice");

beforeEach(() => {
  h.locale = "en";
});

describe("removedNotice", () => {
  it("says nothing when nothing went off sale", async () => {
    expect(await removedNotice({ unavailable: [] })).toBeNull();
  });

  it("names each line by product and kind, never by its key", async () => {
    const notice = await removedNotice({
      unavailable: [
        { kind: "variety", key: "alfalfa", name: "Alfalfa" },
        { kind: "seed", key: "beetroot", name: "Beetroot" },
      ],
    });
    expect(notice).toEqual({
      heading: "Taken out of your cart",
      body: "No longer on sale: Alfalfa microgreens and Beetroot seeds.",
    });
  });

  it("says what kind of thing it was when nothing names it", async () => {
    const notice = await removedNotice({
      unavailable: [
        { kind: "rack", key: "rk-6f-5s-1.25x3-1.4-orange", name: null },
        { kind: "tray", key: "drain-mat", name: "Drain cell mat" },
      ],
    });
    expect(notice?.body).toBe("No longer on sale: a rack and Drain cell mat.");
  });

  it("reads in Kannada from the Kannada file", async () => {
    h.locale = "kn";
    const notice = await removedNotice({
      unavailable: [{ kind: "variety", key: "alfalfa", name: "ಅಲ್ಫಾಲ್ಫಾ" }],
    });
    expect(notice?.heading).toBe("ನಿಮ್ಮ ಕಾರ್ಟ್‌ನಿಂದ ತೆಗೆದುಹಾಕಲಾಗಿದೆ");
    expect(notice?.body).toBe("ಇನ್ನು ಮಾರಾಟದಲ್ಲಿಲ್ಲ: ಅಲ್ಫಾಲ್ಫಾ ಮೈಕ್ರೋಗ್ರೀನ್ಸ್.");
  });
});

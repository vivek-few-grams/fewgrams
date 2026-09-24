import { describe, expect, it } from "vitest";
import raw from "../../../content/contact.json";
import { parseContact, whatsappHref } from "./contact";

describe("content/contact.json", () => {
  it("is well formed", () => {
    expect(() => parseContact(raw)).not.toThrow();
  });

  it("refuses a phone with a country code or spaces, which tel: and display would mangle", () => {
    expect(() => parseContact({ ...raw, phone: "+91 99168 69483" })).toThrow(/phone/);
  });

  it("refuses a WhatsApp number without its country code", () => {
    expect(() => parseContact({ ...raw, whatsapp: "9916869483" })).toThrow(/whatsapp/);
  });

  it("allows WhatsApp to be switched off", () => {
    expect(parseContact({ ...raw, whatsapp: null }).whatsapp).toBeNull();
  });

  it("builds a wa.me link with the message encoded", () => {
    expect(whatsappHref("Hi & bye")).toMatch(/^https:\/\/wa\.me\/\d+\?text=Hi%20%26%20bye$/);
  });
});

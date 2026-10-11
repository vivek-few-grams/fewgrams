import { describe, expect, it } from "vitest";
import { signInEmail, signInEmailLocale } from "./sign-in-email";

const link = (callback: string) =>
  `https://fewgrams.com/api/auth/callback/email?callbackUrl=${encodeURIComponent(callback)}&token=abc&email=a%40b.in`;

describe("signInEmailLocale", () => {
  it("reads Kannada from a /kn page", () => {
    expect(signInEmailLocale(link("https://fewgrams.com/kn/checkout"))).toBe("kn");
    expect(signInEmailLocale(link("/kn"))).toBe("kn");
  });

  it("falls back to English", () => {
    expect(signInEmailLocale(link("https://fewgrams.com/checkout"))).toBe("en");
    expect(signInEmailLocale(link("/knives"))).toBe("en");
    expect(signInEmailLocale("https://fewgrams.com/api/auth/callback/email?token=abc")).toBe("en");
    expect(signInEmailLocale("not a url")).toBe("en");
  });
});

describe("signInEmail", () => {
  const copy = {
    subject: "Your link",
    heading: "Sign in",
    body: "Tap it",
    button: "Sign in",
    fallback: "Or paste:",
    ignore: "Ignore <this>",
  };

  it("puts the link in both bodies, escaped in the HTML", () => {
    const url = link("/checkout");
    const msg = signInEmail("a@b.in", url, copy);
    expect(msg.to).toBe("a@b.in");
    expect(msg.subject).toBe("Your link");
    expect(msg.text).toContain(url);
    expect(msg.html).toContain(url.replace(/&/g, "&amp;"));
    expect(msg.html).not.toContain("&token");
    expect(msg.html).toContain("Ignore &lt;this&gt;");
  });
});

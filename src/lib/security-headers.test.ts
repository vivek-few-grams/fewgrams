import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy(false);

  /* Checkout breaks only in a browser if one of these goes — no type error,
     no failing request on the server. */
  it.each(["script-src", "frame-src", "connect-src"])("lets both gateways into %s", (name) => {
    expect(directive(csp, name)).toEqual(
      expect.arrayContaining(["https://*.razorpay.com", "https://*.cashfree.com"]),
    );
  });

  it("lets the sign-in form reach Google", () => {
    expect(directive(csp, "form-action")).toContain("https://accounts.google.com");
  });

  it("refuses plugins, foreign framing and a moved <base>", () => {
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
  });

  it("allows eval and the HMR socket in development only", () => {
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(contentSecurityPolicy(true), "script-src")).toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).not.toContain("ws:");
  });
});

describe("securityHeaders", () => {
  it("keeps geolocation for the address form", () => {
    const pp = securityHeaders(false).find((h) => h.key === "Permissions-Policy")!.value;
    expect(pp).toContain("geolocation=(self)");
    expect(pp).toContain("camera=()");
  });
});

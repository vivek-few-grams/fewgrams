import { afterEach, describe, expect, it } from "vitest";
import { hasRole, isBootstrapAdmin, isRole } from "./roles";

describe("hasRole — SPEC §8 role ranking", () => {
  it("admin satisfies every requirement", () => {
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("admin", "staff")).toBe(true);
    expect(hasRole("admin", "customer")).toBe(true);
  });

  it("staff cannot reach admin", () => {
    expect(hasRole("staff", "admin")).toBe(false);
    expect(hasRole("staff", "staff")).toBe(true);
    expect(hasRole("staff", "customer")).toBe(true);
  });

  it("customer cannot reach staff or admin", () => {
    expect(hasRole("customer", "admin")).toBe(false);
    expect(hasRole("customer", "staff")).toBe(false);
    expect(hasRole("customer", "customer")).toBe(true);
  });

  it("no role fails closed", () => {
    expect(hasRole(undefined, "customer")).toBe(false);
    expect(hasRole(undefined, "admin")).toBe(false);
  });
});

describe("isRole", () => {
  it("rejects anything not in the list", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(3)).toBe(false);
    // An attacker-supplied object must never pass as a role.
    expect(isRole({ toString: () => "admin" })).toBe(false);
  });
});

describe("isBootstrapAdmin", () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    process.env.ADMIN_EMAILS = original;
  });

  it("matches case-insensitively and ignores surrounding spaces", () => {
    process.env.ADMIN_EMAILS = " Owner@Fewgrams.com , staff@fewgrams.com ";
    expect(isBootstrapAdmin("owner@fewgrams.com")).toBe(true);
    expect(isBootstrapAdmin("OWNER@FEWGRAMS.COM")).toBe(true);
    expect(isBootstrapAdmin("staff@fewgrams.com")).toBe(true);
  });

  it("does not match a non-listed address", () => {
    process.env.ADMIN_EMAILS = "owner@fewgrams.com";
    expect(isBootstrapAdmin("someone@else.com")).toBe(false);
  });

  it("fails closed on a missing or empty variable", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isBootstrapAdmin("owner@fewgrams.com")).toBe(false);
    process.env.ADMIN_EMAILS = "";
    expect(isBootstrapAdmin("owner@fewgrams.com")).toBe(false);
    expect(isBootstrapAdmin("")).toBe(false);
  });

  it("does not treat a null or undefined email as a match", () => {
    process.env.ADMIN_EMAILS = "owner@fewgrams.com";
    expect(isBootstrapAdmin(null)).toBe(false);
    expect(isBootstrapAdmin(undefined)).toBe(false);
  });

  it("is not fooled by a substring", () => {
    process.env.ADMIN_EMAILS = "owner@fewgrams.com";
    expect(isBootstrapAdmin("notowner@fewgrams.com")).toBe(false);
    expect(isBootstrapAdmin("owner@fewgrams.com.attacker.net")).toBe(false);
  });
});

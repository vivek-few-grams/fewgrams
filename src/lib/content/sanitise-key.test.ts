import { describe, expect, it } from "vitest";
import { isValidContentKey, sanitiseKey } from "@/lib/content/content-key";

/**
 * The admin key field sanitises every keystroke so it cannot hold an invalid
 * key. That is a convenience on top of `isValidContentKey`, which is the
 * actual gate — so the property that matters is that **anything the field
 * produces passes the server check**, for any input at all.
 */
describe("sanitiseKey", () => {
  it("lowercases and turns separators into hyphens", () => {
    expect(sanitiseKey("Red Amaranthus")).toBe("red-amaranthus");
    expect(sanitiseKey("RED_AMARANTHUS")).toBe("red-amaranthus");
    expect(sanitiseKey("  pea   shoots  ")).toBe("pea-shoots-");
  });

  it("drops digits and punctuation rather than rejecting the whole input", () => {
    expect(sanitiseKey("amaranth-2")).toBe("amaranth-");
    expect(sanitiseKey("radish!!")).toBe("radish");
    expect(sanitiseKey("ಮೂಲಂಗಿ")).toBe("");
    // Every traversal character is stripped, so nothing path-like survives.
    expect(sanitiseKey("../../etc/passwd")).toBe("etcpasswd");
  });

  it("collapses repeated hyphens and refuses a leading one", () => {
    expect(sanitiseKey("red---amaranth")).toBe("red-amaranth");
    expect(sanitiseKey("---radish")).toBe("radish");
  });

  /** A trailing hyphen has to survive, or `red-` could never be typed on the
   *  way to `red-amaranth`. It is the server check that refuses it on submit. */
  it("keeps a trailing hyphen so a key can be typed through it", () => {
    expect(sanitiseKey("red-")).toBe("red-");
    expect(isValidContentKey("red-")).toBe(false);
  });

  it("caps the length", () => {
    expect(sanitiseKey("a".repeat(200))).toHaveLength(60);
  });

  /**
   * The invariant. Whatever is typed, the field's value is either empty, a
   * valid key, or a partial key ending in a hyphen — never something that
   * would reach the server as a silently-wrong filename.
   */
  it("never yields a value containing anything but a-z and hyphens", () => {
    const inputs = [
      "Red Amaranthus 2", "RADISH", "pea_shoots", "../../secrets", "ಮೂಲಂಗಿ",
      "sun-flower!!", "a b c", "123", "--x--", "", "  ", "Mixed-CASE_99",
    ];
    for (const input of inputs) {
      const out = sanitiseKey(input);
      expect(out, input).toMatch(/^[a-z-]*$/);
      expect(out.startsWith("-"), input).toBe(false);
      if (out && !out.endsWith("-")) {
        expect(isValidContentKey(out), `${input} -> ${out}`).toBe(true);
      }
    }
  });
});

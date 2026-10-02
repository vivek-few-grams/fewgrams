import { describe, expect, it } from "vitest";
import { STEPS, isStepId, nextStep, previousStep, stepFrom } from "./steps";

describe("garden steps", () => {
  it("starts at the grown tray and ends at the harvest", () => {
    expect(STEPS[0]).toBe("touch");
    expect(STEPS[STEPS.length - 1]).toBe("harvest");
    expect(new Set(STEPS).size).toBe(STEPS.length);
  });

  it("reads a step from the URL, and anything else as the first", () => {
    expect(stepFrom("sow")).toBe("sow");
    expect(stepFrom("nope")).toBe("touch");
    expect(stepFrom(null)).toBe("touch");
    expect(isStepId("constructor")).toBe(false);
  });

  it("walks forward and back with nothing past either end", () => {
    expect(nextStep("touch")).toBe("pick");
    expect(nextStep("harvest")).toBeNull();
    expect(previousStep("pick")).toBe("touch");
    expect(previousStep("touch")).toBeNull();
    let s: (typeof STEPS)[number] | null = "touch";
    const walked: string[] = [];
    while (s) {
      walked.push(s);
      s = nextStep(s);
    }
    expect(walked).toEqual([...STEPS]);
  });
});

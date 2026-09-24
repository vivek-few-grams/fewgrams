import { describe, expect, it } from "vitest";
import { istDateISO } from "@/lib/delivery-date";
import { TRAY_MIN_LEAD_DAYS } from "@/lib/trays/lead-time";
import {
  MEDIUM_DEFAULT_LEAD_DAYS,
  MEDIUM_MAX_LEAD_DAYS,
  MEDIUM_MIN_LEAD_DAYS,
  isValidMediumLeadDays,
  mediumReadyDate,
} from "./lead-time";

const ist = (local: string) => new Date(`${local}+05:30`);

describe("grow media lead-time bounds", () => {
  /* No figure of its own yet — the bought-in floor the owner set for trays.
     If one is given for coir, this is the test that should change. */
  it("floors at the tray minimum", () => {
    expect(MEDIUM_MIN_LEAD_DAYS).toBe(TRAY_MIN_LEAD_DAYS);
    expect(MEDIUM_DEFAULT_LEAD_DAYS).toBe(MEDIUM_MIN_LEAD_DAYS);
  });

  it("tops out where the delivery-date arithmetic does", () => {
    expect(MEDIUM_MAX_LEAD_DAYS).toBe(14);
    expect(istDateISO(mediumReadyDate(MEDIUM_MAX_LEAD_DAYS, ist("2026-09-24T09:00:00")))).toBe(
      "2026-10-08",
    );
  });

  it.each([7, 10, 14])("accepts %i days", (days) => {
    expect(isValidMediumLeadDays(days)).toBe(true);
  });

  it.each([0, 3, 6, 15, 7.5, Number.NaN])("refuses %s days", (days) => {
    expect(isValidMediumLeadDays(days)).toBe(false);
  });

  it("promises the row's own figure", () => {
    expect(istDateISO(mediumReadyDate(7, ist("2026-09-24T09:00:00")))).toBe("2026-10-01");
  });

  /* A corrupt row must not print an early date; the ceiling is the honest
     fallback, as it is for trays. */
  it("falls back to the ceiling for a figure outside the bounds", () => {
    expect(istDateISO(mediumReadyDate(2, ist("2026-09-24T09:00:00")))).toBe("2026-10-08");
  });
});

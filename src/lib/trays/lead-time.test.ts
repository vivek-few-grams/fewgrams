import { describe, expect, it } from "vitest";
import { istDateISO } from "@/lib/delivery-date";
import {
  TRAY_DEFAULT_LEAD_DAYS,
  TRAY_MAX_LEAD_DAYS,
  TRAY_MIN_LEAD_DAYS,
  isValidLeadDays,
  trayReadyDate,
} from "./lead-time";

/** A moment in IST, expressed as one. */
const ist = (local: string) => new Date(`${local}+05:30`);

describe("the lead-time floor is the owner's figure", () => {
  /* Stated on 17 Sep 2026: "even these are ordered based on the request this
     would take minimum of seven days to deliver". If the floor is ever moved
     this failing is the point — it names the decision rather than letting a
     three-day promise through a seven-day rule. */
  it("is seven days", () => {
    expect(TRAY_MIN_LEAD_DAYS).toBe(7);
  });

  /** A new row starts on the promise every launch item was sold with. */
  it("is also what a new item defaults to", () => {
    expect(TRAY_DEFAULT_LEAD_DAYS).toBe(TRAY_MIN_LEAD_DAYS);
  });

  /**
   * The ceiling is not a business rule — it is the date module's clamp,
   * imported rather than restated. This is the assertion that matters: if
   * `MAX_LEAD_DAYS` ever moves and this constant does not follow, the admin
   * screen would accept a figure `trayReadyDate` then silently clamps, and an
   * operator would see one number while a customer saw another date.
   */
  it("tops out where the delivery-date arithmetic does", () => {
    expect(TRAY_MAX_LEAD_DAYS).toBe(14);
    expect(istDateISO(trayReadyDate(TRAY_MAX_LEAD_DAYS, ist("2026-09-17T09:00:00")))).toBe(
      "2026-10-01",
    );
  });
});

describe("isValidLeadDays", () => {
  it.each([7, 8, 10, 14])("accepts %i days", (days) => {
    expect(isValidLeadDays(days)).toBe(true);
  });

  /* Below the floor is refused rather than rounded up: an operator typing 3
     means something the business cannot do, and quietly correcting it to 7
     hides the disagreement instead of surfacing it. */
  it.each([0, 1, 6, -7])("refuses %i days as shorter than we can promise", (days) => {
    expect(isValidLeadDays(days)).toBe(false);
  });

  it.each([15, 30, 365])("refuses %i days as longer than a date can be printed", (days) => {
    expect(isValidLeadDays(days)).toBe(false);
  });

  /* Whole days only. Half a day of supplier lead time is not a thing anyone
     can act on, and 7.5 would print the same date as 8 while reading
     differently on the admin screen. */
  it.each([7.5, 10.1])("refuses %p as not a whole number of days", (days) => {
    expect(isValidLeadDays(days)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, undefined as unknown as number])(
    "refuses %p",
    (bad) => {
      expect(isValidLeadDays(bad)).toBe(false);
    },
  );
});

describe("trayReadyDate", () => {
  const now = ist("2026-09-17T14:00:00"); // Thursday

  it("is the lead time, counted in whole IST days", () => {
    expect(istDateISO(trayReadyDate(7, now))).toBe("2026-09-24");
    expect(istDateISO(trayReadyDate(10, now))).toBe("2026-09-27");
  });

  /* Day-granular in IST, so the hour someone orders cannot move the promise.
     Both of these are the same Thursday and both cross a UTC day boundary. */
  it.each(["2026-09-17T00:05:00", "2026-09-17T23:55:00"])(
    "gives the same date at %s IST",
    (when) => {
      expect(istDateISO(trayReadyDate(7, ist(when)))).toBe("2026-09-24");
    },
  );

  /**
   * A figure the admin would refuse resolves to the **slowest** promise, never
   * the fastest. Same asymmetry as `seedSourcing`: a date the business can beat
   * is recoverable, a date it cannot meet is a broken promise. A row can only
   * hold a bad figure if it was written outside the app, which is exactly when
   * nobody is watching.
   */
  it.each([0, 3, 30, NaN])("falls back to the ceiling for a bad figure (%p)", (bad) => {
    expect(trayReadyDate(bad, now).getTime()).toBe(
      trayReadyDate(TRAY_MAX_LEAD_DAYS, now).getTime(),
    );
  });

  it("is never sooner than the floor, whatever it is handed", () => {
    for (const days of [0, 1, 6, 7, 9, 14, 99, NaN]) {
      const earliest = trayReadyDate(TRAY_MIN_LEAD_DAYS, now).getTime();
      expect(trayReadyDate(days, now).getTime()).toBeGreaterThanOrEqual(earliest);
    }
  });
});

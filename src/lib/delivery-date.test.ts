import { describe, expect, it } from "vitest";
import {
  deliverySchedule,
  firstDeliveryDate,
  formatDeliveryDate,
  istDateISO,
  nextCutoff,
  sowSunday,
} from "./delivery-date";

/** Build an instant from an IST wall-clock time. */
const ist = (s: string) => new Date(`${s}+05:30`);

/** Assert on the IST calendar date, not a localised string — ICU changes
 *  month abbreviations between versions ("Sep" vs "Sept"), which would make
 *  these tests fail for reasons that have nothing to do with the logic. */
const fmt = istDateISO;

describe("cutoff boundary — SPEC §5.3", () => {
  it("an order on Thursday makes the upcoming Sunday's sow", () => {
    const now = ist("2026-09-17T10:00:00"); // Thu
    expect(fmt(nextCutoff(now))).toBe("2026-09-19");
    expect(fmt(sowSunday(now))).toBe("2026-09-20");
    expect(fmt(firstDeliveryDate(now))).toBe("2026-09-26");
  });

  it("Friday 23:58 IST still makes the cutoff", () => {
    const now = ist("2026-09-18T23:58:00"); // Fri, 2 min to spare
    expect(fmt(firstDeliveryDate(now))).toBe("2026-09-26");
  });

  it("Saturday 00:00 IST exactly has MISSED the cutoff", () => {
    const now = ist("2026-09-19T00:00:00");
    expect(fmt(sowSunday(now))).toBe("2026-09-27");
    expect(fmt(firstDeliveryDate(now))).toBe("2026-10-03");
  });

  it("a Sunday 00:01 order lands 13 days out (the §15 case)", () => {
    const now = ist("2026-09-20T00:01:00"); // Sun
    const delivery = firstDeliveryDate(now);
    expect(fmt(delivery)).toBe("2026-10-03");
    const days = (delivery.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(12);
    expect(days).toBeLessThan(14);
  });
});

describe("timezone independence", () => {
  it("gives the same delivery date whether the clock reads IST or UTC-8", () => {
    // 2026-09-19T02:00 IST == 2026-09-18T20:30 UTC == 13:30 PDT Friday.
    // A naive local-time implementation would call this "Friday, still open".
    // In IST it is Saturday, so the cutoff has passed.
    const now = new Date("2026-09-18T20:30:00Z");
    expect(fmt(firstDeliveryDate(now))).toBe("2026-10-03");
  });
});

describe("four-week schedule — SPEC §5.2", () => {
  it("returns four consecutive Saturdays", () => {
    const weeks = deliverySchedule(ist("2026-09-17T10:00:00"));
    expect(weeks.map(fmt)).toEqual([
      "2026-09-26",
      "2026-10-03",
      "2026-10-10",
      "2026-10-17",
    ]);
  });
});

describe("every day of the week resolves to a Saturday", () => {
  it("holds across a full week of order times", () => {
    for (let d = 14; d <= 20; d++) {
      const now = ist(`2026-09-${d}T09:00:00`);
      const delivery = firstDeliveryDate(now);
      // 6 = Saturday, evaluated in IST
      const istDay = new Date(delivery.getTime() + 5.5 * 3600_000).getUTCDay();
      expect(istDay).toBe(6);
      expect(delivery.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("display formatting", () => {
  it("drops the comma en-IN inserts", () => {
    const d = ist("2026-09-26T00:00:00");
    expect(formatDeliveryDate(d)).toBe("Sat 26 Sept");
    expect(formatDeliveryDate(d)).not.toContain(",");
  });

  it("formats in IST even when the process clock is elsewhere", () => {
    // 23:00 UTC on the 25th is already 04:30 IST on the 26th.
    expect(formatDeliveryDate(new Date("2026-09-25T23:00:00Z"))).toBe(
      "Sat 26 Sept",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  adhocReadyDate,
  adhocSowDate,
  daysFromToday,
  deliverySchedule,
  firstDeliveryDate,
  formatDeliveryDate,
  istDateISO,
  latestDate,
  nextCutoff,
  nextDay,
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

describe("one-off orders sow next day, not Sunday — SPEC §18.6", () => {
  /* The owner's correction, 15 Sep 2026: individual orders are sown the next
     day; only subscriptions wait for the Sunday cycle. These cases pin the
     difference so nobody "unifies" the two rules later. */

  it("sows tomorrow, whatever day of the week it is", () => {
    const cases = [
      ["2026-09-14T10:00:00", "2026-09-15"], // Mon -> Tue
      ["2026-09-18T10:00:00", "2026-09-19"], // Fri -> Sat
      ["2026-09-19T10:00:00", "2026-09-20"], // Sat -> Sun
      ["2026-09-20T10:00:00", "2026-09-21"], // Sun -> Mon
    ] as const;
    for (const [when, expected] of cases) {
      expect(fmt(adhocSowDate(ist(when)))).toBe(expected);
    }
  });

  it("does NOT wait for the subscription cutoff", () => {
    // A Saturday order has missed the weekly cutoff, so a subscription would
    // not be sown until 27 Sept. A one-off is sown the next morning.
    const now = ist("2026-09-19T09:00:00"); // Sat
    expect(fmt(sowSunday(now))).toBe("2026-09-27");
    expect(fmt(adhocSowDate(now))).toBe("2026-09-20");
  });

  it("is day-granular: 00:05 and 23:55 on the same day sow together", () => {
    expect(fmt(adhocSowDate(ist("2026-09-14T00:05:00")))).toBe("2026-09-15");
    expect(fmt(adhocSowDate(ist("2026-09-14T23:55:00")))).toBe("2026-09-15");
  });

  it("is ready growDays after the sow, not after the order", () => {
    const now = ist("2026-09-15T15:00:00"); // Tue
    // Sown Wed 16th; broccoli is 10 grow days.
    expect(fmt(adhocSowDate(now))).toBe("2026-09-16");
    expect(fmt(adhocReadyDate(10, now))).toBe("2026-09-26");
  });

  it("crosses a month boundary correctly", () => {
    const now = ist("2026-09-28T12:00:00");
    expect(fmt(adhocReadyDate(10, now))).toBe("2026-10-09");
  });

  it("clamps a nonsense growDays rather than printing a nonsense date", () => {
    const now = ist("2026-09-15T12:00:00");
    expect(fmt(adhocReadyDate(0, now))).toBe("2026-09-17"); // floored to 1
    expect(fmt(adhocReadyDate(9999, now))).toBe(fmt(adhocReadyDate(60, now)));
  });

  it("a mixed order is ready on its slowest variety's date", () => {
    const now = ist("2026-09-15T12:00:00"); // sown 16th
    // 7-day mustard would be ready 23rd; 10-day broccoli on the 26th.
    expect(fmt(adhocReadyDate(7, now))).toBe("2026-09-23");
    const slowest = latestDate([adhocReadyDate(7, now), adhocReadyDate(10, now)]);
    expect(fmt(slowest!)).toBe("2026-09-26");
    // Order of the list must not matter.
    expect(fmt(latestDate([adhocReadyDate(10, now), adhocReadyDate(7, now)])!)).toBe(
      "2026-09-26",
    );
  });
});

describe("nextDay — a next-day promise, day-granular in IST", () => {
  it.each(["2026-09-17T00:05:00", "2026-09-17T14:00:00", "2026-09-17T23:55:00"])(
    "is the 18th whatever the hour on the 17th (%s)",
    (when) => {
      expect(fmt(nextDay(ist(when)))).toBe("2026-09-18");
    },
  );

  /* The seed dispatch date and the one-off sow date are the same arithmetic,
     and this pins that they stay the same rather than drifting apart. */
  it("is the same instant a one-off order is sown on", () => {
    const now = ist("2026-09-17T14:00:00");
    expect(nextDay(now).getTime()).toBe(adhocSowDate(now).getTime());
  });

  it("crosses a month end", () => {
    expect(fmt(nextDay(ist("2026-09-30T20:00:00")))).toBe("2026-10-01");
  });
});

describe("daysFromToday — the seed vendor lead time", () => {
  const now = ist("2026-09-17T14:00:00");

  it("counts calendar days from today in IST", () => {
    expect(fmt(daysFromToday(1, now))).toBe("2026-09-18");
    expect(fmt(daysFromToday(10, now))).toBe("2026-09-27");
  });

  it("is unaffected by the hour the order was placed", () => {
    expect(fmt(daysFromToday(10, ist("2026-09-17T00:05:00")))).toBe("2026-09-27");
    expect(fmt(daysFromToday(10, ist("2026-09-17T23:55:00")))).toBe("2026-09-27");
  });

  /* Guards a bad constant from printing a date next year on a page a customer
     reads. Both ends are clamped. */
  it("clamps rather than printing a nonsense date", () => {
    expect(fmt(daysFromToday(0, now))).toBe("2026-09-18");
    expect(fmt(daysFromToday(9999, now))).toBe(fmt(daysFromToday(14, now)));
  });
});

describe("latestDate — one order, one trip, on the slowest line's date", () => {
  const a = ist("2026-09-18T00:00:00");
  const b = ist("2026-09-27T00:00:00");

  it("takes the later date whichever order it is given in", () => {
    expect(latestDate([a, b])).toEqual(b);
    expect(latestDate([b, a])).toEqual(b);
  });

  it("is the single date for a cart of one thing", () => {
    expect(latestDate([a])).toEqual(a);
  });

  /* Null-safe, because a cart line's date is optional at the type level in
     more than one caller and an empty cart has no date at all. */
  it("ignores gaps and has no date for nothing", () => {
    expect(latestDate([null, a, undefined])).toEqual(a);
    expect(latestDate([])).toBeNull();
    expect(latestDate([null, undefined])).toBeNull();
  });
});

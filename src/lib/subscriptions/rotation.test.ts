import { describe, expect, it } from "vitest";
import { fromIstDateISO, istDateISO } from "@/lib/delivery-date";
import { ROTATION_ANCHOR, rotationWeek, subscriptionSchedule, upcomingSaturdays } from "./rotation";

const sat = (iso: string) => fromIstDateISO(iso);

describe("the shared rotation calendar — SPEC §5.2.1", () => {
  it("puts the anchor Saturday on week 1 and counts on from it", () => {
    expect(rotationWeek(sat(ROTATION_ANCHOR))).toBe(1);
    expect(["2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07"].map((d) => rotationWeek(sat(d)))).toEqual([
      2, 3, 4, 1,
    ]);
  });

  it("works before the anchor, without a week 0 or a negative week", () => {
    expect(rotationWeek(sat("2026-10-03"))).toBe(4);
    expect(rotationWeek(sat("2026-09-26"))).toBe(3);
  });

  it("does not repeat a week across a month with five Saturdays", () => {
    /* October 2026 has five Saturdays; a week-of-month rule would give week 1
       to both 31 Oct and 7 Nov. */
    const weeks = ["2026-10-31", "2026-11-07"].map((d) => rotationWeek(sat(d)));
    expect(weeks[0]).not.toBe(weeks[1]);
  });

  it("starts a mid-month subscriber on whatever week comes next", () => {
    /* Thursday 15 Oct, before the Friday cutoff: sown Sun 18, first box
       Sat 24 Oct — week 3 — then 4, 1, 2. */
    const s = subscriptionSchedule(new Date("2026-10-15T10:00:00+05:30"));
    expect(s.map((b) => istDateISO(b.date))).toEqual(["2026-10-24", "2026-10-31", "2026-11-07", "2026-11-14"]);
    expect(s.map((b) => b.week)).toEqual([3, 4, 1, 2]);
  });

  it("lists the coming Saturdays, today included when today is one", () => {
    expect(upcomingSaturdays(new Date("2026-09-26T09:00:00+05:30"), 2)).toEqual(["2026-09-26", "2026-10-03"]);
    expect(upcomingSaturdays(new Date("2026-09-27T09:00:00+05:30"), 1)).toEqual(["2026-10-03"]);
  });
});

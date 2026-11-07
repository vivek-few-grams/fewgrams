import { describe, expect, it } from "vitest";
import { istDateISO } from "@/lib/delivery-date";
import { openingSaturday } from "./opening";

/* Rotation weeks around these dates (anchor Sat 10 Oct = week 1):
   Sat 14 Nov is week 2, Sat 21 Nov week 3, Sat 28 Nov week 4. */
const at = (iso: string) => new Date(`${iso}+05:30`);
const days = (byWeek: Record<number, number>) => (week: number) => byWeek[week] ?? 0;
const opening = (now: string, byWeek: Record<number, number>) => {
  const o = openingSaturday(at(now), days(byWeek));
  return { first: istDateISO(o.first), joinBy: istDateISO(o.joinBy) };
};

describe("openingSaturday", () => {
  it("is the Friday-cutoff Saturday when every crop fits the week", () => {
    expect(opening("2026-11-05T10:00:00", { 2: 7 })).toEqual({ first: "2026-11-14", joinBy: "2026-11-06" });
  });

  it("closes a Saturday the day before its slowest crop must be sown", () => {
    // Broccoli at ten days for Sat 14 Nov is sown by Wed 4 Nov: join by Tue 3 Nov.
    expect(opening("2026-10-31T10:00:00", { 2: 10 })).toEqual({ first: "2026-11-14", joinBy: "2026-11-03" });
  });

  it("rolls a late sign-up to the next Saturday that can still be sown for", () => {
    // Thursday 5 Nov is after 14 Nov's broccoli went in; 21 Nov's goes in on Wed 11 Nov.
    expect(opening("2026-11-05T10:00:00", { 2: 10, 3: 10 })).toEqual({
      first: "2026-11-21",
      joinBy: "2026-11-10",
    });
  });

  it("closes at midnight IST, not at the end of the sow-by day", () => {
    expect(opening("2026-11-03T23:59:00", { 2: 10 }).first).toBe("2026-11-14");
    expect(opening("2026-11-04T00:00:00", { 2: 10 }).first).toBe("2026-11-21");
  });

  it("treats an empty week as the Friday cutoff", () => {
    expect(opening("2026-11-06T22:00:00", {})).toEqual({ first: "2026-11-14", joinBy: "2026-11-06" });
  });
});

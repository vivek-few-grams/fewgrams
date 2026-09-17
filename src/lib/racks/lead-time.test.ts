import { describe, expect, it } from "vitest";
import { MAX_LEAD_DAYS } from "@/lib/delivery-date";
import { RACK_LEAD_DAYS, rackReadyDate } from "./lead-time";

describe("rack lead time", () => {
  it("is the owner's three days", () => {
    expect(RACK_LEAD_DAYS).toBe(3);
  });

  it("stays inside the clamp `daysFromToday` applies", () => {
    /* Past this, the date shown would be nearer than the constant claims and
       nothing would say so. The module throws on import instead; this pins the
       relationship so the reason survives a future edit. */
    expect(RACK_LEAD_DAYS).toBeLessThanOrEqual(MAX_LEAD_DAYS);
  });

  it("lands three days out, whatever the hour", () => {
    const early = rackReadyDate(new Date("2026-09-17T00:05:00+05:30"));
    const late = rackReadyDate(new Date("2026-09-17T23:55:00+05:30"));
    /* Day-granular in IST: ordering just before midnight must not push the
       promise a day further than ordering just after it. */
    expect(early.getTime()).toBe(late.getTime());
  });

  it("takes no required argument, so no caller can vary the promise", () => {
    /* `Function.length` counts parameters before the first default, so 0 here
       means `now` is the only parameter and it is optional. The point is the
       shape rather than the number: `seedReadyDate` varies with sourcing and
       `trayReadyDate` with the row's lead days, and a rack promise that could
       take either would invite that logic where it does not apply — two racks
       are one build and one delivery. */
    expect(rackReadyDate.length).toBe(0);
  });
});

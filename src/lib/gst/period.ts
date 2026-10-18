import { istDateISO } from "@/lib/delivery-date";

/**
 * GST return periods — SPEC §26.5. Quarterly returns with monthly payment
 * (QRMP), opted in from the first quarter: GSTR-1 and GSTR-3B are filed per
 * quarter, tax is paid by PMT-06 in its first two months.
 *
 * A month is `2026-10`; a quarter is `2627-Q3`, the financial year and the
 * quarter within it (Q1 Apr–Jun … Q4 Jan–Mar), so it cannot be misread as a
 * calendar quarter. Every date is the IST date.
 */

export type MonthId = string;
export type QuarterId = string;

/** Registration took effect 17 Oct 2026; October is the first return month,
 *  and the portal listed no earlier quarter. */
export const GST_FROM_DATE = "2026-10-17";
export const GST_FIRST_MONTH: MonthId = "2026-10";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER = /^(\d{2})(\d{2})-Q([1-4])$/;

export const isMonthId = (s: string): boolean => MONTH.test(s);
export function isQuarterId(s: string): boolean {
  const m = QUARTER.exec(s);
  return !!m && (Number(m[1]) + 1) % 100 === Number(m[2]);
}

/** The IST month an instant falls in. */
export const monthOf = (at: Date | string): MonthId => istDateISO(new Date(at)).slice(0, 7);

/** The month a `YYYY-MM-DD` date falls in. */
export const monthOfDate = (date: string): MonthId => date.slice(0, 7);

export function quarterOf(month: MonthId): QuarterId {
  const [y, m] = month.split("-").map(Number);
  const fy = m >= 4 ? y : y - 1;
  const q = m >= 4 ? Math.ceil((m - 3) / 3) : 4;
  return `${String(fy % 100).padStart(2, "0")}${String((fy + 1) % 100).padStart(2, "0")}-Q${q}`;
}

/** The three months of a quarter, in order. */
export function monthsOf(quarter: QuarterId): [MonthId, MonthId, MonthId] {
  const m = QUARTER.exec(quarter);
  if (!m) throw new Error(`Not a quarter: ${quarter}`);
  const fy = 2000 + Number(m[1]);
  const q = Number(m[3]);
  const first = q === 4 ? { y: fy + 1, m: 1 } : { y: fy, m: 4 + (q - 1) * 3 };
  return [0, 1, 2].map((i) => `${first.y}-${String(first.m + i).padStart(2, "0")}`) as [
    MonthId,
    MonthId,
    MonthId,
  ];
}

export function nextMonth(month: MonthId): MonthId {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Which month of its quarter: 1, 2 or 3. PMT-06 is paid for 1 and 2. */
export const monthIndex = (month: MonthId): 1 | 2 | 3 =>
  (monthsOf(quarterOf(month)).indexOf(month) + 1) as 1 | 2 | 3;

/** The day of the month after `month`, as `YYYY-MM-DD`. */
const dayAfter = (month: MonthId, day: number) => `${nextMonth(month)}-${String(day).padStart(2, "0")}`;

/**
 * When each thing is due. GSTR-1 on the 13th after the quarter, GSTR-3B on
 * the 22nd (Karnataka's group), PMT-06 on the 25th after each of the first
 * two months, and the optional IFF on the 13th after them.
 */
export function dueDates(quarter: QuarterId) {
  const [m1, m2, m3] = monthsOf(quarter);
  return {
    iff: [dayAfter(m1, 13), dayAfter(m2, 13)] as const,
    pmt06: [dayAfter(m1, 25), dayAfter(m2, 25)] as const,
    gstr1: dayAfter(m3, 13),
    gstr3b: dayAfter(m3, 22),
  };
}

/** Every quarter from registration up to the one `today` falls in. */
export function quartersSince(today: string): QuarterId[] {
  const out: QuarterId[] = [];
  const last = quarterOf(monthOfDate(today));
  let month = GST_FIRST_MONTH;
  for (let guard = 0; guard < 600; guard++) {
    const q = quarterOf(month);
    if (!out.includes(q)) out.push(q);
    if (q === last) break;
    month = nextMonth(month);
  }
  return out;
}

/** The portal's return period for a month: `MMYYYY`. For a quarter, its
 *  last month — what the portal shows a quarterly return under. */
export function returnPeriod(month: MonthId): string {
  const [y, m] = month.split("-");
  return `${m}${y}`;
}

/** The month a portal return period names (`102026` → `2026-10`). */
export function monthFromReturnPeriod(rp: string): MonthId | null {
  const m = /^(0[1-9]|1[0-2])(\d{4})$/.exec(rp.trim());
  return m ? `${m[2]}-${m[1]}` : null;
}

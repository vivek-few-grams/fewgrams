import { err, type FormState } from "@/lib/forms";
import type { Sowing, SowingLine } from "@/lib/types";

/**
 * The sowing log — what was sown on a day, and what each variety gave at
 * harvest (the owner, 10 Oct 2026: "how much I am adding … and how much yield
 * I am getting"). Pure, so the screen and its tests share one reading of a
 * form and one set of yield sums.
 *
 * **Yield is harvest grams per seed gram**, a ratio — the one figure that
 * compares a heavy sowing with a light one. Grams per tray is shown beside it
 * when trays were counted, because that is what `/admin/varieties` tunes.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD` — `2026-02-30` is refused. */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole days from sowing to harvest. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function isHarvested(
  line: SowingLine,
): line is SowingLine & { harvestGrams: number; harvestedOn: string } {
  return line.harvestGrams !== undefined && line.harvestedOn !== undefined;
}

/** Whether a line counts towards its variety's yield average — every line
 *  unless its tick was taken off (a tray lost to a mistake or a fungus). */
export function countsForYield(line: SowingLine): boolean {
  return line.countsForYield !== false;
}

/** What the sowing log says a variety grows, from the harvests that count. */
export type LoggedGrowth = {
  /** Harvests averaged: cut, counted, and with their trays recorded. */
  harvests: number;
  trays: number;
  /** Tray-weighted, so a two-tray line weighs twice a one-tray line. */
  seedGramsPerTray: number;
  gramsPerTray: number;
};

/**
 * Each variety's average seed and harvest per tray, across every harvest
 * that counts and recorded its trays (the owner, 7 Nov 2026: "so that I will
 * be able to know the production"). This is what prices a variety and what
 * the subscription tray plan counts trays with — a variety missing here has
 * no proven yield.
 */
export function loggedGrowth(sowings: readonly Sowing[]): Map<string, LoggedGrowth> {
  const sums = new Map<string, { harvests: number; trays: number; seed: number; grams: number }>();
  for (const line of sowings.flatMap((s) => s.lines)) {
    if (!isHarvested(line) || !countsForYield(line) || !line.trays) continue;
    const sum = sums.get(line.varietyKey) ?? { harvests: 0, trays: 0, seed: 0, grams: 0 };
    sum.harvests += 1;
    sum.trays += line.trays;
    sum.seed += line.seedGrams;
    sum.grams += line.harvestGrams;
    sums.set(line.varietyKey, sum);
  }
  return new Map(
    [...sums].map(([key, s]) => [
      key,
      { harvests: s.harvests, trays: s.trays, seedGramsPerTray: s.seed / s.trays, gramsPerTray: s.grams / s.trays },
    ]),
  );
}

/** Harvest grams per seed gram, or null before the harvest. */
export function yieldRatio(line: SowingLine): number | null {
  return isHarvested(line) ? line.harvestGrams / line.seedGrams : null;
}

/** Harvest grams per tray, or null without a harvest or a tray count. */
export function gramsPerTray(line: SowingLine): number | null {
  return isHarvested(line) && line.trays ? line.harvestGrams / line.trays : null;
}

export type VarietyYield = {
  varietyKey: string;
  /** Lines sown, harvested or not. */
  sown: number;
  /** Harvested lines that count — the ones every figure below adds up. */
  harvested: number;
  /** Harvested lines left out of the average (`countsForYield` false). */
  excluded: number;
  /** Seed grams across every line, harvested or not. */
  seedGrams: number;
  /** Seed and harvest grams across harvested lines only, so the ratio never
   *  counts seed whose crop is still growing. */
  harvestedSeedGrams: number;
  harvestGrams: number;
  /** `harvestGrams / harvestedSeedGrams`; null until something is cut. */
  ratio: number | null;
  /** Mean days from sowing to harvest; null until something is cut. */
  meanDays: number | null;
  /** Harvest grams per tray across harvested lines that counted trays —
   *  the figure `/admin/varieties` sets a range for. */
  perTray: number | null;
};

/** Every variety ever sown, with its totals — ordered by key. */
export function yieldByVariety(sowings: Sowing[]): VarietyYield[] {
  const by = new Map<string, VarietyYield & { daySum: number; trayGrams: number; trays: number }>();
  for (const s of sowings) {
    for (const line of s.lines) {
      const v = by.get(line.varietyKey) ?? {
        varietyKey: line.varietyKey,
        sown: 0,
        harvested: 0,
        excluded: 0,
        seedGrams: 0,
        harvestedSeedGrams: 0,
        harvestGrams: 0,
        ratio: null,
        meanDays: null,
        perTray: null,
        daySum: 0,
        trayGrams: 0,
        trays: 0,
      };
      v.sown += 1;
      v.seedGrams += line.seedGrams;
      if (isHarvested(line) && !countsForYield(line)) v.excluded += 1;
      else if (isHarvested(line)) {
        v.harvested += 1;
        v.harvestedSeedGrams += line.seedGrams;
        v.harvestGrams += line.harvestGrams;
        v.daySum += daysBetween(s.sowDate, line.harvestedOn);
        if (line.trays) {
          v.trays += line.trays;
          v.trayGrams += line.harvestGrams;
        }
      }
      by.set(line.varietyKey, v);
    }
  }
  return [...by.values()]
    .map(({ daySum, trayGrams, trays, ...v }) => ({
      ...v,
      ratio: v.harvested ? v.harvestGrams / v.harvestedSeedGrams : null,
      meanDays: v.harvested ? daySum / v.harvested : null,
      perTray: trays ? trayGrams / trays : null,
    }))
    .sort((a, b) => a.varietyKey.localeCompare(b.varietyKey));
}

/**
 * What saving a sowing does to the seed shelf (the owner, 18 Oct 2026: the
 * seed sown comes off the stock the shop sells from) — grams to take per
 * seed key, negative to put back, when its lines go from `before` to
 * `after`. A new sowing is `seedChange({}, [], lines)`; a deleted one
 * `seedChange(taken, lines, [])`.
 *
 * **An edit moves the shelf by the change in grams sown**, and by nothing
 * else (31 Oct 2026). It was measured from what the sowing had `taken`, so a
 * shortfall — 50 g sown with 30 g on the shelf — was asked for again on every
 * later edit, after the owner had already put the count right by stocktake.
 * A variety whose seed row did not exist when it was sown (so took nothing)
 * likewise takes nothing until its grams change.
 *
 * **Never puts back more than came off**: a reduction returns the grams no
 * longer sown, up to what the sowing has `taken` of that seed, and a seed no
 * longer sown at all returns all of it — so deleting a sowing returns
 * exactly what it took.
 *
 * Keyed by the variety's content key, because a microgreen is sown from the
 * seed of the same key — `radish` from `radish`. A variety with no seed row
 * (wheatgrass) moves nothing; the caller skips it.
 */
export function seedChange(
  taken: Readonly<Record<string, number>>,
  before: readonly SowingLine[],
  after: readonly SowingLine[],
): Map<string, number> {
  const sown = (lines: readonly SowingLine[]) => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.varietyKey, (m.get(l.varietyKey) ?? 0) + l.seedGrams);
    return m;
  };
  const was = sown(before);
  const now = sown(after);
  const out = new Map<string, number>();
  for (const k of new Set([...Object.keys(taken), ...was.keys(), ...now.keys()])) {
    const had = taken[k] ?? 0;
    const delta = (now.get(k) ?? 0) - (was.get(k) ?? 0);
    const grams = !now.has(k) ? -had : delta < 0 ? Math.max(delta, -had) : delta;
    if (Math.abs(grams) >= 1e-9) out.set(k, grams);
  }
  return out;
}

/* ───────────────────────── reading the form ───────────────────────── */

/**
 * The form posts one value per line for each of `varietyKey`, `seedGrams`,
 * `trays`, `harvestGrams`, `harvestedOn` and `countsForYield`, in row order.
 * The new-sowing form has no harvest columns, so those arrays come back empty
 * and read as blank — and a harvest is counted unless its row posts "0". A row left wholly blank — an extra "add another" nobody filled — is
 * dropped rather than refused.
 *
 * Errors name the field as `<name>.<row>` so the editor can mark the input,
 * and carry the row number (1-based) for the message.
 */
export function readSowing(
  fd: FormData,
  opts: {
    /** Content keys a line may name. */
    varietyKeys: ReadonlySet<string>;
    /** Today, `YYYY-MM-DD` IST — nothing is sown or cut in the future. */
    today: string;
  },
): { ok: true; sowDate: string; lines: SowingLine[] } | { ok: false; state: FormState } {
  const sowDate = String(fd.get("sowDate") ?? "").trim();
  if (!isIsoDate(sowDate)) return { ok: false, state: err("dateInvalid", "sowDate") };
  if (sowDate > opts.today) return { ok: false, state: err("dateFuture", "sowDate") };

  const col = (name: string) => fd.getAll(name).map((v) => String(v).trim());
  const keys = col("varietyKey");
  const seeds = col("seedGrams");
  const trays = col("trays");
  const harvests = col("harvestGrams");
  const cutOn = col("harvestedOn");
  /* One hidden "1" or "0" per row beside the visible tick, so the column
     lines up with the others — an unticked checkbox posts nothing. */
  const counted = col("countsForYield");

  const lines: SowingLine[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] ?? "";
    const seed = seeds[i] ?? "";
    const tray = trays[i] ?? "";
    const harvest = harvests[i] ?? "";
    const on = cutOn[i] ?? "";
    if (!key && !seed && !tray && !harvest && !on) continue;

    const row = { row: String(i + 1) };
    const fail = (code: string, field: string) => ({
      ok: false as const,
      state: err(code, `${field}.${i}`, row),
    });

    if (!opts.varietyKeys.has(key)) return fail("varietyRequired", "varietyKey");

    const seedGrams = Number(seed);
    if (!seed || !Number.isFinite(seedGrams) || seedGrams <= 0) return fail("seedInvalid", "seedGrams");

    const line: SowingLine = { varietyKey: key, seedGrams };

    if (tray) {
      const n = Number(tray);
      if (!Number.isInteger(n) || n < 1) return fail("traysInvalid", "trays");
      line.trays = n;
    }

    if (harvest) {
      const n = Number(harvest);
      /* Zero is allowed: a failed tray is worth recording. */
      if (!Number.isFinite(n) || n < 0) return fail("harvestInvalid", "harvestGrams");
      /* Blank date with a weight means "cut today" — the usual case. */
      const date = on || opts.today;
      if (!isIsoDate(date)) return fail("harvestDateInvalid", "harvestedOn");
      if (date < sowDate) return fail("harvestBeforeSow", "harvestedOn");
      if (date > opts.today) return fail("dateFuture", "harvestedOn");
      line.harvestGrams = n;
      line.harvestedOn = date;
      if (counted[i] === "0") line.countsForYield = false;
    } else if (on) {
      return fail("harvestDateWithoutGrams", "harvestGrams");
    }

    lines.push(line);
  }

  if (lines.length === 0) return { ok: false, state: err("noLines") };
  return { ok: true, sowDate, lines };
}

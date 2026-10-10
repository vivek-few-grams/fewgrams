import { describe, expect, it } from "vitest";
import { BRUSH_RADIUS, brush, createField, isSettled, packField, stepField, wave, WAVE_LIFE } from "./field";

const RECT = { minX: -2, minZ: -1, width: 4, depth: 2 };
const DT = 1 / 120;

function cellAt(nx: number, nz: number, x: number, z: number) {
  const i = Math.floor(((x - RECT.minX) / RECT.width) * nx);
  const j = Math.floor(((z - RECT.minZ) / RECT.depth) * nz);
  return (j * nx + i) * 2;
}

function run(seconds: number, f: ReturnType<typeof createField>, each?: () => void) {
  for (let s = 0; s < seconds / DT; s++) {
    each?.();
    stepField(f, DT);
  }
}

describe("tray field", () => {
  it("bends along a swipe, overshoots upright, then settles", () => {
    const f = createField(64, 32, RECT);
    const c = cellAt(64, 32, 0, 0);
    /* A quick swipe to +x through the centre: a fifth of a second. */
    for (let s = 0; s < 24; s++) {
      brush(f, -0.6 + s * 0.05, 0, 6, 0, DT);
      stepField(f, DT);
    }
    let peak = 0;
    let wentNegative = false;
    run(3, f, () => {
      peak = Math.max(peak, f.bend[c]);
      if (f.bend[c] < -0.01) wentNegative = true;
    });
    expect(peak).toBeGreaterThan(0.2);
    /* Springy, not mushy — it swings past upright at least once. */
    expect(wentNegative).toBe(true);
    expect(isSettled(f)).toBe(true);
  });

  it("bends further for a fast swipe than a slow one", () => {
    const peakFor = (speed: number) => {
      const f = createField(64, 32, RECT);
      const c = cellAt(64, 32, 0, 0);
      const steps = Math.ceil(1.2 / speed / DT);
      let peak = 0;
      for (let s = 0; s < steps + 120; s++) {
        if (s < steps) brush(f, -0.6 + s * speed * DT, 0, speed, 0, DT);
        stepField(f, DT);
        peak = Math.max(peak, f.bend[c]);
      }
      return peak;
    };
    expect(peakFor(8)).toBeGreaterThan(peakFor(1.5) * 2);
  });

  it("parts the stems under a resting hand and holds them parted", () => {
    const f = createField(64, 32, RECT);
    const right = cellAt(64, 32, BRUSH_RADIUS / 2, 0);
    const left = cellAt(64, 32, -BRUSH_RADIUS / 2, 0);
    run(2, f, () => brush(f, 0, 0, 0, 0, DT));
    expect(f.bend[right]).toBeGreaterThan(0.05);
    expect(f.bend[left]).toBeLessThan(-0.05);
    expect(isSettled(f)).toBe(false);
  });

  it("never bends a stem past the limit, however hard it is swiped", () => {
    const f = createField(64, 32, RECT);
    run(2, f, () => brush(f, 0, 0, 100, 100, DT));
    for (let c = 0; c < f.bend.length; c += 2) {
      expect(Math.hypot(f.bend[c], f.bend[c + 1])).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("runs a click's wave outward over a small patch, then settles", () => {
    const f = createField(64, 32, RECT);
    const near = cellAt(64, 32, 0.2, 0);
    const far = cellAt(64, 32, 1.5, 0);
    let nearPeak = 0;
    let farPeak = 0;
    let age = 0;
    run(3, f, () => {
      wave(f, 0, 0, age, DT);
      age += DT;
      nearPeak = Math.max(nearPeak, f.bend[near]);
      farPeak = Math.max(farPeak, Math.abs(f.bend[far]));
    });
    /* Bowed outward (+x on the right of the click); far off, barely. */
    expect(nearPeak).toBeGreaterThan(0.05);
    expect(farPeak).toBeLessThan(nearPeak * 0.2);
    expect(isSettled(f)).toBe(true);
  });

  it("keeps a wave inside the bounds it is given", () => {
    const f = createField(64, 32, RECT);
    const outside = cellAt(64, 32, 0.3, 0);
    let age = 0;
    for (let s = 0; s < WAVE_LIFE / DT; s++) {
      wave(f, 0, 0, age, DT, { minX: -2, maxX: 0, minZ: -1, maxZ: 1 });
      age += DT;
    }
    expect(f.vel[outside]).toBe(0);
  });

  it("does nothing once a wave has run its course", () => {
    const f = createField(16, 8, RECT);
    wave(f, 0, 0, WAVE_LIFE, DT);
    expect(f.vel.every((v) => v === 0)).toBe(true);
  });

  it("ignores a hand outside the trays", () => {
    const f = createField(64, 32, RECT);
    brush(f, 10, 10, 5, 5, DT);
    expect(f.vel.every((v) => v === 0)).toBe(true);
  });

  it("packs upright and still as mid-grey with no flutter", () => {
    const f = createField(4, 2, RECT);
    const out = new Uint8Array(4 * 2 * 4);
    packField(f, out);
    expect([...out.slice(0, 4)]).toEqual([128, 128, 0, 255]);
  });
});

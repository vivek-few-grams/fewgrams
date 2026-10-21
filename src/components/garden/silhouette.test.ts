import { describe, expect, it } from "vitest";
import { Silhouette } from "./silhouette";

/** The path's pieces as polygons. Reads only what `path()` writes. */
function polygons(d: string) {
  const out: [number, number][][] = [];
  let poly: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/\s+/).map(Number) : [];
    if (cmd === "M") {
      poly = [];
      [x, y] = n;
    } else if (cmd === "L") [x, y] = n;
    else if (cmd === "H") x = n[0];
    else if (cmd === "V") y = n[0];
    if (cmd === "Z") out.push(poly);
    else poly.push([x, y]);
  }
  return out;
}

/** How many pieces cover a point. */
function cover(d: string, px: number, py: number) {
  let count = 0;
  for (const poly of polygons(d)) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) count++;
  }
  return count;
}

const square = (s: Silhouette, x0: number, y0: number, x1: number, y1: number) => {
  s.triangle(x0, y0, x1, y0, x1, y1);
  s.triangle(x0, y0, x1, y1, x0, y1);
};

describe("the silhouette a prop cuts in the frame", () => {
  it("is nothing when nothing is in front", () => {
    const s = new Silhouette();
    s.reset(0, 100, 2);
    expect(s.path()).toBe("");
  });

  it("cuts two overlapping parts once, so the even-odd rule never fills the overlap back in", () => {
    const s = new Silhouette();
    s.reset(-10, 110, 2);
    square(s, 10, 10, 60, 60);
    square(s, 40, 40, 90, 90);
    const d = s.path();
    for (const [x, y] of [
      [20, 20],
      [50, 50],
      [80, 80],
      [55, 45],
    ])
      expect(cover(d, x, y), `${x},${y}`).toBe(1);
    for (const [x, y] of [
      [80, 20],
      [20, 80],
      [5, 5],
      [95, 95],
    ])
      expect(cover(d, x, y), `${x},${y}`).toBe(0);
  });

  it("follows a slanted edge between scan lines instead of squaring it off", () => {
    const s = new Silhouette();
    s.reset(0, 100, 4);
    s.triangle(10, 10, 90, 10, 10, 90);
    const d = s.path();
    /* Just inside and just outside the hypotenuse, mid-band. */
    expect(cover(d, 48, 50)).toBe(1);
    expect(cover(d, 52, 50)).toBe(0);
  });

  it("leaves the hole in a loop uncut, as a handle's", () => {
    const s = new Silhouette();
    s.reset(0, 100, 2);
    /* A square ring, 20 to 80 with a 40 to 60 hole, from four bars. */
    square(s, 20, 20, 80, 40);
    square(s, 20, 60, 80, 80);
    square(s, 20, 40, 40, 60);
    square(s, 60, 40, 80, 60);
    const d = s.path();
    expect(cover(d, 50, 50)).toBe(0);
    for (const [x, y] of [
      [30, 30],
      [50, 30],
      [30, 50],
      [70, 50],
      [50, 70],
    ])
      expect(cover(d, x, y), `${x},${y}`).toBe(1);
  });

  it("starts and stops a piece at its own corners, not a whole scan line early", () => {
    const s = new Silhouette();
    s.reset(0, 100, 10);
    square(s, 20, 23, 80, 67);
    const d = s.path();
    expect(cover(d, 50, 24)).toBe(1);
    expect(cover(d, 50, 22)).toBe(0);
    expect(cover(d, 50, 66)).toBe(1);
    expect(cover(d, 50, 68)).toBe(0);
  });
});

/**
 * The outline of whatever stands in front of the wall frame, as the camera
 * sees it, for cutting the frame round it (`cutFrame` in `scene.ts`).
 *
 * The frame used to be cut by the convex hull of each prop's bounding
 * boxes — but a box round a loop handle, a curved spout or a round bowl is
 * far bigger than the thing in it, and bare wall showed through the frame
 * round every one (the owner, 21 Oct 2026). This is the real outline: each
 * triangle is laid across horizontal scan lines `step` pixels apart, the
 * spans on each line are merged, and the spans of neighbouring lines are
 * joined into polygons. No two pieces overlap, so an even-odd path cuts
 * each exactly once — which a set of overlapping hulls cannot do, since
 * where two overlap the rule fills the frame back in.
 *
 * Between two lines a piece's edges are taken as straight. Where a piece
 * begins or ends between them, or two meet, the band is cut square instead,
 * from the triangles' own corners where the piece starts or stops — a
 * pixel or two of wall at most, never a patch.
 */
export class Silhouette {
  private y0 = 0;
  private step = 2;
  /** How many scan lines; bands are the gaps between them, one fewer. */
  private n = 0;
  /** Per line, every triangle's span across it, unmerged: [l, r, l, r, …]. */
  private spans: number[][] = [];
  /** Per line, the spans merged, left to right. */
  private merged: number[][] = [];
  /** Per band, the highest and lowest triangle corner inside it. */
  private hi: number[] = [];
  private lo: number[] = [];
  private order: number[] = [];

  /** Start again, with lines from `y0` down to `y1`, `step` pixels apart. */
  reset(y0: number, y1: number, step: number) {
    this.y0 = y0;
    this.step = step;
    this.n = Math.max(0, Math.floor((y1 - y0) / step) + 1);
    for (let k = 0; k < this.n; k++) {
      (this.spans[k] ??= []).length = 0;
      this.hi[k] = Infinity;
      this.lo[k] = -Infinity;
    }
  }

  /** Add one triangle, in the same pixels as the lines. */
  triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
    let t: number;
    /* Sorted top to bottom: a, then b, then c. */
    if (ay > by) {
      t = ax;
      ax = bx;
      bx = t;
      t = ay;
      ay = by;
      by = t;
    }
    if (by > cy) {
      t = bx;
      bx = cx;
      cx = t;
      t = by;
      by = cy;
      cy = t;
    }
    if (ay > by) {
      t = ax;
      ax = bx;
      bx = t;
      t = ay;
      ay = by;
      by = t;
    }
    this.corner(ay);
    this.corner(by);
    this.corner(cy);
    const { y0, step } = this;
    const k0 = Math.max(0, Math.ceil((ay - y0) / step));
    const k1 = Math.min(this.n - 1, Math.floor((cy - y0) / step));
    for (let k = k0; k <= k1; k++) {
      const y = y0 + k * step;
      let p: number;
      let q: number;
      if (cy === ay) {
        /* Flat on the line. */
        p = Math.min(ax, bx, cx);
        q = Math.max(ax, bx, cx);
      } else {
        /* The long edge a–c, and whichever short edge the line crosses. */
        p = ax + ((cx - ax) * (y - ay)) / (cy - ay);
        if (y < by) q = ax + ((bx - ax) * (y - ay)) / (by - ay);
        else q = by === cy ? bx : bx + ((cx - bx) * (y - by)) / (cy - by);
      }
      this.spans[k].push(Math.min(p, q), Math.max(p, q));
    }
  }

  private corner(y: number) {
    const b = Math.floor((y - this.y0) / this.step);
    if (b < 0 || b >= this.n - 1) return;
    if (y < this.hi[b]) this.hi[b] = y;
    if (y > this.lo[b]) this.lo[b] = y;
  }

  /** Every piece, as SVG path data (empty if there is nothing). */
  path(): string {
    const { n, y0, step } = this;
    for (let k = 0; k < n; k++) this.merge(k);
    let out = "";
    const f = (v: number) => v.toFixed(1);
    const rect = (l: number, r: number, top: number, bottom: number) => {
      if (bottom - top > 0.05) out += `M${f(l)} ${f(top)}H${f(r)}V${f(bottom)}H${f(l)}Z`;
    };
    /* A piece followed down through the bands it keeps its shape in: its
       left edge, top down, and its right edge, top down. */
    let chains: { left: number[]; right: number[] }[] = [];
    const start = (k: number) => {
      const A = this.merged[k];
      const y = y0 + k * step;
      chains = [];
      for (let i = 0; i < A.length; i += 2) chains.push({ left: [A[i], y], right: [A[i + 1], y] });
    };
    const close = () => {
      for (const { left, right } of chains) {
        if (left.length < 4) continue;
        out += "M" + f(left[0]) + " " + f(left[1]);
        for (let i = 2; i < left.length; i += 2) out += "L" + f(left[i]) + " " + f(left[i + 1]);
        for (let i = right.length - 2; i >= 0; i -= 2) out += "L" + f(right[i]) + " " + f(right[i + 1]);
        out += "Z";
      }
      chains = [];
    };
    if (n > 0) start(0);
    for (let k = 0; k < n - 1; k++) {
      const A = this.merged[k];
      const B = this.merged[k + 1];
      const top = y0 + k * step;
      const bottom = top + step;
      if (A.length === 0 && B.length === 0) continue;
      if (this.same(A, B)) {
        for (let i = 0; i < B.length; i += 2) {
          chains[i / 2].left.push(B[i], bottom);
          chains[i / 2].right.push(B[i + 1], bottom);
        }
        continue;
      }
      close();
      if (A.length === 0) {
        /* Pieces beginning: from their highest corner. */
        const from = Math.max(top, this.hi[k]);
        for (let i = 0; i < B.length; i += 2) rect(B[i], B[i + 1], from, bottom);
      } else if (B.length === 0) {
        /* Pieces ending: to their lowest corner. */
        const to = Math.min(bottom, this.lo[k]);
        for (let i = 0; i < A.length; i += 2) rect(A[i], A[i + 1], top, to);
      } else {
        /* Pieces meeting, parting, beginning or ending side by side: the
           whole band under both lines' spans. */
        const both = unite(A, B);
        for (let i = 0; i < both.length; i += 2) rect(both[i], both[i + 1], top, bottom);
      }
      start(k + 1);
    }
    close();
    return out;
  }

  /** The same pieces on both lines, in the same order, each overlapping
   *  itself — so each can be joined straight across the band. */
  private same(A: number[], B: number[]) {
    if (A.length !== B.length) return false;
    for (let i = 0; i < A.length; i += 2) if (A[i] > B[i + 1] || B[i] > A[i + 1]) return false;
    return true;
  }

  private merge(k: number) {
    const s = this.spans[k];
    const out = (this.merged[k] ??= []);
    out.length = 0;
    if (!s || s.length === 0) return;
    const order = this.order;
    order.length = s.length / 2;
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => s[2 * a] - s[2 * b]);
    let l = s[2 * order[0]];
    let r = s[2 * order[0] + 1];
    for (let i = 1; i < order.length; i++) {
      const nl = s[2 * order[i]];
      const nr = s[2 * order[i] + 1];
      /* Spans half a pixel apart are one: the gap is a seam, not a hole. */
      if (nl <= r + 0.5) r = Math.max(r, nr);
      else {
        out.push(l, r);
        l = nl;
        r = nr;
      }
    }
    out.push(l, r);
  }
}

/** Two lines' merged spans as one merged list. */
function unite(A: number[], B: number[]) {
  const all: [number, number][] = [];
  for (let i = 0; i < A.length; i += 2) all.push([A[i], A[i + 1]]);
  for (let i = 0; i < B.length; i += 2) all.push([B[i], B[i + 1]]);
  all.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [l, r] of all) {
    if (out.length && l <= out[out.length - 1]) out[out.length - 1] = Math.max(out[out.length - 1], r);
    else out.push(l, r);
  }
  return out;
}

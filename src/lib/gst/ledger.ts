/**
 * The electronic ledgers — SPEC §26.5. Every amount in paise, by tax head.
 *
 * `setOff` is the order the law lets credit pay tax in (CGST Act s.49(5),
 * CGST Rules 88A): IGST credit first, against IGST and then CGST and SGST in
 * any proportion; only once it is used up, CGST credit against CGST then
 * IGST, and SGST credit against SGST then IGST. CGST credit can never pay
 * SGST, nor SGST credit CGST — which is why the order matters: spend IGST
 * credit where the head's own credit falls short, and less cash is needed.
 */

export type Heads = { igst: number; cgst: number; sgst: number };

export const HEADS = ["igst", "cgst", "sgst"] as const;
export type Head = (typeof HEADS)[number];

export const ZERO: Heads = { igst: 0, cgst: 0, sgst: 0 };

export const addHeads = (...hs: Heads[]): Heads =>
  hs.reduce((a, h) => ({ igst: a.igst + h.igst, cgst: a.cgst + h.cgst, sgst: a.sgst + h.sgst }), ZERO);

export const subHeads = (a: Heads, b: Heads): Heads => ({
  igst: a.igst - b.igst,
  cgst: a.cgst - b.cgst,
  sgst: a.sgst - b.sgst,
});

export const scaleHeads = (h: Heads, f: number): Heads => ({
  igst: Math.round(h.igst * f),
  cgst: Math.round(h.cgst * f),
  sgst: Math.round(h.sgst * f),
});

export const sumHeads = (h: Heads) => h.igst + h.cgst + h.sgst;

/** Never below zero, head by head. */
export const floorHeads = (h: Heads): Heads => ({
  igst: Math.max(0, h.igst),
  cgst: Math.max(0, h.cgst),
  sgst: Math.max(0, h.sgst),
});

/** How much of each credit head paid each tax head — GSTR-3B table 6.1. */
export type Utilisation = Record<Head, Heads>;

export type SetOff = {
  /** `used.igst.cgst` is IGST credit spent on CGST. */
  used: Utilisation;
  /** Tax left to pay in cash. */
  cash: Heads;
  /** Credit carried forward. */
  leftover: Heads;
};

export function setOff(liability: Heads, credit: Heads): SetOff {
  const L = floorHeads(liability);
  const C = floorHeads(credit);
  const used: Utilisation = { igst: { ...ZERO }, cgst: { ...ZERO }, sgst: { ...ZERO } };
  const spend = (from: Head, to: Head, cap = Infinity) => {
    const n = Math.min(C[from], L[to], cap);
    if (n <= 0) return;
    C[from] -= n;
    L[to] -= n;
    used[from][to] += n;
  };

  spend("igst", "igst");
  /* What CGST and SGST credit cannot cover first, then the rest. */
  spend("igst", "cgst", Math.max(0, L.cgst - C.cgst));
  spend("igst", "sgst", Math.max(0, L.sgst - C.sgst));
  spend("igst", "cgst");
  spend("igst", "sgst");
  spend("cgst", "cgst");
  spend("cgst", "igst");
  spend("sgst", "sgst");
  spend("sgst", "igst");

  return { used, cash: L, leftover: C };
}

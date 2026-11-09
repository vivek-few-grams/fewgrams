import { describe, expect, it } from "vitest";
import type { BillMatch, PurchaseBill, PurchaseLine } from "./bill";
import { agreesWithPortal, carriedStanding, duplicateBill, rematch, sameInvoice } from "./portal";

const vendor = (id: string, gstin: string | null = "29AABCT1332L1ZA") => ({
  id,
  name: "Tray Co",
  kind: "registered" as const,
  gstin,
  state: null,
});

const entered = (id: string, number: string, date: string, vendorId = "v1") => ({
  id,
  vendor: vendor(vendorId),
  number,
  date,
});

describe("duplicateBill", () => {
  const register = [
    entered("a", "INV/26-27/0012", "2026-10-20"),
    entered("b", "INV/26-27/0013", "2026-10-21"),
  ];

  it("finds the same vendor's number entered again, however it is punctuated", () => {
    expect(duplicateBill(entered("", "inv 26-27 0012", "2026-11-02"), register)?.id).toBe("a");
    expect(duplicateBill(entered("", "INV/26-27/0012", "2026-10-20"), register)?.id).toBe("a");
  });

  it("is not a clash with itself, with another vendor, or with another number", () => {
    expect(duplicateBill(entered("a", "INV/26-27/0012", "2026-10-20"), register)).toBeNull();
    expect(duplicateBill(entered("", "INV/26-27/0012", "2026-10-20", "v2"), register)).toBeNull();
    expect(duplicateBill(entered("", "INV/26-27/0014", "2026-10-20"), register)).toBeNull();
  });

  it("allows the same number in another financial year, which starts on 1 April", () => {
    const series = [entered("a", "7", "2026-03-31")];
    /* 31 Mar and 1 Apr are a year apart in a vendor's numbering. */
    expect(duplicateBill(entered("", "7", "2026-04-01"), series)).toBeNull();
    expect(duplicateBill(entered("", "7", "2025-04-01"), series)?.id).toBe("a");
    expect(duplicateBill(entered("", "7", "2027-04-01"), series)).toBeNull();
  });

  it("refuses an edit that renumbers a bill onto another one", () => {
    /* Bill b corrected to a's number. */
    expect(duplicateBill(entered("b", "INV/26-27/0012", "2026-10-21"), register)?.id).toBe("a");
  });

  it("keys on the kind too: a vendor's bill 12 and credit note 12 are two series", () => {
    const note = { ...entered("", "INV/26-27/0012", "2026-11-02"), doc: "creditNote" as const };
    expect(duplicateBill(note, register)).toBeNull();
    /* A row from before credit notes has no `doc` and is a bill. */
    expect(duplicateBill({ ...note, doc: "bill" as const }, register)?.id).toBe("a");
    const notes = [{ ...entered("n", "CN-4", "2026-11-02"), doc: "creditNote" as const }];
    expect(
      duplicateBill({ ...entered("", "cn 4", "2026-12-01"), doc: "creditNote" as const }, notes)?.id,
    ).toBe("n");
    expect(duplicateBill(entered("", "CN-4", "2026-12-01"), notes)).toBeNull();
  });
});

describe("sameInvoice", () => {
  it("compares the GSTIN and the number as GSTR-2B does", () => {
    const a = { gstin: "29AABCT1332L1ZA", number: "INV/0012" };
    expect(sameInvoice(a, { gstin: "29aabct1332l1za", number: "inv-0012" })).toBe(true);
    expect(sameInvoice(a, { gstin: "27AAPFU0939F1ZV", number: "INV/0012" })).toBe(false);
    expect(sameInvoice(a, { gstin: "29AABCT1332L1ZA", number: "INV/0021" })).toBe(false);
    expect(sameInvoice(a, { gstin: null, number: "INV/0012" })).toBe(false);
  });
});

describe("carriedStanding", () => {
  const match: BillMatch = {
    month: "2026-10",
    status: "matched",
    portal: { taxable: 100000, igst: 0, cgst: 9000, sgst: 9000 },
  };
  const stored = (claim: PurchaseBill["claim"]) => ({
    vendor: vendor("v1"),
    number: "INV/0012",
    claim,
    match,
  });
  const fromPortal = { month: "2026-10", source: "gstr2b" as const };
  const byHand = { month: "2026-11", source: "manual" as const };

  it("keeps the claim and match while the GSTIN and number name the same invoice", () => {
    expect(carriedStanding(stored(fromPortal), { gstin: "29AABCT1332L1ZA", number: "inv 0012" })).toEqual({
      claim: fromPortal,
      match,
      withdrawnAt: null,
    });
  });

  it("drops a GSTR-2B claim and the match when the number or the vendor's GSTIN changes", () => {
    expect(carriedStanding(stored(fromPortal), { gstin: "29AABCT1332L1ZA", number: "INV/0021" })).toEqual({
      claim: null,
      match: null,
      withdrawnAt: null,
    });
    expect(carriedStanding(stored(fromPortal), { gstin: "27AAPFU0939F1ZV", number: "INV/0012" })).toEqual({
      claim: null,
      match: null,
      withdrawnAt: null,
    });
  });

  it("keeps a claim made by hand, which is the owner's", () => {
    expect(carriedStanding(stored(byHand), { gstin: "27AAPFU0939F1ZV", number: "INV/0012" })).toEqual({
      claim: byHand,
      match: null,
      withdrawnAt: null,
    });
  });

  it("carries nothing onto a new bill", () => {
    expect(carriedStanding(null, { gstin: "29AABCT1332L1ZA", number: "INV/0012" })).toEqual({
      claim: null,
      match: null,
      withdrawnAt: null,
    });
  });

  it("keeps a withdrawal while the invoice is the same, and drops it when the GSTIN or number changes", () => {
    const withdrawn = { ...stored(null), withdrawnAt: "2026-11-05T10:00:00.000Z" };
    /* Adding the paid-on date re-saves the same invoice: still withdrawn. */
    expect(carriedStanding(withdrawn, { gstin: "29AABCT1332L1ZA", number: "INV/0012" }).withdrawnAt).toBe(
      "2026-11-05T10:00:00.000Z",
    );
    /* Another number or GSTIN names another invoice — the withdrawal was
       not about that one. */
    expect(
      carriedStanding(withdrawn, { gstin: "29AABCT1332L1ZA", number: "INV/0021" }).withdrawnAt,
    ).toBeNull();
    expect(
      carriedStanding(withdrawn, { gstin: "27AAPFU0939F1ZV", number: "INV/0012" }).withdrawnAt,
    ).toBeNull();
    /* A row from before withdrawals were recorded reads as none. */
    expect(
      carriedStanding(stored(null), { gstin: "29AABCT1332L1ZA", number: "INV/0012" }).withdrawnAt,
    ).toBeNull();
  });

  it("carries nothing when a bill is corrected into a credit note, or back — not even a claim by hand", () => {
    const next = { gstin: "29AABCT1332L1ZA", number: "INV/0012" };
    const withdrawn = { ...stored(byHand), withdrawnAt: "2026-11-05T10:00:00.000Z" };
    expect(carriedStanding(withdrawn, { ...next, doc: "creditNote" })).toEqual({
      claim: null,
      match: null,
      withdrawnAt: null,
    });
    expect(carriedStanding({ ...stored(fromPortal), doc: "creditNote" }, next)).toEqual({
      claim: null,
      match: null,
      withdrawnAt: null,
    });
    /* A credit note re-saved as one keeps its standing. */
    expect(
      carriedStanding({ ...stored(fromPortal), doc: "creditNote" }, { ...next, doc: "creditNote" }).claim,
    ).toEqual(fromPortal);
  });
});

describe("rematch", () => {
  const line = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
    category: "stock",
    item: null,
    description: "Trays",
    quantity: null,
    taxable: 100000,
    rate: 18,
    igst: 0,
    cgst: 9000,
    sgst: 9000,
    credit: "full",
    ...over,
  });
  const match: BillMatch = {
    month: "2026-10",
    status: "matched",
    portal: { taxable: 100000, igst: 0, cgst: 9000, sgst: 9000 },
  };

  it("matches within a rupee on each head", () => {
    expect(rematch(match, [line({ cgst: 9050, sgst: 8960 })])?.status).toBe("matched");
    expect(rematch(match, [line({ taxable: 100100 })])?.status).toBe("matched");
  });

  it("is a mismatch when the vendor reported IGST where the bill has CGST + SGST, though the total agrees", () => {
    const igst = { ...match, portal: { taxable: 100000, igst: 18000, cgst: 0, sgst: 0 } };
    expect(rematch(igst, [line()])?.status).toBe("mismatch");
    expect(agreesWithPortal([line({ igst: 18000, cgst: 0, sgst: 0 })], igst.portal)).toBe(true);
  });

  it("is a mismatch when the value or the tax is off by more than a rupee", () => {
    expect(rematch(match, [line({ taxable: 100101 })])?.status).toBe("mismatch");
    expect(rematch(match, [line({ cgst: 9101 })])?.status).toBe("mismatch");
  });

  it("leaves a bill with no match unmatched", () => {
    expect(rematch(null, [line()])).toBeNull();
  });
});

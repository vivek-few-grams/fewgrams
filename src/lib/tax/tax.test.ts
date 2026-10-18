import { describe, expect, it } from "vitest";
import { CART_KINDS } from "@/lib/cart/cart";
import { taxClassFor } from "./classes";
import { gstinCheckDigit, gstinStateCode, isValidGstin, normaliseGstin } from "./gstin";
import {
  financialYear,
  formatCreditNoteNo,
  formatInvoiceNo,
  orderTax,
  shareByWeight,
  splitInclusive,
  subscriptionTax,
  taxTotals,
  totalsByRate,
} from "./order-tax";
import { HOME_STATE, gstStateFor, placeOfSupply } from "./states";

describe("GSTIN", () => {
  it("accepts ours and rejects a one-character slip", () => {
    expect(isValidGstin("29HTUPS6000Q1ZI")).toBe(true);
    expect(isValidGstin("29HTUPS6000Q1ZJ")).toBe(false);
    expect(isValidGstin("29HTUPS6001Q1ZI")).toBe(false);
    expect(isValidGstin("29HTUPS6000Q1Z")).toBe(false);
  });

  it("accepts a published example from another state", () => {
    // GSTN's own worked example of the check digit.
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(gstinStateCode("27AAPFU0939F1ZV")).toBe("27");
  });

  it("is typed loosely and stored tightly", () => {
    expect(normaliseGstin(" 29htups 6000q1zi ")).toBe("29HTUPS6000Q1ZI");
  });
});

describe("place of supply", () => {
  it("places a state however India Post or a customer spells it", () => {
    expect(gstStateFor("Karnataka")?.code).toBe("29");
    expect(gstStateFor("TAMIL NADU")?.code).toBe("33");
    expect(gstStateFor("Jammu & Kashmir")?.code).toBe("01");
    expect(gstStateFor("Orissa")?.code).toBe("21");
    expect(gstStateFor("Andaman and Nicobar Islands")?.code).toBe("35");
    expect(gstStateFor("Atlantis")).toBeNull();
  });

  it("lets the PIN settle Karnataka, so a misspelt state cannot change the tax", () => {
    expect(placeOfSupply({ state: "Karnatka", pincode: "560079" })).toEqual(HOME_STATE);
    expect(placeOfSupply({ state: "Tamil Nadu", pincode: "591101" })).toEqual(HOME_STATE);
    expect(placeOfSupply({ state: "Tamil Nadu", pincode: "600001" })?.code).toBe("33");
    /* Karnataka named against a PIN outside it: unplaced, for a person to
       look at, never a quiet CGST + SGST. */
    expect(placeOfSupply({ state: "Karnataka", pincode: "600001" })).toBeNull();
    expect(placeOfSupply({ state: "", pincode: "400001" })).toBeNull();
  });
});

describe("splitInclusive", () => {
  it("backs the tax out of the price", () => {
    expect(splitInclusive(10000, 18, false)).toEqual({ taxable: 8475, cgst: 0, sgst: 0, igst: 1525 });
    expect(splitInclusive(10000, 5, false)).toEqual({ taxable: 9524, cgst: 0, sgst: 0, igst: 476 });
    expect(splitInclusive(10000, 0, true)).toEqual({ taxable: 10000, cgst: 0, sgst: 0, igst: 0 });
  });

  it("halves it within Karnataka, the odd paisa to CGST", () => {
    expect(splitInclusive(10000, 18, true)).toEqual({ taxable: 8475, cgst: 763, sgst: 762, igst: 0 });
  });

  it("always adds back to the gross", () => {
    for (let gross = 1; gross < 50000; gross += 37) {
      for (const rate of [0, 5, 18]) {
        for (const intra of [true, false]) {
          const s = splitInclusive(gross, rate, intra);
          expect(s.taxable + s.cgst + s.sgst + s.igst).toBe(gross);
        }
      }
    }
  });
});

describe("shareByWeight", () => {
  it("shares exactly, in proportion", () => {
    expect(shareByWeight(7900, [33900, 33900])).toEqual([3950, 3950]);
    expect(shareByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(shareByWeight(5, [0, 0])).toEqual([3, 2]);
    expect(shareByWeight(0, [10, 20])).toEqual([0, 0]);
  });
});

describe("orderTax", () => {
  const lines = [
    { kind: "variety" as const, key: "radish", lineTotal: 240 },
    { kind: "tray" as const, key: "tray-pair", lineTotal: 339 },
    { kind: "media" as const, key: "horti-coir", lineTotal: 210 },
  ];
  const shipments = [
    { lines: ["variety:radish"], charge: 30 },
    { lines: ["tray:tray-pair", "media:horti-coir"], charge: 79 },
  ];

  it("taxes each line at its class and adds up to what was paid", () => {
    const rows = orderTax(lines, shipments, HOME_STATE);
    expect(taxTotals(rows).gross).toBe((240 + 339 + 210 + 30 + 79) * 100);
    const tray = rows.find((r) => r.source === "line" && r.line === "tray:tray-pair")!;
    expect(tray).toMatchObject({ hsn: "3926", rate: 18, gross: 33900, taxable: 28729 });
    expect(tray.cgst + tray.sgst).toBe(5171);
  });

  it("gives the own run's fee the greens' exemption and a courier parcel its goods' rates", () => {
    const delivery = orderTax(lines, shipments, HOME_STATE).filter((r) => r.source === "delivery");
    expect(delivery.find((r) => r.line === "variety:radish")).toMatchObject({ rate: 0, gross: 3000 });
    const tray = delivery.find((r) => r.line === "tray:tray-pair")!;
    const media = delivery.find((r) => r.line === "media:horti-coir")!;
    expect(tray.gross + media.gross).toBe(7900);
    expect(tray.gross).toBeGreaterThan(media.gross);
    expect([tray.rate, media.rate]).toEqual([18, 5]);
  });

  it("charges IGST outside Karnataka, and for a state it could not place", () => {
    for (const pos of [gstStateFor("Kerala"), null]) {
      const t = taxTotals(orderTax(lines, shipments, pos));
      expect(t.cgst + t.sgst).toBe(0);
      expect(t.igst).toBeGreaterThan(0);
    }
  });

  it("summarises by rate, highest first", () => {
    expect(totalsByRate(orderTax(lines, shipments, HOME_STATE)).map((r) => r.rate)).toEqual([18, 5, 0]);
  });

  it("has a class for every kind the cart sells", () => {
    for (const kind of CART_KINDS) expect(taxClassFor(kind, "x").hsn).toMatch(/^\d{4,8}$/);
    expect(taxClassFor("seed", "mustard").hsn).toBe("1207");
    expect(taxClassFor("seed", "radish")).toEqual({ hsn: "1209", rate: 0 });
  });
});

describe("invoice numbers", () => {
  it("run per financial year, by the IST date", () => {
    expect(financialYear(new Date("2026-10-17T10:00:00Z"))).toBe("2627");
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("2627"); // 23:30 IST, 31 Mar
    expect(financialYear(new Date("2027-03-31T18:31:00Z"))).toBe("2728"); // 00:01 IST, 1 Apr
    expect(financialYear(new Date("2099-06-01T00:00:00Z"))).toBe("9900");
  });

  it("fit Rule 46's sixteen characters", () => {
    expect(formatInvoiceNo("2627", 1)).toBe("FG/2627/00001");
    expect(formatInvoiceNo("2627", 99999).length).toBeLessThanOrEqual(16);
  });
});

describe("subscriptionTax", () => {
  it("is one exempt greens row per plan, adding up to the term's price", () => {
    const rows = subscriptionTax(
      [
        { planKey: "essential", lineTotal: 1199 },
        { planKey: "exotic", lineTotal: 3598 },
      ],
      HOME_STATE,
    );
    expect(rows.map((r) => [r.line, r.hsn, r.rate])).toEqual([
      ["plan:essential", "0709", 0],
      ["plan:exotic", "0709", 0],
    ]);
    expect(taxTotals(rows)).toEqual({ gross: 479700, taxable: 479700, cgst: 0, sgst: 0, igst: 0 });
  });
});

describe("credit notes", () => {
  it("run in their own series, never an invoice number", () => {
    expect(formatCreditNoteNo("2627", 1)).toBe("CN/2627/00001");
    expect(formatCreditNoteNo("2627", 1)).not.toBe(formatInvoiceNo("2627", 1));
    expect(formatCreditNoteNo("2627", 99999).length).toBeLessThanOrEqual(16);
  });
});

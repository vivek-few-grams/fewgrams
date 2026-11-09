import { describe, expect, it } from "vitest";
import { subscriptionTax } from "@/lib/tax/order-tax";
import { HOME_STATE } from "@/lib/tax/states";
import { gstr1Csv } from "./csv";
import { buildGstr1, docSeries } from "./gstr1";
import { creditRows, type CreditDoc, type SaleDoc } from "./sales";

/**
 * GSTR-1 table 13 (8 Nov 2026): per series, From the lowest number and To
 * the highest, Total the whole range, Cancelled the numbers in it never
 * issued, and the net issued what is left. It used to report the count of
 * documents as the total and hard-code 0 cancelled, which misstates a range
 * with a number lost in it.
 */

const plan = (number: string, source: SaleDoc["source"] = "subscription"): SaleDoc => ({
  number,
  date: "2026-11-10",
  source,
  id: number,
  buyer: null,
  pos: HOME_STATE,
  rows: subscriptionTax([{ planKey: "essential", lineTotal: 1199 }], HOME_STATE),
  quantities: { "plan:essential": 4 },
});

describe("docSeries", () => {
  it("counts a number missing from the range as cancelled", () => {
    expect(docSeries(["FG/2627/00004", "FG/2627/00001", "FG/2627/00002"])).toEqual([
      { series: "FG/2627/", from: "FG/2627/00001", to: "FG/2627/00004", total: 4, cancelled: 1, issued: 3 },
    ]);
  });

  it("orders by the running number, not the text", () => {
    const [s] = docSeries(["FG/2627/99999", "FG/2627/100001", "FG/2627/100000"]);
    expect(s).toMatchObject({ from: "FG/2627/99999", to: "FG/2627/100001", total: 3, cancelled: 0 });
  });

  it("gives each financial year's series its own row", () => {
    expect(docSeries(["FG/2728/00001", "FG/2627/00010", "FG/2627/00012"])).toEqual([
      { series: "FG/2627/", from: "FG/2627/00010", to: "FG/2627/00012", total: 3, cancelled: 1, issued: 2 },
      { series: "FG/2728/", from: "FG/2728/00001", to: "FG/2728/00001", total: 1, cancelled: 0, issued: 1 },
    ]);
  });

  it("counts a number listed twice once", () => {
    expect(docSeries(["CN/2627/00001", "CN/2627/00001"])).toMatchObject([{ total: 1, issued: 1 }]);
  });

  it("is empty for a period with no documents", () => {
    expect(docSeries([])).toEqual([]);
  });
});

describe("table 13 in GSTR-1 and its CSV", () => {
  /* Invoices 1–5 with 3 lost to a lease takeover; an order's credit note 1
     and a subscription's 3, with 2 lost. */
  const order1 = plan("FG/2627/00001", "order");
  const sub2 = plan("FG/2627/00002");
  const order4 = plan("FG/2627/00004", "order");
  const sub5 = plan("FG/2627/00005");
  const credits: CreditDoc[] = [
    { number: "CN/2627/00001", date: "2026-11-20", invoice: order1 },
    {
      number: "CN/2627/00003",
      date: "2026-11-22",
      invoice: sub5,
      part: { rows: creditRows(sub5.rows, 59950), quantities: { "plan:essential": 2 } },
    },
  ];
  const g = buildGstr1([order1, sub2, order4, sub5], credits);

  it("covers subscription invoices and credit notes with orders', one series each", () => {
    expect(g.docs.invoices).toEqual([
      { series: "FG/2627/", from: "FG/2627/00001", to: "FG/2627/00005", total: 5, cancelled: 1, issued: 4 },
    ]);
    expect(g.docs.creditNotes).toEqual([
      { series: "CN/2627/", from: "CN/2627/00001", to: "CN/2627/00003", total: 3, cancelled: 1, issued: 2 },
    ]);
  });

  it("writes the range and the cancelled numbers to the Offline Tool's CSV", () => {
    expect(gstr1Csv(g, "docs").split("\r\n")).toEqual([
      "Nature of Document,Sr. No. From,Sr. No. To,Total Number,Cancelled",
      "Invoices for outward supply,FG/2627/00001,FG/2627/00005,5,1",
      "Credit Note,CN/2627/00001,CN/2627/00003,3,1",
      "",
    ]);
  });

  it("writes only the heading for a quarter with nothing issued", () => {
    expect(gstr1Csv(buildGstr1([], []), "docs")).toBe(
      "Nature of Document,Sr. No. From,Sr. No. To,Total Number,Cancelled\r\n",
    );
  });
});

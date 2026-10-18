import type { GstState } from "@/lib/tax/states";
import type { Gstr1, RateAmounts } from "./gstr1";

/**
 * GSTR-1 as the GST Offline Tool's CSV files — SPEC §26.5. One file per
 * section, each with the column headings of the tool's own template, so a
 * section is imported with "Import CSV" and the tool builds the JSON the
 * portal takes. Amounts in rupees to the paisa; dates as the tool writes
 * them (`17-Oct-2026`); a place of supply as `29-Karnataka`.
 *
 * Machine-readable data, not page copy: the headings are the tool's, in
 * English, and stay so.
 */

export const GSTR1_CSV_TABLES = [
  "b2b",
  "b2cl",
  "b2cs",
  "exemp",
  "cdnr",
  "cdnur",
  "hsn-b2b",
  "hsn-b2c",
  "docs",
] as const;
export type Gstr1CsvTable = (typeof GSTR1_CSV_TABLES)[number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const rupees = (paise: number) => (paise / 100).toFixed(2);
export const toolDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
};
const pos = (s: GstState | null) => (s ? `${s.code}-${s.name}` : "");
const UQC: Record<string, string> = {
  NOS: "NOS-NUMBERS",
  KGS: "KGS-KILOGRAMS",
  PAC: "PAC-PACKS",
  OTH: "OTH-OTHERS",
};

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const itemRows = (
  items: RateAmounts[],
  prefix: (string | number)[],
  suffix: (a: RateAmounts) => (string | number)[],
) => items.map((a) => [...prefix, ...suffix(a)]);

export function gstr1Csv(g: Gstr1, table: Gstr1CsvTable): string {
  switch (table) {
    case "b2b":
      return toCsv([
        [
          "GSTIN/UIN of Recipient",
          "Receiver Name",
          "Invoice Number",
          "Invoice date",
          "Invoice Value",
          "Place Of Supply",
          "Reverse Charge",
          "Applicable % of Tax Rate",
          "Invoice Type",
          "E-Commerce GSTIN",
          "Rate",
          "Taxable Value",
          "Cess Amount",
        ],
        ...g.b2b.flatMap((e) =>
          itemRows(
            e.items,
            [
              e.gstin,
              e.name,
              e.number,
              toolDate(e.date),
              rupees(e.value),
              pos(e.pos),
              "N",
              "",
              "Regular B2B",
              "",
            ],
            (a) => [a.rate, rupees(a.taxable), "0.00"],
          ),
        ),
      ]);
    case "b2cl":
      return toCsv([
        [
          "Invoice Number",
          "Invoice date",
          "Invoice Value",
          "Place Of Supply",
          "Applicable % of Tax Rate",
          "Rate",
          "Taxable Value",
          "Cess Amount",
          "E-Commerce GSTIN",
        ],
        ...g.b2cl.flatMap((e) =>
          itemRows(e.items, [e.number, toolDate(e.date), rupees(e.value), pos(e.pos), ""], (a) => [
            a.rate,
            rupees(a.taxable),
            "0.00",
            "",
          ]),
        ),
      ]);
    case "b2cs":
      return toCsv([
        [
          "Type",
          "Place Of Supply",
          "Applicable % of Tax Rate",
          "Rate",
          "Taxable Value",
          "Cess Amount",
          "E-Commerce GSTIN",
        ],
        ...g.b2cs.map((r) => ["OE", pos(r.pos), "", r.rate, rupees(r.taxable), "0.00", ""]),
      ]);
    case "exemp": {
      const v = (intra: boolean, registered: boolean) =>
        rupees(g.nil.find((n) => n.intra === intra && n.registered === registered)?.exempt ?? 0);
      return toCsv([
        [
          "Description",
          "Nil Rated Supplies",
          "Exempted(other than nil rated/non GST supply)",
          "Non-GST Supplies",
        ],
        ["Inter-State supplies to registered persons", "0.00", v(false, true), "0.00"],
        ["Intra-State supplies to registered persons", "0.00", v(true, true), "0.00"],
        ["Inter-State supplies to unregistered persons", "0.00", v(false, false), "0.00"],
        ["Intra-State supplies to unregistered persons", "0.00", v(true, false), "0.00"],
      ]);
    }
    case "cdnr":
      return toCsv([
        [
          "GSTIN/UIN of Recipient",
          "Receiver Name",
          "Note Number",
          "Note Date",
          "Note Type",
          "Place Of Supply",
          "Reverse Charge",
          "Note Supply Type",
          "Note Value",
          "Applicable % of Tax Rate",
          "Rate",
          "Taxable Value",
          "Cess Amount",
        ],
        ...g.cdnr.flatMap((e) =>
          itemRows(
            e.items,
            [
              e.gstin,
              e.name,
              e.number,
              toolDate(e.date),
              "C",
              pos(e.pos),
              "N",
              "Regular B2B",
              rupees(e.value),
              "",
            ],
            (a) => [a.rate, rupees(a.taxable), "0.00"],
          ),
        ),
      ]);
    case "cdnur":
      return toCsv([
        [
          "UR Type",
          "Note Number",
          "Note Date",
          "Note Type",
          "Place Of Supply",
          "Note Value",
          "Applicable % of Tax Rate",
          "Rate",
          "Taxable Value",
          "Cess Amount",
        ],
        ...g.cdnur.flatMap((e) =>
          itemRows(
            e.items,
            ["B2CL", e.number, toolDate(e.date), "C", pos(e.pos), rupees(e.value), ""],
            (a) => [a.rate, rupees(a.taxable), "0.00"],
          ),
        ),
      ]);
    case "hsn-b2b":
    case "hsn-b2c":
      return toCsv([
        [
          "HSN",
          "Description",
          "UQC",
          "Total Quantity",
          "Total Value",
          "Rate",
          "Taxable Value",
          "Integrated Tax Amount",
          "Central Tax Amount",
          "State/UT Tax Amount",
          "Cess Amount",
        ],
        ...g.hsn
          .filter((h) => h.b2b === (table === "hsn-b2b"))
          .map((h) => [
            h.hsn,
            h.description,
            UQC[h.uqc] ?? h.uqc,
            Number(h.qty.toFixed(3)),
            rupees(h.value),
            h.rate,
            rupees(h.taxable),
            rupees(h.igst),
            rupees(h.cgst),
            rupees(h.sgst),
            "0.00",
          ]),
      ]);
    case "docs":
      return toCsv([
        ["Nature of Document", "Sr. No. From", "Sr. No. To", "Total Number", "Cancelled"],
        ...(g.docs.invoices
          ? [
              [
                "Invoices for outward supply",
                g.docs.invoices.from,
                g.docs.invoices.to,
                g.docs.invoices.count,
                0,
              ],
            ]
          : []),
        ...(g.docs.creditNotes
          ? [["Credit Note", g.docs.creditNotes.from, g.docs.creditNotes.to, g.docs.creditNotes.count, 0]]
          : []),
      ]);
  }
}

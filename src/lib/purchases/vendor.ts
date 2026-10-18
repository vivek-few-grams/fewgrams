import { err, type FormState } from "@/lib/forms";
import { gstinStateCode, isValidGstin, normaliseGstin } from "@/lib/tax/gstin";
import { gstStateByCode, type GstState } from "@/lib/tax/states";
import type { VendorKind, VendorSnapshot } from "./bill";

/**
 * A vendor — `/admin/vendors`, SPEC §26.6. Who we buy from, and the two
 * facts GST needs about them: their GSTIN (which also says their state, so
 * whether their tax is CGST + SGST or IGST), and whether they file monthly
 * or quarterly (which says when their bills reach our GSTR-2B). What they
 * supply is picked on the product screens, not here (`supplies.ts`).
 */

export const VENDOR_FILING = ["monthly", "quarterly", "unknown"] as const;
export type VendorFiling = (typeof VENDOR_FILING)[number];

export type Vendor = {
  id: string;
  name: string;
  kind: VendorKind;
  gstin: string | null;
  state: GstState | null;
  address: string;
  phone: string;
  email: string;
  filing: VendorFiling;
  /** Keys from `supplies.ts` — what we buy from them, set from the product
   *  screens' pickers. */
  supplies: string[];
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** What the vendor form edits — not `supplies`, which the product screens own. */
export type VendorInput = Omit<Vendor, "id" | "createdAt" | "updatedAt" | "supplies">;

export function vendorSnapshot(v: Vendor): VendorSnapshot {
  return { id: v.id, name: v.name, kind: v.kind, gstin: v.gstin, state: v.state };
}

const text = (fd: FormData, key: string, max: number) =>
  String(fd.get(key) ?? "")
    .trim()
    .slice(0, max);

/** Read the vendor form. Errors are keys under `admin.vendors.errors`. */
export function readVendor(fd: FormData): { ok: true; value: VendorInput } | { ok: false; state: FormState } {
  const name = text(fd, "name", 120);
  if (!name) return { ok: false, state: err("nameRequired", "name") };

  const kind = String(fd.get("kind") ?? "") as VendorKind;
  if (!["registered", "unregistered", "foreign"].includes(kind))
    return { ok: false, state: err("kindRequired", "kind") };

  let gstin: string | null = null;
  let state: GstState | null = null;
  if (kind === "registered") {
    gstin = normaliseGstin(String(fd.get("gstin") ?? ""));
    if (!isValidGstin(gstin)) return { ok: false, state: err("gstinInvalid", "gstin") };
    state = gstStateByCode(gstinStateCode(gstin));
    if (!state) return { ok: false, state: err("gstinInvalid", "gstin") };
  }

  const filingRaw = String(fd.get("filing") ?? "unknown");
  const filing = (VENDOR_FILING as readonly string[]).includes(filingRaw)
    ? (filingRaw as VendorFiling)
    : "unknown";

  return {
    ok: true,
    value: {
      name,
      kind,
      gstin,
      state,
      address: text(fd, "address", 300),
      phone: text(fd, "phone", 40),
      email: text(fd, "email", 120),
      filing: kind === "registered" ? filing : "unknown",
      notes: text(fd, "notes", 500),
      active: fd.get("active") !== null || fd.get("isNew") === "1",
    },
  };
}

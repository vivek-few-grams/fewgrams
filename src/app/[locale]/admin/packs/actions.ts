"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deletePack, listPacks, putPack } from "@/lib/repo/packs";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { listPackKeys } from "@/lib/content/packs";
import { listSellableRacks } from "@/lib/racks/catalogue";
import type { FormState } from "@/lib/forms";
import type { Pack } from "@/lib/types";

/**
 * Starter-pack mutations — the price and the parts, nothing else (SPEC §29).
 *
 * The plans screen's shape (`admin/plans/actions.ts`): which packs exist is
 * decided by `content/packs/`, so `savePack` is an **upsert keyed on
 * `contentKey`** and there is no "add a pack". `removePack` exists only for a
 * row whose content file has gone. Every action asserts the admin role
 * itself, because a server action is addressable without its form (SPEC §8).
 *
 * The parts are checked against what exists — a published angle rack, a tray
 * row, a grow-medium row — because a form field is not a security boundary,
 * and a pack pointing at nothing would vanish from the site with no
 * explanation. Whether those parts are *on sale* is not checked here: a tray
 * switched off for a week should not stop the pack being saved, only from
 * being sold, which `listSellablePacks` decides on every read.
 */

function refresh() {
  revalidatePath("/[locale]/admin/packs", "page");
  revalidatePath("/[locale]/shop/packs", "page");
  revalidatePath("/[locale]/shop/packs/[key]", "page");
}

const fail = (code: string, field?: string): FormState => ({
  status: "error",
  code,
  ...(field ? { field } : {}),
});

/** A whole number, at least `min`. */
function whole(fd: FormData, key: string, min: number): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  return raw !== "" && Number.isInteger(n) && n >= min ? n : null;
}

export async function savePack(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");

  const contentKey = String(fd.get("contentKey") ?? "").trim();
  if (!contentKey || !(await listPackKeys()).includes(contentKey)) return fail("keyUnknown");

  const price = Number(String(fd.get("price") ?? "").trim());
  if (!(Number.isFinite(price) && price > 0)) return fail("priceInvalid", "price");

  const rackSku = String(fd.get("rackSku") ?? "").trim() || null;
  let rackCount = 0;
  if (rackSku !== null) {
    const racks = await listSellableRacks();
    if (!racks.some((r) => r.range === "angle" && r.sku === rackSku)) return fail("rackUnknown", "rackSku");
    const n = whole(fd, "rackCount", 1);
    if (n === null) return fail("countInvalid", "rackCount");
    rackCount = n;
  }

  const trayKey = String(fd.get("trayKey") ?? "").trim();
  if (!(await listTrays()).some((t) => t.contentKey === trayKey)) return fail("trayUnknown", "trayKey");
  const trayCount = whole(fd, "trayCount", 1);
  if (trayCount === null) return fail("countInvalid", "trayCount");

  const seedCount = whole(fd, "seedCount", 1);
  if (seedCount === null) return fail("countInvalid", "seedCount");
  const menuSize = whole(fd, "menuSize", 1);
  if (menuSize === null) return fail("countInvalid", "menuSize");
  if (menuSize < seedCount) return fail("menuTooSmall", "menuSize");

  const mediumKey = String(fd.get("mediumKey") ?? "").trim() || null;
  let mediumCount = 0;
  if (mediumKey !== null) {
    if (!(await listGrowMedia()).some((m) => m.contentKey === mediumKey))
      return fail("mediumUnknown", "mediumKey");
    const n = whole(fd, "mediumCount", 1);
    if (n === null) return fail("countInvalid", "mediumCount");
    mediumCount = n;
  }

  const sortOrder = Number(String(fd.get("sortOrder") ?? "").trim() || 0);
  const existing = (await listPacks()).find((p) => p.contentKey === contentKey);

  const pack: Pack = {
    id: existing?.id ?? crypto.randomUUID(),
    contentKey,
    price,
    rackSku,
    rackCount,
    trayKey,
    trayCount,
    seedCount,
    menuSize,
    mediumKey,
    mediumCount,
    onSite: fd.get("onSite") === "on",
    recommended: fd.get("recommended") === "on",
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    active: fd.get("active") === "on",
  };
  await putPack(pack);
  refresh();
  return { status: "saved" };
}

/** Delete a pack row — offered only once its content file is gone, and
 *  re-checked here because a hidden button is not the rule. */
export async function removePack(fd: FormData): Promise<void> {
  await assertRole("admin");
  const id = String(fd.get("id") ?? "").trim();
  const pack = (await listPacks()).find((p) => p.id === id);
  if (!pack) return;
  if ((await listPackKeys()).includes(pack.contentKey)) {
    throw new Error(`Pack ${pack.contentKey} still has a content file and is not deletable`);
  }
  await deletePack(id);
  refresh();
}

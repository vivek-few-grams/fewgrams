"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { istDateISO } from "@/lib/delivery-date";
import { err, type FormState } from "@/lib/forms";
import { deleteSowing, getSowing, putSowing } from "@/lib/repo/sowings";
import { listVarieties } from "@/lib/repo/varieties";
import { readSowing } from "@/lib/sowing/sowing";

/**
 * Sowing log mutations — `/admin/sowing` (10 Oct 2026). Each asserts the
 * admin role itself (SPEC §8): a server action is addressable without the
 * page that renders its form.
 *
 * Nothing here touches stock. The log records what was sown; seed stock is
 * the shelf for sale, counted on `/admin/seeds`, and the two are kept apart.
 */

function refresh() {
  revalidatePath("/[locale]/admin/sowing", "page");
}

/** Keys a line may name: every variety on file, active or not — a variety
 *  can be trialled before it is sold. */
async function varietyKeys(extra: string[] = []): Promise<Set<string>> {
  const rows = await listVarieties();
  return new Set([...rows.map((v) => v.contentKey), ...extra]);
}

export async function addSowing(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const read = readSowing(fd, { varietyKeys: await varietyKeys(), today: istDateISO(new Date()) });
  if (!read.ok) return read.state;

  const now = new Date().toISOString();
  await putSowing({
    id: crypto.randomUUID(),
    sowDate: read.sowDate,
    lines: read.lines,
    createdAt: now,
    updatedAt: now,
  });
  refresh();
  return { status: "saved" };
}

/** Save a whole sowing — its date, its lines and their harvests. */
export async function updateSowing(_prev: FormState, fd: FormData): Promise<FormState> {
  await assertRole("admin");
  const current = await getSowing(String(fd.get("id") ?? ""));
  if (!current) return err("notFound");

  /* A line whose variety row has since been deleted stays editable. */
  const keys = await varietyKeys(current.lines.map((l) => l.varietyKey));
  const read = readSowing(fd, { varietyKeys: keys, today: istDateISO(new Date()) });
  if (!read.ok) return read.state;

  await putSowing({
    ...current,
    sowDate: read.sowDate,
    lines: read.lines,
    updatedAt: new Date().toISOString(),
  });
  refresh();
  return { status: "saved" };
}

export async function removeSowing(fd: FormData): Promise<void> {
  await assertRole("admin");
  await deleteSowing(String(fd.get("id")));
  refresh();
}

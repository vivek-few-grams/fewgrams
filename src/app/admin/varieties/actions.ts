"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deleteVariety, getVariety, putVariety } from "@/lib/repo/varieties";
import type { Variety } from "@/lib/types";

/**
 * Variety mutations.
 *
 * SPEC §8: every one of these asserts the admin role itself. Server actions
 * are addressable over HTTP independently of the page that renders the form,
 * so the layout's gate is not sufficient on its own.
 */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function num(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
  return n;
}

export async function saveVariety(fd: FormData) {
  await assertRole("admin");
  const nameEn = String(fd.get("nameEn") ?? "").trim();
  if (!nameEn) throw new Error("English name is required");

  const nameKn = String(fd.get("nameKn") ?? "").trim();
  const id = String(fd.get("id") ?? "").trim() || crypto.randomUUID();
  const slug = String(fd.get("slug") ?? "").trim() || slugify(nameEn);

  const growDays = num(fd, "growDays");
  const yieldGramsPerTray = num(fd, "yieldGramsPerTray");
  if (growDays < 1) throw new Error("Grow days must be at least 1");
  if (yieldGramsPerTray < 1) throw new Error("Yield per tray must be at least 1 g");

  const seedRaw = String(fd.get("seedGramsPerTray") ?? "").trim();

  const variety: Variety = {
    id,
    slug,
    name: { en: nameEn, ...(nameKn ? { kn: nameKn } : {}) },
    pricePer100g: num(fd, "pricePer100g"),
    yieldGramsPerTray,
    growDays,
    ...(seedRaw ? { seedGramsPerTray: Number(seedRaw) } : {}),
    tier: fd.get("tier") === "exotic" ? "exotic" : "essential",
    active: fd.get("active") === "on",
  };

  await putVariety(variety);
  revalidatePath("/admin/varieties");
  revalidatePath("/");
}

export async function toggleVarietyActive(fd: FormData) {
  await assertRole("admin");
  const id = String(fd.get("id"));
  const existing = await getVariety(id);
  if (!existing) throw new Error(`Variety ${id} not found`);
  await putVariety({ ...existing, active: !existing.active });
  revalidatePath("/admin/varieties");
  revalidatePath("/");
}

export async function removeVariety(fd: FormData) {
  await assertRole("admin");
  await deleteVariety(String(fd.get("id")));
  revalidatePath("/admin/varieties");
  revalidatePath("/");
}

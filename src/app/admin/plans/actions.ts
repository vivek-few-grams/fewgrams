"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth/guard";
import { deletePlan, putPlan } from "@/lib/repo/plans";
import type { Plan, PlanWeek } from "@/lib/types";


const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function savePlan(fd: FormData) {
  await assertRole("admin");
  const nameEn = String(fd.get("nameEn") ?? "").trim();
  if (!nameEn) throw new Error("English name is required");

  const id = String(fd.get("id") ?? "").trim() || crypto.randomUUID();
  const nameKn = String(fd.get("nameKn") ?? "").trim();
  const blurbEn = String(fd.get("blurbEn") ?? "").trim();
  const blurbKn = String(fd.get("blurbKn") ?? "").trim();
  const byo = fd.get("byo") === "on";
  const priceRaw = String(fd.get("monthlyPrice") ?? "").trim();

  if (!byo && !priceRaw) {
    throw new Error("A curated plan needs a monthly price, or mark it Build Your Own");
  }

  const plan: Plan = {
    id,
    slug: String(fd.get("slug") ?? "").trim() || slugify(nameEn),
    name: { en: nameEn, ...(nameKn ? { kn: nameKn } : {}) },
    blurb: { en: blurbEn, ...(blurbKn ? { kn: blurbKn } : {}) },
    // null is the marker for Build Your Own, priced by weight — SPEC §5.1
    monthlyPrice: byo ? null : Number(priceRaw),
    gramsPerBox: Number(fd.get("gramsPerBox") ?? 0),
    highlights: String(fd.get("highlights") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    recommended: fd.get("recommended") === "on",
    panel: (["sage", "forest", "sand"] as const).includes(
      fd.get("panel") as "sage",
    )
      ? (fd.get("panel") as Plan["panel"])
      : "sage",
    sortOrder: Number(fd.get("sortOrder") ?? 0),
    active: fd.get("active") === "on",
  };

  // One `week-N` field per rotation week, comma-separated variety slugs.
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= 4; w++) {
    const slugs = String(fd.get(`week-${w}`) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length > 0) weeks.push({ planId: id, week: w, varietySlugs: slugs });
  }

  await putPlan(plan, weeks);
  revalidatePath("/admin/plans");
  revalidatePath("/");
}

export async function removePlan(fd: FormData) {
  await assertRole("admin");
  await deletePlan(String(fd.get("id")));
  revalidatePath("/admin/plans");
  revalidatePath("/");
}

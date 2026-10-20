import { getTranslations } from "next-intl/server";
import type { PlanWithWeeks } from "@/components/home/Bundles";
import { currentActor } from "@/lib/auth/guard";
import { attachPlanContent } from "@/lib/content/plans";
import { placeholderFor } from "@/lib/images/placeholder";
import { listPlansWithWeeks } from "@/lib/repo/plans";

/**
 * What `Bundles` draws — on the home page's plans section and on `/plans`
 * (SPEC §28.8), read once here so the two cannot list different plans.
 */
export async function planCards(locale: string): Promise<{
  plans: PlanWithWeeks[];
  adminEmpty: { title: string; body: string; cta: string } | null;
}> {
  const rows = await listPlansWithWeeks({ activeOnly: true });

  /* Plan copy comes from content/plans/<key>.json. A plan whose file does not
     exist yet is **skipped**, not rendered nameless — the admin screen is
     where that gets reported, in red, with the path. */
  const withContent = await attachPlanContent(
    rows.map(({ plan, weeks }) => ({ ...plan, weeks })),
    locale,
  );
  const plans = withContent
    .filter((p) => p.content !== null)
    .map(({ weeks, content, ...plan }) => {
      const src = `/img/plans/${plan.contentKey}.webp`;
      return { plan, weeks, text: content!.text, photo: { src, placeholder: placeholderFor(src) } };
    });

  /* The empty plans panel used to tell every visitor to "create Essential,
     Exotic or Build Your Own" and offered a button into /admin/plans. The
     operator copy is resolved here and only when the viewer is an admin, so a
     customer's HTML never carries it — the `admin` namespace is kept out of
     the client catalogue on purpose (CLAUDE.md). */
  const actor = plans.length === 0 ? await currentActor() : null;
  const ta = await getTranslations({ locale, namespace: "admin.publicEmpty" });
  const adminEmpty =
    actor?.role === "admin" ? { title: ta("plansTitle"), body: ta("plansBody"), cta: ta("plansCta") } : null;

  return { plans, adminEmpty };
}

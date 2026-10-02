import { getTranslations } from "next-intl/server";
import { ArrowRight, Sprout } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TrayPlayStage } from "@/components/tray-play/TrayPlayStage";

/**
 * Run your hand over it — a tray of greens to touch, at the **bottom** of the
 * home page, just above the trust band (the owner, 1 Oct 2026). It sat
 * between "Our process" and "Why microgreens" first; there it pushed the
 * plans a whole screen further down, and play is the last thing a visitor
 * should have to scroll past to buy.
 *
 * It is also the door to the play garden (`/garden`, SPEC §25): the button
 * starts the journey at the tray pick, because the visitor has just done
 * step 1 here. The physics and the drawing are in `tray-play/`; this file
 * is only the heading, the panel and the button.
 *
 * The copy carries no grow time and no nutrient claim (CLAUDE.md): it
 * describes how a tray looks and moves, which is a claim about the operation
 * anyone can check on delivery.
 */
export async function TrayPlay() {
  const t = await getTranslations("home.trayPlay");

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-14 md:px-12 md:py-20">
      {/* Same heading row as `Process`, so the two read as one sequence. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
        <h2 className="font-display text-[clamp(1.6rem,3.1vw,2.5rem)] font-bold leading-tight tracking-tight text-forest">
          {t("heading")}
        </h2>
        <p className="max-w-md font-body text-base text-stone lg:text-right">{t("body")}</p>
      </div>

      {/* Wide on a desktop, where the three trays sit in a row; 4:3 below
          `lg`, where the scene backs off to fit them across. Two shapes, not
          three: each needs its own still (`TrayPlayStage`). */}
      <div className="relative mt-10 aspect-[4/3] overflow-hidden rounded-3xl bg-sand lg:aspect-[21/9]">
        <TrayPlayStage alt={t("alt")} />
      </div>

      <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body text-sm text-stone">{t("journeyNote")}</p>
        <Link
          href={{ pathname: "/garden", query: { step: "pick" } }}
          className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3.5 font-body text-sm font-semibold text-cream shadow-md transition-colors hover:bg-forest-deep"
        >
          <Sprout size={18} aria-hidden />
          {t("journey")}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

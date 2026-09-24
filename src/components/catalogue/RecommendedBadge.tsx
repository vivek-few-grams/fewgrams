import { BadgeCheck } from "lucide-react";

/**
 * "Recommended by Fewgrams" — the pill on a grow-medium card and above its
 * detail page title (SPEC §24.10).
 *
 * Not a claim anyone can switch on for an item. It renders on grow media
 * only, and a grow-media content file cannot pass its contract without an
 * `ourNote` saying how we use the product ourselves — so the badge is always
 * backed by the note on the same page. The label arrives translated.
 */
export function RecommendedBadge({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-cream ${className}`}
    >
      <BadgeCheck size={14} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

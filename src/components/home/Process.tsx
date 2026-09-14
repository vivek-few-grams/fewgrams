import { PackageCheck, ScanSearch, Sprout as SproutIcon, Truck } from "lucide-react";

/**
 * Our process — SPEC §18.3 section 3. The core differentiator and the answer
 * to "is this safe to eat", so it sits immediately below the hero and above
 * any pricing.
 */
const steps = [
  {
    icon: PackageCheck,
    title: "Untreated seed",
    body: "We buy only non-treated seed — no chemical coating, nothing you would not want on a plate.",
  },
  {
    icon: ScanSearch,
    title: "Checked for quality",
    body: "Every batch is examined before it goes anywhere near a tray. Poor seed means poor greens.",
  },
  {
    icon: SproutIcon,
    title: "Sown on your order",
    body: "Nothing is sown speculatively. Your order decides what goes into the trays that Sunday.",
  },
  {
    icon: Truck,
    title: "Harvested to deliver",
    body: "Cut on Saturday morning and taken straight to your door. No cold room in between.",
  },
];

export function Process() {
  return (
    <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-12 md:py-28">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h2 className="max-w-xl font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-tight tracking-tight text-forest">
          Grown for your order, not for a shelf.
        </h2>
        <p className="font-display text-lg font-semibold text-forest md:text-xl">
          No freezing. No storing.
        </p>
      </div>

      <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title}>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sage text-forest">
                <s.icon size={20} strokeWidth={1.5} />
              </span>
              <span className="font-body text-xs tabular-nums text-stone">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold text-forest">{s.title}</h3>
            <p className="mt-2 font-body text-sm leading-relaxed text-stone">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

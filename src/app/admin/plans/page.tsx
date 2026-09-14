import { listPlansWithWeeks } from "@/lib/repo/plans";
import { listVarieties } from "@/lib/repo/varieties";
import { t } from "@/lib/types";
import { removePlan, savePlan } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlansAdmin() {
  const [entries, varieties] = await Promise.all([
    listPlansWithWeeks(),
    listVarieties(),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">Plans</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-stone">
          These are the bundle cards on the home page. A month is a{" "}
          <strong className="font-semibold text-forest">rotation</strong>, not the same
          box four times — week 1 carries the fast crops sown on the first Sunday, week 2
          the slower ones sown that <em>same</em> Sunday (SPEC §5.2).
        </p>
        {varieties.length === 0 && (
          <p className="mt-4 rounded-xl border border-terracotta/40 bg-terracotta/5 p-3 font-body text-sm">
            Add varieties first — the rotation is built from their slugs.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">Add a plan</h2>

        <form action={savePlan} className="mt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English)" name="nameEn" required placeholder="Essential" />
            <Field label="Name (Kannada)" name="nameKn" hint="Optional" />
            <Field
              label="Blurb (English)"
              name="blurbEn"
              placeholder="The daily basics, every week."
            />
            <Field label="Blurb (Kannada)" name="blurbKn" hint="Optional" />
            <Field label="Monthly price (₹)" name="monthlyPrice" type="number" placeholder="1200" />
            <Field label="Grams per box" name="gramsPerBox" type="number" defaultValue="500" />
            <div>
              <Label>Card panel colour</Label>
              <select
                name="panel"
                className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm"
              >
                <option value="sage">Sage (light green)</option>
                <option value="forest">Forest (dark green)</option>
                <option value="sand">Sand (warm neutral)</option>
              </select>
            </div>
            <Field label="Sort order" name="sortOrder" type="number" defaultValue="0" hint="Lower shows first" />
          </div>

          <div>
            <Label>Highlights — one per line</Label>
            <textarea
              name="highlights"
              rows={3}
              placeholder={"Sown only once you order\nCut the morning it reaches you\nDelivery included"}
              className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest"
            />
          </div>

          <fieldset className="rounded-xl bg-sand p-4">
            <legend className="px-1 font-body text-xs font-semibold uppercase tracking-wider text-stone">
              4-week rotation
            </legend>
            <p className="mb-3 font-body text-xs text-stone">
              Comma-separated variety slugs.
              {varieties.length > 0 && (
                <>
                  {" "}
                  Available:{" "}
                  <span className="text-forest">
                    {varieties.map((v) => v.slug).join(", ")}
                  </span>
                </>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((w) => (
                <Field
                  key={w}
                  label={`Week ${w}`}
                  name={`week-${w}`}
                  placeholder="radish, mustard, mung"
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 font-body text-sm text-forest">
              <input type="checkbox" name="active" defaultChecked className="size-4" />
              Active
            </label>
            <label className="flex items-center gap-2 font-body text-sm text-forest">
              <input type="checkbox" name="recommended" className="size-4" />
              Show &ldquo;Recommended&rdquo; badge
            </label>
            <label className="flex items-center gap-2 font-body text-sm text-forest">
              <input type="checkbox" name="byo" className="size-4" />
              Build Your Own — priced by weight, no monthly price
            </label>
          </div>

          <button
            type="submit"
            className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
          >
            Save plan
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-forest">
          {entries.length} saved
        </h2>
        {entries.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
            No plans yet. The home page shows an empty state until you add one.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {entries.map(({ plan, weeks }) => (
              <li
                key={plan.id}
                className="rounded-2xl border border-forest/15 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-forest">
                      {t(plan.name)}
                      {plan.recommended && (
                        <span className="ml-2 rounded-full bg-forest px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-cream">
                          Recommended
                        </span>
                      )}
                      {!plan.active && (
                        <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-stone">
                          Hidden
                        </span>
                      )}
                    </p>
                    <p className="mt-1 font-body text-sm text-stone">{t(plan.blurb)}</p>
                    <p className="mt-2 font-body text-sm text-forest">
                      {plan.monthlyPrice === null
                        ? "Priced by weight"
                        : `₹${plan.monthlyPrice.toLocaleString("en-IN")}/month · ~${plan.gramsPerBox} g per box`}
                    </p>
                  </div>
                  <form action={removePlan}>
                    <input type="hidden" name="id" value={plan.id} />
                    <button className="font-body text-xs text-terracotta underline underline-offset-2">
                      Delete
                    </button>
                  </form>
                </div>

                {weeks.length > 0 && (
                  <ol className="mt-4 grid gap-2 sm:grid-cols-4">
                    {weeks.map((w) => (
                      <li key={w.week} className="rounded-xl bg-sand px-3 py-2">
                        <p className="font-body text-[11px] uppercase tracking-wider text-stone">
                          Week {w.week}
                        </p>
                        <p className="mt-0.5 font-body text-sm text-forest">
                          {w.varietySlugs.join(", ")}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-xs font-medium uppercase tracking-wider text-stone">
      {children}
    </span>
  );
}

function Field({
  label,
  name,
  hint,
  ...rest
}: { label: string; name: string; hint?: string } &
  React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        name={name}
        {...rest}
        className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm outline-none placeholder:text-stone/50 focus:border-forest"
      />
      {hint && <p className="mt-1 font-body text-[11px] text-stone">{hint}</p>}
    </div>
  );
}

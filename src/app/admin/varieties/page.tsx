import { listVarieties } from "@/lib/repo/varieties";
import { t } from "@/lib/types";
import { removeVariety, saveVariety, toggleVarietyActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function VarietiesAdmin() {
  const varieties = await listVarieties();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">Varieties</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-stone">
          <strong className="font-semibold text-forest">Yield per tray</strong> and{" "}
          <strong className="font-semibold text-forest">grow days</strong> are the two
          fields the whole operation computes from — the sow plan is{" "}
          <code className="rounded bg-sand px-1">ceil(grams ÷ yield per tray)</code>, and
          grow days decide which rotation week a variety can land in. Both start as
          estimates; SPEC §16 warns yield will be wrong at first, so revisit after a few
          weeks.
        </p>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">
          Add a variety
        </h2>
        <form action={saveVariety} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" name="nameEn" required placeholder="Radish" />
          <Field
            label="Name (Kannada)"
            name="nameKn"
            placeholder="ಮೂಲಂಗಿ"
            hint="Optional — falls back to English"
          />
          <Field label="Slug" name="slug" placeholder="auto from name" hint="URL segment" />
          <div>
            <Label>Tier</Label>
            <select
              name="tier"
              className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm"
            >
              <option value="essential">Essential</option>
              <option value="exotic">Exotic</option>
            </select>
          </div>
          <Field
            label="Grow days"
            name="growDays"
            type="number"
            required
            defaultValue="7"
            hint="Sow to harvest"
          />
          <Field
            label="Yield per tray (g)"
            name="yieldGramsPerTray"
            type="number"
            required
            defaultValue="300"
            hint="Your measured figure"
          />
          <Field
            label="Price per 100 g (₹)"
            name="pricePer100g"
            type="number"
            required
            defaultValue="75"
            hint="Prices ad-hoc orders and Build Your Own"
          />
          <Field
            label="Seed per tray (g)"
            name="seedGramsPerTray"
            type="number"
            hint="Optional — adds a seed column to the sow plan"
          />

          <label className="flex items-center gap-2 font-body text-sm text-forest">
            <input type="checkbox" name="active" defaultChecked className="size-4" />
            Active — visible on the site
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
            >
              Save variety
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-forest">
          {varieties.length} saved
        </h2>

        {varieties.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
            Nothing yet. Add a variety above and it appears in the PRODUCTS overlay
            straight away.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-forest/15">
            <table className="w-full font-body text-sm">
              <thead className="bg-sand text-left text-xs uppercase tracking-wider text-stone">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Grow days</th>
                  <th className="px-4 py-3 text-right">Yield/tray</th>
                  <th className="px-4 py-3 text-right">₹/100 g</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {varieties.map((v) => (
                  <tr key={v.id} className="border-t border-forest/10">
                    <td className="px-4 py-3 font-medium text-forest">
                      {t(v.name)}
                      {v.name.kn && (
                        <span className="ml-2 font-kannada text-xs text-stone">
                          {v.name.kn}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone">{v.slug}</td>
                    <td className="px-4 py-3 text-stone">{v.tier}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{v.growDays}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {v.yieldGramsPerTray} g
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ₹{v.pricePer100g}
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleVarietyActive}>
                        <input type="hidden" name="id" value={v.id} />
                        <button
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            v.active
                              ? "bg-sage text-forest"
                              : "bg-forest/10 text-stone"
                          }`}
                        >
                          {v.active ? "Active" : "Hidden"}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={removeVariety}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="text-xs text-terracotta underline underline-offset-2">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
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

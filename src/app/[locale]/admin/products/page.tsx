import { listProducts } from "@/lib/repo/products";
import { CATEGORIES, t } from "@/lib/types";
import { removeProduct, saveProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductsAdmin() {
  const products = await listProducts();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-bold text-forest">Products</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-stone">
          Racks, trays, seeds and snacks — everything sold one-off rather than by
          subscription. Only <strong className="font-semibold text-forest">seeds</strong>{" "}
          carry real stock, tracked in grams; racks and trays are assumed always
          available and snacks are made to order (SPEC §3).
        </p>
      </section>

      <section className="rounded-2xl border border-forest/15 p-6">
        <h2 className="font-display text-lg font-semibold text-forest">Add a product</h2>
        <form action={saveProduct} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <select
                name="category"
                className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-body text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Name (English)" name="nameEn" required placeholder="5-tier grow rack" />
            <Field label="Name (Kannada)" name="nameKn" hint="Optional" />
            <Field label="Slug" name="slug" placeholder="auto from name" />
            <Field label="Base price (₹)" name="basePrice" type="number" required defaultValue="0" />
          </div>

          <div>
            <Label>Variants — one per line</Label>
            <textarea
              name="variants"
              rows={4}
              placeholder={"RACK-5T | tiers=5 | 4500\nTRAY-PP-1020 | material=PP,size=10x20 | 180\nSEED-RAD-100 | pack=100g | 120 | 2500"}
              className="mt-1.5 w-full rounded-lg border border-forest/25 bg-cream px-3 py-2 font-mono text-xs outline-none placeholder:text-stone/50 focus:border-forest"
            />
            <p className="mt-1 font-body text-[11px] text-stone">
              <code>sku | key=value,key=value | price | stockGrams</code> — stock only
              applies to seeds. Leave blank for a single-variant product.
            </p>
          </div>

          <label className="flex items-center gap-2 font-body text-sm text-forest">
            <input type="checkbox" name="active" defaultChecked className="size-4" />
            Active
          </label>

          <button
            type="submit"
            className="rounded-full bg-forest px-6 py-2.5 font-body text-sm font-semibold text-cream hover:bg-forest-deep"
          >
            Save product
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-forest">
          {products.length} saved
        </h2>
        {products.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-forest/25 p-8 text-center font-body text-sm text-stone">
            Nothing yet. Home page tiles show &ldquo;Coming soon&rdquo; until a category
            has an active product.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-forest/15 p-5"
              >
                <div>
                  <p className="font-body text-[11px] uppercase tracking-wider text-stone">
                    {p.category}
                  </p>
                  <p className="mt-0.5 font-display text-base font-semibold text-forest">
                    {t(p.name)}
                    {!p.active && (
                      <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 font-body text-[10px] uppercase tracking-wider text-stone">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-body text-sm text-stone">
                    ₹{p.basePrice.toLocaleString("en-IN")}
                    {p.variants.length > 0 && ` · ${p.variants.length} variant(s)`}
                  </p>
                  {p.variants.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {p.variants.map((v) => (
                        <li key={v.sku} className="font-mono text-[11px] text-stone">
                          {v.sku} · ₹{v.price}
                          {Object.entries(v.attributes).length > 0 &&
                            ` · ${Object.entries(v.attributes)
                              .map(([k, val]) => `${k}=${val}`)
                              .join(", ")}`}
                          {v.stockGrams !== undefined && ` · ${v.stockGrams} g in stock`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <form action={removeProduct}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="font-body text-xs text-terracotta underline underline-offset-2 transition-colors hover:text-terracotta/70">
                    Delete
                  </button>
                </form>
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

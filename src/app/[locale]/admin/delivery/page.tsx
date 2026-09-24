import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { loadRateCard } from "@/lib/repo/racks";
import { getShippingSettings } from "@/lib/repo/shipping";
import { listTrays } from "@/lib/repo/trays";
import { listGrowMedia } from "@/lib/repo/grow-media";
import { shippingProvider } from "@/lib/shipping";
import { DeliveryForm } from "./DeliveryForm";

export const dynamic = "force-dynamic";

/**
 * `/admin/delivery` — SPEC §7. Where the courier collects from, how each kind
 * packs, and whether the courier connection works.
 *
 * The connection panel makes one live, read-only call on each visit — a
 * 500 g quote from the pickup PIN to itself — so a wrong token, a wrong
 * `DELHIVERY_ENV` or a pickup PIN the courier does not collect from shows up
 * here, not as a checkout a customer cannot finish.
 */
export default async function DeliveryAdmin() {
  const t = await getTranslations("admin.delivery");
  const [settings, trays, media, card] = await Promise.all([
    getShippingSettings(),
    listTrays(),
    listGrowMedia(),
    loadRateCard(),
  ]);
  const provider = shippingProvider();

  /* Every active item a courier order could not be priced for, in one list,
     so the owner does not have to open four screens to find the gap. Only
     active rows: a retired size cannot be ordered, so it cannot block one. */
  const unmeasured = [
    ...trays
      .filter((x) => x.active && x.packPieces === undefined)
      .map((x) => ({ screen: "trays", label: x.contentKey, href: "/admin/trays" })),
    ...media
      .filter((x) => x.active && x.packPieces === undefined)
      .map((x) => ({ screen: "growMedia", label: x.contentKey, href: "/admin/grow-media" })),
    ...card.plates
      .filter((x) => x.active && x.gramsPerShelf === undefined)
      .map((x) => ({ screen: "plates", label: t("sizePlate", { depth: x.depthFt, length: x.lengthFt, thickness: x.thicknessMm }), href: "/admin/racks" })),
    ...card.frames
      .filter((x) => x.active && x.gramsPerShelf === undefined)
      .map((x) => ({ screen: "frames", label: t("sizeFootprint", { depth: x.depthFt, length: x.lengthFt }), href: "/admin/angle-racks" })),
    ...card.pipes
      .filter((x) => x.active && x.gramsPerShelf === undefined)
      .map((x) => ({ screen: "pipes", label: t("sizeFootprint", { depth: x.depthFt, length: x.lengthFt }), href: "/admin/pipe-racks" })),
  ];

  let check: { ok: true; price: number; pickup: boolean } | { ok: false; detail: string } | null = null;
  if (provider && settings) {
    const pin = settings.pickup.pincode;
    try {
      const [svc, q] = await Promise.all([
        provider.serviceability(pin),
        provider.quote({ originPin: pin, destinationPin: pin, grams: 500, speed: "surface" }),
      ]);
      check = { ok: true, price: q.total, pickup: svc?.pickup ?? false };
    } catch (e) {
      check = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-forest">{t("title")}</h1>
      <p className="mt-2 max-w-3xl font-body text-sm leading-relaxed text-stone">{t("intro")}</p>

      <section
        aria-labelledby="courier-status"
        className={`mt-6 max-w-3xl rounded-2xl p-5 ${
          provider && settings && check?.ok && check.pickup ? "bg-sage/40" : "bg-terracotta/[0.06]"
        }`}
      >
        <h2 id="courier-status" className="font-display text-base font-semibold text-forest">
          {t("statusHeading")}
        </h2>
        <p className="mt-1 font-body text-sm text-forest">
          {!provider
            ? t("statusNoToken")
            : !settings
              ? t("statusNoSettings", { mode: provider.mode })
              : check?.ok
                ? check.pickup
                  ? t("statusOk", { mode: provider.mode, price: check.price, pincode: settings.pickup.pincode })
                  : t("statusNoPickup", { pincode: settings.pickup.pincode })
                : t("statusError", { mode: provider.mode, detail: check?.ok === false ? check.detail : "" })}
        </p>
      </section>

      {unmeasured.length > 0 && (
        <section
          aria-labelledby="unmeasured"
          className="mt-4 max-w-3xl rounded-2xl bg-terracotta/[0.06] p-5"
        >
          <h2 id="unmeasured" className="font-display text-base font-semibold text-forest">
            {t("unmeasuredHeading", { count: unmeasured.length })}
          </h2>
          <p className="mt-1 font-body text-xs text-stone">{t("unmeasuredHint")}</p>
          <ul className="mt-3 space-y-1 font-body text-sm text-forest">
            {unmeasured.map((u) => (
              <li key={`${u.screen}:${u.label}`}>
                <span className="text-stone">{t(`unmeasuredScreen.${u.screen}`)} · </span>
                <Link href={u.href} className="underline underline-offset-4 hover:text-forest-deep">
                  {u.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DeliveryForm settings={settings} />
    </div>
  );
}

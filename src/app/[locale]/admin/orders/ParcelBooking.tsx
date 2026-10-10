import { getTranslations } from "next-intl/server";
import { daysFromToday, istDateISO } from "@/lib/delivery-date";
import { bookingState, canBook, type Order } from "@/lib/orders/order";
import { bookingEnabled } from "@/lib/shipping/book";
import { setTracking } from "./actions";
import { BookParcel } from "./BookParcel";

/**
 * One courier parcel's booking, on the admin order page (27 Sep 2026): the
 * "Book with …" button when it can be booked, what the courier answered once
 * it is, a warning when a booking was left unfinished — and, always, the
 * hand-typed tracking number for a parcel booked in the courier's own
 * dashboard.
 */
export async function ParcelBooking({
  order,
  index,
  courier,
  when,
  day,
}: {
  order: Order;
  index: number;
  courier: string;
  when: (iso: string) => string;
  day: (iso: string) => string;
}) {
  const t = await getTranslations("admin.orders");
  const x = order.shipments[index];
  const state = bookingState(x);
  const bookable = canBook(order, x);
  const now = new Date();

  return (
    <div className="mt-2 space-y-2 text-xs">
      {state === "booked" && x.booking && (
        <div className="text-forest">
          <p className="font-semibold">
            {t("book.booked", { when: when(x.booking.bookedAt), tracking: x.trackingNumber ?? "" })}
          </p>
          <p className={x.booking.pickupRequested ? "text-stone" : "text-terracotta"}>
            {x.booking.pickupRequested
              ? t("book.pickupOn", { date: day(x.booking.pickupDate) })
              : t("book.pickupFailed", { error: x.booking.pickupError ?? "—" })}
          </p>
          {x.booking.labelUrl && (
            <a
              href={x.booking.labelUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 transition-colors hover:text-stone"
            >
              {t("book.labelLink")}
            </a>
          )}
        </div>
      )}

      {state === "stuck" && x.bookingStartedAt && (
        <p
          role="alert"
          className="rounded-lg border border-terracotta/40 bg-terracotta/5 p-2 text-terracotta"
        >
          {t("book.stuck", { when: when(x.bookingStartedAt) })}
        </p>
      )}

      {state !== "booked" &&
        (!bookingEnabled() ? (
          <p className="text-stone">{t("book.disabled")}</p>
        ) : bookable ? (
          <BookParcel
            orderId={order.id}
            index={index}
            courier={courier}
            defaultDate={istDateISO(daysFromToday(1, now))}
            minDate={istDateISO(now)}
            retry={state === "stuck"}
          />
        ) : (
          <p className="text-stone">{t("book.notReady")}</p>
        ))}

      <details open={state === "booked" && !x.booking}>
        <summary className="text-stone">{t("book.manual")}</summary>
        <form action={setTracking} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="index" value={index} />
          <label className="flex items-center gap-2 text-stone">
            {t("tracking.label")}
            <input
              name="tracking"
              defaultValue={x.trackingNumber ?? ""}
              placeholder={t("tracking.placeholder")}
              pattern="[A-Za-z0-9\-]{6,40}"
              className="w-44 rounded-lg border border-forest/20 bg-cream px-2 py-1 font-mono text-xs text-forest"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-forest/25 px-3 py-1 font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            {t("tracking.save")}
          </button>
          <span className="text-stone">{t("tracking.hint")}</span>
        </form>
      </details>
    </div>
  );
}

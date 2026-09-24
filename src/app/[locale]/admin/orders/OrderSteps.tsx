import { getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { nextStatuses, type Order } from "@/lib/orders/order";
import { advanceOrder } from "./actions";
import { StepSubmit } from "./StepSubmit";

/**
 * The next status moves for one order, as buttons — on the board and on the
 * detail page, so the two can never offer different moves. What is offered
 * comes from `nextStatuses`; nothing here decides it.
 */
export async function OrderSteps({ order }: { order: Order }) {
  const next = nextStatuses(order.status);
  if (next.length === 0) return null;
  const t = await getTranslations("admin.orders");

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((to, i) => (
        <form key={to} action={advanceOrder}>
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="to" value={to} />
          {to === "failed" ? (
            <ConfirmSubmit
              label={t("action.failed")}
              title={t("failedTitle")}
              message={t("failedConfirm")}
              confirmLabel={t("failedYes")}
              cancelLabel={t("cancel")}
              className="rounded-full border border-forest/25 px-4 py-2 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest/5"
            />
          ) : (
            <StepSubmit label={t(`action.${to}`)} primary={i === 0} />
          )}
        </form>
      ))}
    </div>
  );
}

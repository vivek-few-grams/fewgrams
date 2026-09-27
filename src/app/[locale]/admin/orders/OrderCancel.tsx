import { getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { canCancel, canMarkRefunded, type Order } from "@/lib/orders/order";
import { GATEWAY_LABEL } from "@/lib/payments/provider";
import { cancelOrder, markRefunded } from "./actions";

/**
 * Cancel, then mark refunded — the order page only, never the board, and
 * both behind `ConfirmSubmit`: each is news the customer reads on their
 * order page, and neither can be undone from here. The refund itself is made
 * in the gateway's dashboard (the owner, 27 Sep 2026).
 */
export async function OrderCancel({ order }: { order: Order }) {
  const cancellable = canCancel(order.status);
  const refundable = canMarkRefunded(order.status);
  if (!cancellable && !refundable) return null;

  const t = await getTranslations("admin.orders");
  const gateway = GATEWAY_LABEL[order.provider];

  if (cancellable) {
    return (
      <form action={cancelOrder}>
        <input type="hidden" name="id" value={order.id} />
        <ConfirmSubmit
          label={t("cancelOrder.label")}
          title={t("cancelOrder.title")}
          message={t("cancelOrder.confirm", { gateway })}
          confirmLabel={t("cancelOrder.yes")}
          cancelLabel={t("cancelOrder.keep")}
          className="rounded-full border border-terracotta/40 px-4 py-2 font-body text-sm font-semibold text-terracotta transition-colors hover:bg-terracotta/10"
        />
      </form>
    );
  }

  return (
    <form action={markRefunded} className="flex flex-col items-start gap-1.5 md:items-end">
      <input type="hidden" name="id" value={order.id} />
      <ConfirmSubmit
        label={t("refund.label")}
        title={t("refund.title")}
        message={t("refund.confirm", { amount: order.total, gateway })}
        confirmLabel={t("refund.yes")}
        cancelLabel={t("cancel")}
        className="rounded-full bg-forest px-4 py-2 font-body text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
      />
      <span className="font-body text-xs text-stone">{t("refund.hint", { gateway })}</span>
    </form>
  );
}

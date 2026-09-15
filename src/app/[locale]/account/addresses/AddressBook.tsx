"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MapPin, Pencil, Plus, X } from "lucide-react";
import type { Address } from "@/lib/types";
import { AddressLines, Card } from "../ui";
import { deleteAddressAction, setDefaultAddressAction } from "../actions";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { AddressForm } from "./AddressForm";

/**
 * The address list, and the one thing on it that needs client state: which
 * card is being edited.
 *
 * Editing happens inline rather than on `/account/addresses/[id]`. An address
 * is six short fields; a route transition to change a landmark is more
 * ceremony than the task deserves, and it would lose the list you were
 * comparing against.
 *
 * The forms below post to server actions, so this works exactly the same on a
 * slow connection — the open/closed state is the only thing that needs
 * JavaScript.
 */
export function AddressBook({
  addresses,
  defaultRecipient,
  defaultPhone,
  defaultCity,
}: {
  addresses: Address[];
  defaultRecipient: string;
  defaultPhone: string;
  defaultCity: string;
}) {
  const t = useTranslations("account.addresses");
  const [editingId, setEditingId] = useState<string | null>(null);
  /* The form is open from the start when there is nothing saved: on an empty
     page, "add an address" is the only thing to do, so making it a click is
     a step for its own sake. */
  const [adding, setAdding] = useState(addresses.length === 0);

  return (
    <div className="space-y-5">
      {addresses.length > 0 && (
        <ul className="space-y-4">
          {addresses.map((address) =>
            editingId === address.addrId ? (
              <li key={address.addrId}>
                <Card title={t("editTitle")}>
                  <AddressForm
                    address={address}
                    defaultCity={defaultCity}
                    onDone={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </Card>
              </li>
            ) : (
              <li key={address.addrId}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="mb-2 flex items-center gap-2">
                        <span className="ui-label font-body font-semibold text-forest [--label-size:12px]">
                          {address.label}
                        </span>
                        {address.isDefault && (
                          <span className="ui-label rounded-full bg-sage px-2.5 py-0.5 font-body font-semibold text-forest [--label-size:10px]">
                            {t("default")}
                          </span>
                        )}
                        {address.geo && (
                          // Shown because a pinned location is invisible
                          // otherwise, and the customer should be able to see
                          // that they shared it.
                          <span
                            title={t("locationTitle")}
                            className="text-forest/60"
                            aria-label={t("locationTitle")}
                          >
                            <MapPin size={13} strokeWidth={1.75} />
                          </span>
                        )}
                      </p>
                      <AddressLines address={address} />
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setEditingId(address.addrId);
                        }}
                        className="flex items-center gap-1.5 font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
                      >
                        <Pencil size={13} strokeWidth={1.75} />
                        {t("edit")}
                      </button>

                      {!address.isDefault && (
                        <form action={setDefaultAddressAction}>
                          <input type="hidden" name="addrId" value={address.addrId} />
                          <button
                            type="submit"
                            className="flex items-center gap-1.5 font-body text-xs text-stone underline underline-offset-4 hover:text-forest"
                          >
                            <Check size={13} strokeWidth={1.75} />
                            {t("setDefault")}
                          </button>
                        </form>
                      )}

                      {/* Destructive and not undoable, so it asks — in the
                          app's own dialog, not window.confirm. */}
                      <form action={deleteAddressAction}>
                        <input type="hidden" name="addrId" value={address.addrId} />
                        <ConfirmSubmit
                          label={t("remove")}
                          title={t("confirmRemove")}
                          message={t("confirmRemoveBody")}
                          confirmLabel={t("confirmRemoveAction")}
                          cancelLabel={t("cancel")}
                          className="font-body text-xs text-terracotta underline underline-offset-4 hover:text-terracotta/80"
                        />
                      </form>
                    </div>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ul>
      )}

      {adding ? (
        <Card title={t("addTitle")}>
          <AddressForm
            defaultRecipient={defaultRecipient}
            defaultPhone={defaultPhone}
            defaultCity={defaultCity}
            onDone={() => setAdding(false)}
            onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
          />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="flex items-center gap-2 rounded-full border border-forest/25 px-5 py-2.5 font-body text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
        >
          <Plus size={15} strokeWidth={2} />
          {t("addTitle")}
        </button>
      )}

      {addresses.length === 0 && !adding && (
        <p className="flex items-center gap-2 font-body text-sm text-stone">
          <X size={15} strokeWidth={1.5} />
          {t("empty")}
        </p>
      )}
    </div>
  );
}

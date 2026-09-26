"use client";

import { useState, type ReactNode } from "react";
import type { Address } from "@/lib/types";
import { AddressForm } from "./AddressForm";
import { PinStep, type CheckedPin } from "./PinStep";

/**
 * An address, PIN first: `PinStep`, then — once the PIN is one we deliver
 * to — `AddressForm` seeded with its district and state.
 *
 * Every place that adds or edits an address uses this, so the account page
 * and checkout cannot drift into asking in different orders. `layout` lets
 * checkout put the two steps in two cards; everywhere else they stack.
 *
 * Editing starts with the saved PIN already passed. Changing it drops the
 * form until the new one passes, and the form is keyed on the PIN so the new
 * district and state replace the old ones.
 */
export function AddressEntry({
  address,
  defaultRecipient,
  defaultPhone,
  onDone,
  onCancel,
  offerDefault,
  greensOnly,
  forSubscription,
  layout = (pin, form) => (
    <div className="space-y-5">
      {pin}
      {form}
    </div>
  ),
}: {
  address?: Address;
  defaultRecipient?: string;
  defaultPhone?: string;
  onDone: () => void;
  onCancel?: () => void;
  offerDefault?: boolean;
  /** See `PinStep`: refuse a PIN the own run cannot reach. */
  greensOnly?: boolean;
  /** See `PinStep`: the out-of-area wording for `/subscribe`. */
  forSubscription?: boolean;
  /** `form` is null until the PIN has passed. */
  layout?: (pin: ReactNode, form: ReactNode | null) => ReactNode;
}) {
  const [checked, setChecked] = useState<CheckedPin | null>(
    address
      ? {
          pincode: address.pincode,
          place:
            address.district && address.state
              ? { district: address.district, state: address.state }
              : null,
        }
      : null,
  );

  return layout(
    <PinStep
      checked={checked}
      onChecked={setChecked}
      onChange={() => setChecked(null)}
      onCancel={onCancel}
      greensOnly={greensOnly}
      forSubscription={forSubscription}
    />,
    checked && (
      <AddressForm
        key={checked.pincode}
        address={address}
        defaultRecipient={defaultRecipient}
        defaultPhone={defaultPhone}
        checked={checked}
        onDone={onDone}
        onCancel={onCancel}
        offerDefault={offerDefault}
      />
    ),
  );
}

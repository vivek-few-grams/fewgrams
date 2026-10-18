"use client";

import { FileText } from "lucide-react";

/**
 * Opens the browser's print dialog, where "Save as PDF" is one of the
 * printers — the invoice's PDF (SPEC §26.3).
 *
 * `target` names a sheet kept out of sight on the page (`PrintDoc`): it is
 * marked `data-printing` for as long as the dialog is open, which is what
 * `globals.css` prints. The page title is swapped for `fileName` meanwhile,
 * because a browser names the saved PDF after it.
 */
export function PrintButton({
  label,
  fileName,
  target,
}: {
  label: string;
  fileName: string;
  target: string;
}) {
  const print = () => {
    const sheet = document.getElementById(target);
    const title = document.title;
    sheet?.setAttribute("data-printing", "");
    document.title = fileName;
    /* Not after `print()` returns: on a phone the dialog does not block. */
    window.addEventListener(
      "afterprint",
      () => {
        sheet?.removeAttribute("data-printing");
        document.title = title;
      },
      { once: true },
    );
    window.print();
  };

  return (
    <button
      type="button"
      onClick={print}
      className="inline-flex items-center gap-2 font-body text-sm font-semibold text-forest underline underline-offset-4 transition-colors hover:text-stone"
    >
      <FileText aria-hidden size={16} strokeWidth={1.75} />
      {label}
    </button>
  );
}

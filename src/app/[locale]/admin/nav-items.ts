/**
 * The admin navigation map — SPEC §8.2, §12.
 *
 * A plain module, **not** part of `AdminNav.tsx`, and that is not tidiness:
 * `AdminNav` carries `"use client"`, and every export of a client module is a
 * client *reference* when a server component imports it. The layout needs the
 * label list to resolve one translation per item, and reading a client
 * reference on the server throws at request time — which it did, as a 500 on
 * every admin page, the moment the constant lived in the same file as the
 * component.
 *
 * ## Groups are declared here, and only for routes that exist
 *
 * A heading with nothing under it, or a link to a page that 404s, is worse
 * than an absent section — the repo already has one of those in the public nav
 * (`/how-we-grow`) and it should not gain a second. SPEC §12 lists the rest of
 * the admin surface still to come: cycles, sow plan, deliveries, orders,
 * subscriptions, customers, coupons, sales, pincodes, payments, reports,
 * settings. Each gets added here when its screen is built, under a new
 * heading — Operations, Sales, Settings — rather than in advance.
 */

/** `label` is a key under `admin.shell`, resolved by the layout. */
export type AdminNavItem = { label: string; href: string };

export const ADMIN_NAV_GROUPS: {
  /** `null` for the ungrouped block at the top. */
  heading: string | null;
  items: AdminNavItem[];
}[] = [
  /* Overview is ungrouped and first: it is the screen an operator lands on,
     and putting it under a heading would imply a sibling it does not have. */
  { heading: null, items: [{ label: "overview", href: "/admin" }] },
  {
    heading: "catalogue",
    items: [
      { label: "varieties", href: "/admin/varieties" },
      { label: "plans", href: "/admin/plans" },
      /* Seeds replaced the generic Products screen on 17 Sep 2026, at the
         owner's request: one pipe-delimited textarea served racks, trays,
         seeds and snacks, and the only category with real stock had to express
         it as a variant attribute. Trays and snacks get screens of their own
         when they are built — not a shared form (SPEC §22.3). */
      { label: "seeds", href: "/admin/seeds" },
      /* Trays and drainage cells, 17 Sep 2026 — the other half of what the
         deleted generic form was supposed to serve, now its own screen for
         its own reason: nothing in it is stocked and everything in it has a
         supplier lead time (SPEC §23). Sits after seeds because that is the
         order the owner asked for them in. */
      { label: "trays", href: "/admin/trays" },
      /* Three rack ranges, three price formulas, three screens (SPEC §19–§21).
         All three are named for their material — "Shelf racks", "Angle racks",
         "Pipe racks" — rather than leaving one as plain "Racks", which would be
         the ambiguous one. They sit adjacent and in the order they were built,
         which is also cheapest-first. */
      { label: "racks", href: "/admin/racks" },
      { label: "angleRacks", href: "/admin/angle-racks" },
      { label: "pipeRacks", href: "/admin/pipe-racks" },
    ],
  },
  {
    /* The first of the "settings" screens SPEC §12 lists — an owner switch
       for a whole product type, on or off, rather than a per-item field on
       one of the catalogue screens above (SPEC §12, added 20 Sep 2026). */
    heading: "settings",
    items: [{ label: "productVisibility", href: "/admin/settings" }],
  },
];

/** Every message key the nav renders, so the layout can resolve them all
 *  without this module owning a translation function. */
export const ADMIN_NAV_LABELS = ADMIN_NAV_GROUPS.flatMap((g) => [
  ...(g.heading ? [g.heading] : []),
  ...g.items.map((i) => i.label),
]);

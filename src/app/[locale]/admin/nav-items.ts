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
  /* Regrouped 18 Oct 2026 (the owner: "our menus have grown a lot, we need
     proper organisation") — twenty rows had outgrown the rail and the last
     ones sat under the footer. Each group now folds (`AdminNav`), and the old
     thirteen-row Catalogue is split by what the screens are for: what we grow
     and what we sell off the shelf.

     Sales first: orders are what an operator opens every day. */
  {
    heading: "sales",
    items: [
      { label: "orders", href: "/admin/orders" },
      /* Weekly plans and the tray plan they add up to (SPEC §5, §6). */
      { label: "subscriptions", href: "/admin/subscriptions" },
      /* Everyone who has signed in, and what they have bought (27 Sep 2026). */
      { label: "customers", href: "/admin/customers" },
    ],
  },
  /* The greens: what was sown each day (10 Oct 2026), the varieties sown, and
     the weekly plans built from them. */
  {
    heading: "growing",
    items: [
      { label: "sowing", href: "/admin/sowing" },
      { label: "varieties", href: "/admin/varieties" },
      { label: "plans", href: "/admin/plans" },
    ],
  },
  /* Everything sold off the shelf. Seeds replaced the generic Products screen
     on 17 Sep 2026, at the owner's request: one pipe-delimited textarea served
     racks, trays, seeds and snacks, and the only category with real stock had
     to express it as a variant attribute — so each kind has its own screen
     (SPEC §22.3), in the order the owner asked for them. Grow media is
     cocopeat, sold like a tray (SPEC §24). The three rack ranges have three
     price formulas and three screens (SPEC §19–§21), each named for its
     material so none is the ambiguous plain "Racks", cheapest first. */
  {
    heading: "shop",
    items: [
      { label: "seeds", href: "/admin/seeds" },
      { label: "trays", href: "/admin/trays" },
      { label: "growMedia", href: "/admin/grow-media" },
      { label: "racks", href: "/admin/racks" },
      { label: "angleRacks", href: "/admin/angle-racks" },
      { label: "pipeRacks", href: "/admin/pipe-racks" },
    ],
  },
  /* The GST books (SPEC §26, 18 Oct 2026): who we buy from, what we paid
     them, and the returns. Under its own heading because it is the one part
     of admin about money owed to the government rather than the shop. */
  {
    heading: "finance",
    items: [
      { label: "gst", href: "/admin/gst" },
      { label: "purchases", href: "/admin/purchases" },
      { label: "vendors", href: "/admin/vendors" },
    ],
  },
  {
    /* The first of the "settings" screens SPEC §12 lists — an owner switch
       for a whole product type, on or off, rather than a per-item field on
       one of the catalogue screens above (SPEC §12, added 20 Sep 2026). */
    heading: "settings",
    items: [
      { label: "productVisibility", href: "/admin/settings" },
      /* Pickup address and packing figures, 23 Sep 2026 — what checkout needs
         to ask the courier for a price (SPEC §7). */
      { label: "delivery", href: "/admin/delivery" },
    ],
  },
];

/** Every message key the nav renders, so the layout can resolve them all
 *  without this module owning a translation function. */
export const ADMIN_NAV_LABELS = ADMIN_NAV_GROUPS.flatMap((g) => [
  ...(g.heading ? [g.heading] : []),
  ...g.items.map((i) => i.label),
]);

import { describe, expect, it } from "vitest";
import {
  CURTAIN_SELECTOR,
  curtainAnchor,
  type CurtainAnchor,
  type CurtainClick,
} from "./curtain-anchor";

/**
 * Which clicks raise the brand curtain — SPEC §17.5.
 *
 * The rule this pins is the owner's, 17 Sep 2026: *"this full screen loader
 * should be shown only when i click on these options not for individual
 * pages."* Before that it ran on every internal navigation, so the test that
 * matters most is the second one below — an ordinary link must now pass
 * through untouched.
 *
 * Plain objects rather than a DOM, because there is no browser in the test
 * environment and every interesting case here is a combination of anchor
 * attributes. Same technique as `page-loader.test.ts`.
 */
const HERE = {
  origin: "http://localhost:3005",
  pathname: "/en/microgreens",
  href: "http://localhost:3005/en/microgreens",
};

type Spec = {
  href: string;
  /** Carries `data-curtain`, i.e. a header link. */
  curtain?: boolean;
  /** Carries `data-curtain` on an ancestor rather than itself. */
  curtainOnParent?: boolean;
  download?: boolean;
  target?: string;
};

function anchorFor(spec: Spec): CurtainAnchor {
  const self: CurtainAnchor = {
    getAttribute: (name) => (name === "href" ? spec.href : null),
    hasAttribute: (name) => name === "download" && spec.download === true,
    target: spec.target ?? "",
    /* The DOM property is always absolute. */
    href: new URL(spec.href, HERE.href).href,
    click: () => {},
    closest: (selector) => {
      if (selector !== CURTAIN_SELECTOR) return null;
      if (spec.curtain) return self;
      /* A container that opted its children in — a different element, which
         is the whole point of using `closest`. */
      if (spec.curtainOnParent) return { tagName: "DIV" };
      return null;
    },
  };
  return self;
}

function click(spec: Spec | null, mods: Partial<CurtainClick> = {}): CurtainClick {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: spec === null ? { closest: () => null } : { closest: () => anchorFor(spec) },
    ...mods,
  };
}

const raises = (spec: Spec | null, mods?: Partial<CurtainClick>) =>
  curtainAnchor(click(spec, mods), HERE) !== null;

describe("curtainAnchor — the curtain is opt-in", () => {
  it("raises on a header section link", () => {
    expect(raises({ href: "/en/shop", curtain: true })).toBe(true);
  });

  it("does NOT raise on an ordinary link to an individual page", () => {
    /* The owner's complaint, and the reason this module exists. A variety card
       in the grid is exactly this: a real internal navigation, no marker. */
    expect(raises({ href: "/en/microgreens/radish" })).toBe(false);
  });

  it("does not raise on any of the unmarked links around the page", () => {
    for (const href of [
      "/en/microgreens/radish", // a variety card
      "/en/shop/trays", // a category tile
      "/en/cart", // the bag icon
      "/en/account", // the account icon
      "/en/faq", // a footer link
    ])
      expect(raises({ href }), href).toBe(false);
  });

  it("raises on the brand logo", () => {
    /* Added on the owner's call, 17 Sep 2026: going home is a change of
       section like any nav link. */
    expect(raises({ href: "/en", curtain: true })).toBe(true);
  });

  it("keeps the logo quiet while you are already home", () => {
    expect(
      curtainAnchor(click({ href: "/", curtain: true }), {
        origin: HERE.origin,
        pathname: "/",
        href: "http://localhost:3005/",
      }),
    ).toBeNull();
  });

  it("raises on the language switch, which is a full document load", () => {
    /* The one link that most needs it, and the case the sessionStorage
       handoff in `PageLoader` exists for. */
    expect(raises({ href: "/kn/microgreens", curtain: true })).toBe(true);
  });

  it("accepts the marker on an ancestor, not only on the anchor", () => {
    expect(raises({ href: "/en/shop", curtainOnParent: true })).toBe(true);
  });
});

describe("curtainAnchor — reasons a curtain would be wrong anyway", () => {
  it("skips a link to the page already open", () => {
    expect(raises({ href: "/en/microgreens", curtain: true })).toBe(false);
  });

  it("skips a link that only changes the query string", () => {
    expect(raises({ href: "/en/microgreens?page=2", curtain: true })).toBe(false);
  });

  it("skips an in-page hash, which is what PLANS is on the home page", () => {
    /* `#plans` from the home page scrolls; a curtain would hide the very
       thing it scrolled to. Covered twice over — the bare-hash check and the
       same-pathname check — because the nav writes it as `/#plans`. */
    expect(raises({ href: "#plans", curtain: true })).toBe(false);
    expect(
      curtainAnchor(click({ href: "/#plans", curtain: true }), {
        origin: HERE.origin,
        pathname: "/",
        href: "http://localhost:3005/",
      }),
    ).toBeNull();
  });

  it("raises on PLANS from another page, where it really does navigate", () => {
    expect(raises({ href: "/#plans", curtain: true })).toBe(true);
  });

  it("skips a new tab, a named frame and a download", () => {
    expect(raises({ href: "/en/shop", curtain: true, target: "_blank" })).toBe(false);
    expect(raises({ href: "/en/shop", curtain: true, target: "side" })).toBe(false);
    expect(raises({ href: "/en/shop", curtain: true, download: true })).toBe(false);
    /* `_self` is the default and must not be mistaken for a named frame. */
    expect(raises({ href: "/en/shop", curtain: true, target: "_self" })).toBe(true);
  });

  it("skips another origin and a mailto:", () => {
    expect(raises({ href: "https://example.com/x", curtain: true })).toBe(false);
    expect(raises({ href: "mailto:hello@fewgrams.com", curtain: true })).toBe(false);
  });

  it("skips a modified click, a middle click and a handled click", () => {
    const open = { href: "/en/shop", curtain: true };
    expect(raises(open, { metaKey: true })).toBe(false);
    expect(raises(open, { ctrlKey: true })).toBe(false);
    expect(raises(open, { shiftKey: true })).toBe(false);
    expect(raises(open, { altKey: true })).toBe(false);
    expect(raises(open, { button: 1 })).toBe(false);
    expect(raises(open, { defaultPrevented: true })).toBe(false);
  });

  it("skips a click that is not on a link at all", () => {
    expect(raises(null)).toBe(false);
    /* And a target that cannot be asked — `document` itself has no
       `closest`, and the listener is registered on it. */
    expect(curtainAnchor(click(null, { target: {} }), HERE)).toBeNull();
    expect(curtainAnchor(click(null, { target: null }), HERE)).toBeNull();
  });

  it("skips an anchor with no href", () => {
    expect(raises({ href: "" })).toBe(false);
  });
});

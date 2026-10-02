import {
  LOOK_KEYS,
  TRAY_FINISH_KEYS,
  type Look,
  type TrayFinish,
} from "@/components/tray-play/kinds";

/**
 * The play garden's phases and what to reach for in each — no three.js
 * here, so the page can name, label and render buttons for the targets
 * without loading the renderer. `scene.ts` acts on them.
 */

export type Phase =
  | "choose"
  | "drop"
  | "takeTray"
  | "dip"
  | "steep"
  | "lift"
  | "takeCloth"
  | "wipe"
  | "takeCan"
  | "pour"
  | "takeScoop"
  | "fill"
  | "takePacket"
  | "sow"
  | "cover"
  | "hold"
  | "toLight"
  | "carry"
  | "uncover"
  | "light"
  | "water"
  | "takeCutter"
  | "cut"
  | "done";

export type Target =
  | TrayFinish
  | "basin"
  | "cloth"
  | "can"
  | "block"
  | "tray"
  | `packet-${Look}`
  | "lid"
  | "lamp"
  | "cutter";

export const TARGETS: readonly Target[] = [
  ...TRAY_FINISH_KEYS,
  "basin",
  "cloth",
  "can",
  "block",
  "tray",
  ...LOOK_KEYS.map((l) => `packet-${l}` as const),
  "lid",
  "lamp",
  "cutter",
];

/** A label pinned in the scene: every target, plus three that point at
 *  something without it being a thing to pick up — `medium`, the coco peat
 *  product's tag, `timer`, the soak clock, and `ad`, the framed product of
 *  the moment on the wall under the herb shelf. (The solution's name is
 *  printed on its tub, `dipTub`, not pinned.) */
export type Anchor = Target | "medium" | "timer" | "ad";
export const ANCHORS: readonly Anchor[] = [...TARGETS, "medium", "timer", "ad"];

/** How long the clean step's soak clock runs, in real seconds — a sped-up
 *  clock, not the soak time itself, which the copy does not state. */
export const STEEP_SECONDS = 3;

/** The dark step's days under the cover (the owner, 2 Oct 2026: a clock
 *  "saying that three days"). The count is printed from here, never written
 *  into the copy. On screen all of them pass in one day-and-night cycle of
 *  `DARK_SECONDS` (the owner, same day: three cycles took too long) — the
 *  caption says three days, the seed's stages step through them. */
export const DARK_DAYS = 3;
export const DARK_SECONDS = 5;

/** On a tall stage the dark step's split is one over the other, and the
 *  dark room on top takes this share, since the page's title and step
 *  dots sit over its top edge. */
export const DARK_SHARE_TALL = 0.6;

/** What to reach for next, per phase. `tray` is the tray itself — picked
 *  up, held under, lifted out, or the surface a gesture works on (wipe,
 *  sow, cut…). `basin` is the tub of sanitising solution it is dipped in. */
export function targetsFor(phase: Phase): Target[] {
  switch (phase) {
    case "choose":
      return [...TRAY_FINISH_KEYS];
    case "dip":
      return ["basin"];
    case "takeCloth":
      return ["cloth"];
    case "takeCan":
      return ["can"];
    case "pour":
    case "takeScoop":
      return ["block"];
    case "takePacket":
      return LOOK_KEYS.map((l) => `packet-${l}` as const);
    case "uncover":
      return ["lid"];
    case "light":
      return ["lamp"];
    case "water":
      return ["can"];
    case "takeCutter":
      return ["cutter"];
    case "takeTray":
    case "steep":
    case "lift":
    case "wipe":
    case "fill":
    case "sow":
    case "cut":
    case "toLight":
      return ["tray"];
    /* The cover goes on and the dark days pass by themselves. */
    case "cover":
    case "hold":
    case "carry":
    case "drop":
    case "done":
      return [];
  }
}

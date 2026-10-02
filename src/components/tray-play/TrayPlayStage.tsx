"use client";

import { getImageProps } from "next/image";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { TrayAnchor, TrayScene } from "./scene";
import { GhostHand } from "./GhostHand";

/**
 * The panel the trays are drawn in. The **photograph is the server render**
 * and the live scene is the enhancement — the storybook's rule (CLAUDE.md):
 * with no JavaScript, with reduced motion, or with no WebGL, the visitor gets
 * a still of the very same scene and loses nothing but the touch.
 *
 * Two stills, because the panel changes shape at `lg` (see `TrayPlay`) and
 * one picture cropped to the other shape loses a tray off each side. Both
 * are captures of this scene at rest, in `public/brand/` — retake them with
 * the same viewport sizes if the scene changes, or the fade from still to
 * live will visibly jump.
 *
 * three.js is fetched only when the panel is within a screen of the viewport,
 * so a visitor who never scrolls this far never downloads it. The canvas sits
 * over the photograph at opacity 0 and fades in after its first frame, so
 * there is never a blank panel between the two.
 *
 * `touch-action: pan-y` lets a vertical swipe scroll the page as usual while
 * a sideways one reaches the canvas — on a phone the trays are a strip the
 * thumb crosses, not a trap the page gets stuck in.
 */
const WIDE = { src: "/brand/tray-play.webp", width: 2608, height: 1120 };
const NARROW = {
  src: "/brand/tray-play-narrow.webp",
  width: 1344,
  height: 1010,
};
/* The panel is the 1400px container less its padding, and at `lg` the
   wide still is the only one in play. */
const WIDE_SIZES = "(min-width: 1400px) 1304px, calc(100vw - 96px)";
const NARROW_SIZES =
  "(min-width: 768px) calc(100vw - 96px), calc(100vw - 48px)";

export function TrayPlayStage({
  alt,
  tags,
  onLive,
  snug,
}: {
  alt: string;
  /** One per tray, in row order (amaranth, radish, sunflower), drawn once
   *  the scene is live over the whole panel, given that tray's anchors and
   *  the panel's size to place itself by. A null leaves a tray unlabelled. */
  tags?: (
    | ((
        anchor: TrayAnchor,
        panel: { width: number; height: number },
      ) => ReactNode)
    | null
  )[];
  /** Frame the trays tightly (see `mountTrayScene`). */
  snug?: boolean;
  /** Told when the scene takes over from the photograph. */
  onLive?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  /* The scene could not start (no WebGL, or its chunk failed): the
     photograph is the panel. */
  const [failed, setFailed] = useState(false);
  /* The ghost hand, moved by the scene's frame loop, not by React. */
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<TrayAnchor[]>([]);
  const [panel, setPanel] = useState({ width: 0, height: 0 });
  const onLiveRef = useRef(onLive);
  useEffect(() => {
    onLiveRef.current = onLive;
  });

  const {
    props: { srcSet: wide },
  } = getImageProps({
    src: WIDE.src,
    width: WIDE.width,
    height: WIDE.height,
    alt,
    sizes: WIDE_SIZES,
  });
  const { props: narrow } = getImageProps({
    src: NARROW.src,
    width: NARROW.width,
    height: NARROW.height,
    alt,
    sizes: NARROW_SIZES,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let scene: TrayScene | null = null;
    let cancelled = false;

    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        import("./scene")
          .then(({ mountTrayScene }) => {
            if (cancelled) return;
            scene = mountTrayScene(canvas, {
              onFirstFrame: () => {
                setLive(true);
                onLiveRef.current?.();
              },
              snug,
              onAnchors: (points) => {
                setAnchors(points);
                setPanel({
                  width: canvas.clientWidth,
                  height: canvas.clientHeight,
                });
              },
              ghost: () => ghostRef.current,
            });
            if (!scene) setFailed(true);
          })
          /* A failed chunk load leaves the photograph, which is complete. */
          .catch(() => setFailed(true));
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(canvas);

    return () => {
      cancelled = true;
      near.disconnect();
      scene?.dispose();
    };
  }, [snug]);

  return (
    <>
      <picture>
        <source media="(min-width: 1024px)" srcSet={wide} />
        <img
          {...narrow}
          alt={alt}
          /* The canvas is transparent between the trays, so the photograph
             has to go as the scene arrives or it shows through. */
          /* `snug` (the garden) frames the row smaller than the
             photographs were taken, so there the photograph stays hidden
             while the scene loads, or the trays shrink before the eye
             (the owner, 2 Oct 2026) — the garden's bench stills do the
             same. It is still the panel with reduced motion, without
             JavaScript (the noscript rule below) and when the scene
             fails. */
          className={`tray-still absolute inset-0 size-full object-cover transition-opacity duration-700 ${
            live
              ? "opacity-0"
              : snug && !failed
                ? "opacity-0 motion-reduce:opacity-100"
                : "opacity-100"
          }`}
        />
      </picture>
      {snug && (
        <noscript
          dangerouslySetInnerHTML={{
            __html: "<style>.tray-still{opacity:1!important}</style>",
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 size-full touch-pan-y transition-opacity duration-700 ${
          live ? "opacity-100" : "opacity-0"
        }`}
      />
      {live && tags && anchors.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {tags.map(
            (tag, n) =>
              tag &&
              anchors[n] && (
                <Fragment key={n}>{tag(anchors[n], panel)}</Fragment>
              ),
          )}
        </div>
      )}
      {/* No written instruction (the owner, 2 Oct 2026: "let ghost hand
          handle it"): the scene's show-how sweep is drawn as a pale hand
          brushing across the trays, and plays again while nobody has
          tried. It is decorative; the photograph's alt is what a screen
          reader gets. */}
      {live && (
        <GhostHand
          ghostRef={(el) => {
            ghostRef.current = el;
          }}
        />
      )}
    </>
  );
}

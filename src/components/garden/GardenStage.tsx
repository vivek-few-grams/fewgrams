"use client";

import { getImageProps } from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Look, TrayFinish } from "@/components/tray-play/kinds";
import { GhostHand } from "@/components/tray-play/GhostHand";
import type { GardenScene } from "./scene";
import { ANCHORS, type Anchor, type Phase, type Target } from "./targets";
import type { BenchStep } from "./steps";

/**
 * The bench the garden is grown on (steps 2–9), filling the stage. Like the
 * home page's tray, **the photograph is the server render** and the live
 * scene is the enhancement: with no JavaScript, no WebGL or reduced motion,
 * each step shows a still of the scene at the end of that step, and the page
 * lets the visitor walk through them with Next.
 *
 * Stills live in `public/garden/<step>.webp` (16:9, from `sm`) and
 * `<step>-narrow.webp` (portrait, phones), captured from this scene — retake
 * them if the scene changes (docs/GROW_JOURNEY_PLAN.md §7 says how).
 *
 * The scene is created once and kept across steps; a step change poses it.
 * three.js is fetched only when the stage is near the viewport, and after the
 * page's fonts are ready, because the solution's name is painted on its tub
 * with them.
 *
 * `labels` are the buttons pinned to whatever the scene says to reach for
 * next; the scene moves them, this file only renders them.
 */
const WIDE = { width: 1600, height: 900 };
const NARROW = { width: 780, height: 1560 };

export function GardenStage({
  step,
  finish,
  look,
  alt,
  labels,
  tubLabel,
  canLabel,
  doorLabel,
  trayTags,
  sceneRef,
  onLive,
  onStills,
  onProgress,
  onPick,
  onLook,
  onHover,
  onWall,
}: {
  step: BenchStep;
  finish: TrayFinish;
  look: Look;
  alt: string;
  labels: Partial<Record<Anchor, ReactNode>>;
  /** The solution's name, printed on the clean step's tub. */
  tubLabel: string;
  /** What the watering can holds, printed on it. */
  canLabel: string;
  /** The dark room's name, printed on its door. */
  doorLabel: string;
  /** What each tray pair is made of, printed on its front. */
  trayTags: Record<TrayFinish, string>;
  sceneRef: React.RefObject<GardenScene | null>;
  onLive: (live: boolean) => void;
  /** The scene will not run here (reduced motion, no WebGL, or its chunk
   *  failed): the stills are the garden. Until this or `onLive`, it is
   *  still loading. */
  onStills: () => void;
  onProgress: (step: BenchStep, progress: number, phase: Phase) => void;
  onPick: (finish: TrayFinish) => void;
  onLook: (look: Look) => void;
  onHover: (target: Target | null) => void;
  onWall: (inView: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  /* No WebGL, or the chunk would not load: the still stays as the page. */
  const [failed, setFailed] = useState(false);

  /* Latest props for the scene to start from, whenever it arrives. */
  const latest = useRef({
    step,
    finish,
    look,
    tubLabel,
    canLabel,
    doorLabel,
    trayTags,
    onProgress,
    onPick,
    onLook,
    onHover,
    onLive,
    onStills,
    onWall,
  });
  useEffect(() => {
    latest.current = {
      step,
      finish,
      look,
      tubLabel,
      canLabel,
      doorLabel,
      trayTags,
      onProgress,
      onPick,
      onLook,
      onHover,
      onLive,
      onStills,
      onWall,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      latest.current.onStills();
      return;
    }

    let scene: GardenScene | null = null;
    let cancelled = false;
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        Promise.all([import("./scene"), document.fonts.ready])
          .then(([{ mountGardenScene }]) => {
            if (cancelled) return;
            const now = latest.current;
            scene = mountGardenScene(canvas, {
              finish: now.finish,
              look: now.look,
              tubLabel: now.tubLabel,
              canLabel: now.canLabel,
              doorLabel: now.doorLabel,
              trayTags: now.trayTags,
              font: getComputedStyle(canvas).fontFamily,
              events: {
                onFirstFrame: () => {
                  setLive(true);
                  latest.current.onLive(true);
                },
                onProgress: (...args) => latest.current.onProgress(...args),
                onPick: (f) => latest.current.onPick(f),
                onLook: (l) => latest.current.onLook(l),
                onHover: (t) => latest.current.onHover(t),
                onWall: (v) => latest.current.onWall(v),
              },
            });
            if (!scene) {
              setFailed(true);
              latest.current.onStills();
              return;
            }
            sceneRef.current = scene;
            scene.setStep(latest.current.step);
          })
          /* A failed chunk load leaves the still, which is complete. */
          .catch(() => {
            setFailed(true);
            latest.current.onStills();
          });
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(canvas);
    return () => {
      cancelled = true;
      near.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
    /* Mounted once; later prop changes are sent below. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setFinish(finish);
  }, [finish, sceneRef]);
  useEffect(() => {
    sceneRef.current?.setLook(look);
  }, [look, sceneRef]);
  useEffect(() => {
    sceneRef.current?.setStep(step);
  }, [step, sceneRef]);

  /* Hand the scene every label element; it shows the ones that apply. */
  const labelKeys = (Object.keys(labels) as Anchor[]).join(" ");
  useEffect(() => {
    const scene = sceneRef.current;
    const root = labelsRef.current;
    if (!scene || !root) return;
    for (const name of ANCHORS) {
      scene.bindAnchor(
        name,
        root.querySelector<HTMLElement>(`[data-anchor="${name}"]`),
      );
    }
  }, [labelKeys, live, sceneRef]);

  const {
    props: { srcSet: wide },
  } = getImageProps({
    src: `/garden/${step}.webp`,
    ...WIDE,
    alt,
    sizes: "100vw",
  });
  const { props: narrow } = getImageProps({
    src: `/garden/${step}-narrow.webp`,
    ...NARROW,
    alt,
    sizes: "100vw",
  });

  return (
    <>
      <picture>
        <source media="(min-width: 640px)" srcSet={wide} />
        <img
          {...narrow}
          alt={alt}
          /* Hidden while the scene loads, when motion is allowed: the still
             was taken at one screen shape and the live scene frames itself
             to this one, so showing both made the bench jump on every
             reload. It is the page with reduced motion, without JavaScript
             (the noscript rule below) and when the scene fails. */
          className={`garden-still absolute inset-0 size-full object-cover transition-opacity duration-500 ${
            failed ? "opacity-100" : "opacity-0 motion-reduce:opacity-100"
          }`}
        />
      </picture>
      <noscript
        dangerouslySetInnerHTML={{
          __html: "<style>.garden-still{opacity:1!important}</style>",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        /* A game surface: a finger on it wipes, sows and cuts rather than
           scrolling. */
        className={`absolute inset-0 size-full touch-none select-none transition-opacity duration-500 ${
          live ? "opacity-100" : "opacity-0"
        }`}
      />
      <div ref={labelsRef}>
        {live &&
          (Object.keys(labels) as Anchor[]).map((name) => (
            <div
              key={name}
              data-anchor={name}
              data-show="false"
              data-place="above"
              className="group pointer-events-none absolute left-0 top-0 z-20 transition-opacity duration-300 data-[show=false]:invisible data-[show=false]:opacity-0 data-[show=true]:opacity-100 [&[data-show=true]_button]:pointer-events-auto"
            >
              {/* Above its point, or hung below it, or beside it
                  (`data-place`, set by the scene). */}
              <div className="-translate-x-1/2 -translate-y-full pb-2 group-data-[place=below]:translate-y-0 group-data-[place=below]:pb-0 group-data-[place=below]:pt-2 group-data-[place=left]:-translate-x-full group-data-[place=left]:-translate-y-1/2 group-data-[place=left]:pb-0 group-data-[place=left]:pr-3 group-data-[place=right]:translate-x-0 group-data-[place=right]:-translate-y-1/2 group-data-[place=right]:pb-0 group-data-[place=right]:pl-3 group-data-[place=frame]:translate-y-0 group-data-[place=frame]:pb-0">
                {labels[name]}
              </div>
            </div>
          ))}
      </div>
      {/* Over the labels, so the hand is on top of what it points at. */}
      {live && <GhostHand ghostRef={(el) => sceneRef.current?.bindGhost(el)} />}
    </>
  );
}

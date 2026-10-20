"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

/**
 * The search box's placeholder, typing real product names one after another —
 * SPEC §27.2. Returns the text typed so far, or null when it is not running:
 * the field is in use, the list has not landed, or the visitor has asked for
 * reduced motion — the caller then shows its plain placeholder.
 */

const TYPE_MS = 75;
const HOLD_MS = 1500;
const ERASE_MS = 35;
const GAP_MS = 350;

/** Letters as a reader sees them, not code points: a Kannada letter is often
 *  a consonant plus a vowel sign, and typing those apart shows a broken glyph
 *  for a frame. */
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const query = matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Reduced motion is assumed on the server, so nothing animates until the
 *  browser has said otherwise. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCED).matches,
    () => true,
  );
}

type Step = { word: number; length: number; erasing: boolean };

export function useTypewriter(names: readonly string[], running: boolean): string | null {
  const reduced = useReducedMotion();
  const words = useMemo(() => names.map(graphemes), [names]);
  const [step, setStep] = useState<Step>({ word: 0, length: 0, erasing: false });
  const on = running && !reduced && words.length > 0;

  useEffect(() => {
    if (!on) return;
    const letters = words[step.word % words.length];
    const [delay, next]: [number, Step] =
      !step.erasing && step.length < letters.length
        ? [TYPE_MS, { ...step, length: step.length + 1 }]
        : !step.erasing
          ? [HOLD_MS, { ...step, erasing: true }]
          : step.length > 0
            ? [ERASE_MS, { ...step, length: step.length - 1 }]
            : [GAP_MS, { word: step.word + 1, length: 0, erasing: false }];
    const timer = setTimeout(() => setStep(next), delay);
    return () => clearTimeout(timer);
  }, [on, words, step]);

  return on ? words[step.word % words.length].slice(0, step.length).join("") : null;
}

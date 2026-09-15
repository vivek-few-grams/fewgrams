import { describe, expect, it } from "vitest";
import { HANDOFF_MAX_AGE_MS, loaderInitScript } from "./loader-init";

/**
 * The curtain's pre-paint decision — SPEC §17.5.
 *
 * This script runs before React exists and before first paint, so it cannot be
 * rendered and asserted like a component; it is also the one piece of the
 * curtain whose bugs are invisible in a happy-path click-through. Getting it
 * wrong shows the intro to a repeat visitor, or leaves a page covered after a
 * full document load.
 *
 * It is executed here against stubs rather than in a browser because the
 * interesting cases are combinations of session state, and a browser test
 * would have to race a real navigation to observe an attribute that exists for
 * about 800ms.
 */

type Run = {
  /** `html[data-loader]` after the script ran, or null if it was left alone. */
  state: string | null;
  session: Record<string, string>;
};

function run(
  session: Record<string, string> = {},
  { reducedMotion = false }: { reducedMotion?: boolean } = {},
): Run {
  const store: Record<string, string> = { ...session };
  const dataset: Record<string, string> = {};

  /* The script body is `(function(){...})()`, so its bare `sessionStorage`,
     `matchMedia` and `document` references resolve to these parameters. */
  new Function(
    "sessionStorage",
    "matchMedia",
    "document",
    loaderInitScript,
  )(
    {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
    () => ({ matches: reducedMotion }),
    { documentElement: { dataset } },
  );

  return { state: dataset.loader ?? null, session: store };
}

/** A handoff flag written just now, which is the only kind that counts. The
 *  circle is centred, so the flag carries a timestamp and nothing else. */
function fresh(): string {
  return String(Date.now());
}

describe("loaderInitScript — what is decided before first paint", () => {
  it("covers the page on the first visit of a session", () => {
    expect(run().state).toBe("in");
  });

  /* The whole reason the decision happens in the head: a repeat visitor must
     never see a frame of a panel that is already being dismissed. */
  it("leaves a repeat visit uncovered", () => {
    expect(run({ "fg:loader": "1" }).state).toBeNull();
  });

  it("marks the session as seen, so the intro runs once", () => {
    expect(run().session["fg:loader"]).toBe("1");
    expect(run({ "fg:loader": "1" }).session["fg:loader"]).toBe("1");
  });

  describe("handing a curtain over a full document load", () => {
    /* The language switch loads a new document. Without this the curtain died
       with the old one and the new page cut in with no exit animation. */
    it("comes up already covered, with no entry animation", () => {
      expect(run({ "fg:loader": "1", "fg:curtain": fresh() }).state).toBe("hold");
    });

    it("takes precedence over the first-visit intro", () => {
      /* Possible when the very first click lands before hydration: the session
         is unseen and a curtain is in flight. `hold` is right — `in` would
         animate a panel that is already on screen. */
      expect(run({ "fg:curtain": fresh() }).state).toBe("hold");
    });

    /* Consumed on read. Left set, every later full load would raise a curtain
       for a navigation that had already finished. */
    it("consumes the flag", () => {
      const { session } = run({ "fg:curtain": fresh() });
      expect(session["fg:curtain"]).toBeUndefined();
    });

    /* The flag's consumer is not guaranteed to run: HOW WE GROW currently
       lands on the global 404, which sits outside `[locale]` and so has
       neither this script nor the component that clears the flag. A stale
       flag must not raise a curtain on an unrelated load later. */
    it("ignores a flag older than the handoff window", () => {
      const stale = String(Date.now() - HANDOFF_MAX_AGE_MS - 1);
      expect(run({ "fg:loader": "1", "fg:curtain": stale }).state).toBeNull();
    });

    it("falls back to the intro when a stale flag lands on a first visit", () => {
      const stale = String(Date.now() - HANDOFF_MAX_AGE_MS - 1);
      expect(run({ "fg:curtain": stale }).state).toBe("in");
    });

    it("ignores junk in the flag rather than covering the page", () => {
      expect(run({ "fg:loader": "1", "fg:curtain": "yes" }).state).toBeNull();
      expect(run({ "fg:loader": "1", "fg:curtain": "" }).state).toBeNull();
    });
  });

  describe("prefers-reduced-motion", () => {
    it("never covers the page", () => {
      expect(run({}, { reducedMotion: true }).state).toBeNull();
      expect(
        run({ "fg:curtain": fresh() }, { reducedMotion: true }).state,
      ).toBeNull();
    });

    /* Both keys are consumed before the bail, so turning motion back on
       mid-session does not then produce an intro. */
    it("still consumes both keys", () => {
      const { session } = run(
        { "fg:curtain": fresh() },
        { reducedMotion: true },
      );
      expect(session["fg:curtain"]).toBeUndefined();
      expect(session["fg:loader"]).toBe("1");
    });
  });

  /* Private browsing throws on `sessionStorage` access in some browsers, and a
     full quota throws on write. A decorative curtain must not be the reason a
     page fails to render. */
  it("swallows a sessionStorage that throws", () => {
    const dataset: Record<string, string> = {};
    const boom = () => {
      throw new Error("SecurityError");
    };
    expect(() =>
      new Function("sessionStorage", "matchMedia", "document", loaderInitScript)(
        { getItem: boom, setItem: boom, removeItem: boom },
        () => ({ matches: false }),
        { documentElement: { dataset } },
      ),
    ).not.toThrow();
    expect(dataset.loader).toBeUndefined();
  });
});

import { hideGhost, placeGhost } from "./ghost";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  brush,
  wave,
  WAVE_LIFE,
  createField,
  isSettled,
  packField,
  stepField,
  type FieldRect,
} from "./field";
import { HOME_ROW } from "./kinds";
import {
  LOOKS,
  fullMask,
  mulberry32,
  plantMesh,
  plantStems,
  sharedUniforms,
} from "./plants";
import {
  MEDIUM_Y,
  TRAY_D,
  TRAY_W,
  contactShadowTexture,
  disposeTrayMaterials,
  mediumHalf,
  mediumTexture,
  roundedRect,
  trayMaterials,
  trayPair,
} from "./tray";

/**
 * The home page's trays of greens — and step 1 of the play garden — drawn
 * with three.js and bent by the spring field in `field.ts`.
 *
 * Three trays side by side — red amaranth, radish, sunflower — because one
 * variety reads as a lawn, and the three together are the shop's range at a
 * glance (and the same three are on the hero's trays photograph). What a
 * stem looks like is in `plants.ts`; what a tray looks like, in `tray.ts`.
 * This file is the room: renderer, light, camera, the hand and the loop.
 *
 * Loaded with a dynamic `import()` from `TrayPlayStage`, never statically,
 * so three.js stays out of every shared bundle — and out of the page's own
 * until the panel is nearly on screen.
 */

const ROW = HOME_ROW.map((l) => LOOKS[l]);
const TRAY_GAP = 0.3;

const SPAN_X = 3 * TRAY_W + 2 * TRAY_GAP;
const FIELD_RECT: FieldRect = {
  minX: -SPAN_X / 2 - 0.1,
  minZ: -TRAY_D / 2 - 0.1,
  width: SPAN_X + 0.2,
  depth: TRAY_D + 0.2,
};
const FIELD_NX = 112;
const FIELD_NZ = 48;

/** The height the hand is taken to be at — mid-canopy, so the cursor sits
 *  on the leaves it is moving rather than on the medium below them. */
const HAND_Y = MEDIUM_Y + 0.45;

/** The show-how sweep: once, when the panel is first half on screen, an
 *  unseen hand runs across the row and back, so the visitor sees what the
 *  trays do before they are asked to try. Any real pointer ends it. */
const DEMO_DELAY = 0.5;
const DEMO_TIME = 3.4;
/** The sweep is drawn as the ghost hand (`ghost.ts`), and played again
 *  while nobody has touched the trays: after this long without a hand,
 *  and at most this many times more. */
const DEMO_AGAIN_AFTER = 6;
const DEMO_REPLAYS = 2;

const STEP = 1 / 120;
const MAX_STEPS = 6;

export type TrayScene = { dispose: () => void };
type Point = { x: number; y: number };
/** Points on one tray, on the canvas: the middle of its front edge; three
 *  just over the top of its canopy — middle, left and right of the back
 *  row; and one just outside each long side. */
export type TrayAnchor = {
  left: Point;
  right: Point;
  front: Point;
  back: Point;
  backLeft: Point;
  backRight: Point;
};

/**
 * Draws into `canvas`, sized to its parent, and answers the pointer. Returns
 * `null` without touching the canvas when WebGL is unavailable, so the
 * caller keeps showing its photograph. `onFirstFrame` fires once the canvas
 * has something on it, which is when the caller should fade it in.
 */
export function mountTrayScene(
  canvas: HTMLCanvasElement,
  {
    onFirstFrame,
    onDemo,
    onAnchors,
    ghost,
    snug = false,
  }: {
    onFirstFrame: () => void;
    onDemo?: () => void;
    /** The ghost hand's element, moved to wherever the sweep's unseen hand
     *  is so the visitor sees a hand doing it (`GhostHand`). */
    ghost?: () => HTMLElement | null;
    /** Each tray's `TrayAnchor`, in CSS pixels and row order — for a
     *  caller that pins a label to each tray. Sent on every resize, since
     *  the camera only moves then. */
    onAnchors?: (points: TrayAnchor[]) => void;
    /** Frame the row tightly, with little bench round it — for a panel that
     *  is the whole screen rather than a band of the home page. */
    snug?: boolean;
  },
): TrayScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  /* Fewer stems where the pointer is a finger — a phone draws the panel at
     a third of the size, so the density would be invisible anyway. */
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const thin = coarse ? 0.5 : 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const sun = new THREE.Vector3(-0.55, 1, 0.45).normalize();

  /* A soft studio environment for the plastic to reflect — without it a
     black tray is a flat black shape with no rim to it. Only the standard
     materials (trays, peat) see it; the stems light themselves. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  pmrem.dispose();
  /* Rendering the environment leaves the renderer's clear state as it found
     it on paper; set it again so the panel behind is never tinted. */
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.HemisphereLight(0xfff7ea, 0x8a7a66, 1.6));
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sunLight.position.copy(sun).multiplyScalar(10);
  scene.add(sunLight);

  const rand = mulberry32(20260926);
  const disposables: { dispose: () => void }[] = [];

  const shadowTex = contactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const trayMats = trayMaterials("tray-pair");
  const mediumTex = mediumTexture(rand);
  mediumTex.repeat.set(0.9, 0.9);
  const mediumMat = new THREE.MeshStandardMaterial({
    map: mediumTex,
    roughness: 1,
    envMapIntensity: 0,
  });
  disposables.push(envMap, shadowTex, shadowMat, mediumTex, mediumMat, {
    dispose: () => disposeTrayMaterials(trayMats),
  });

  const field = createField(FIELD_NX, FIELD_NZ, FIELD_RECT);
  const fieldBytes = new Uint8Array(FIELD_NX * FIELD_NZ * 4);
  packField(field, fieldBytes);
  const fieldTex = new THREE.DataTexture(
    fieldBytes,
    FIELD_NX,
    FIELD_NZ,
    THREE.RGBAFormat,
  );
  fieldTex.magFilter = THREE.LinearFilter;
  fieldTex.minFilter = THREE.LinearFilter;
  fieldTex.needsUpdate = true;
  const maskTex = fullMask();
  disposables.push(fieldTex, maskTex);

  const shared = sharedUniforms(fieldTex, FIELD_RECT, maskTex, sun);
  const time = shared.time;

  ROW.forEach((v, n) => {
    const cx = (n - 1) * (TRAY_W + TRAY_GAP);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(TRAY_W * 1.45, TRAY_D * 1.33),
      shadowMat,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(cx + 0.12, 0.001, 0.1);
    scene.add(shadow);
    disposables.push(shadow.geometry);

    const tray = trayPair(cx, trayMats);
    scene.add(tray);
    tray.traverse((o) => {
      if (o instanceof THREE.Mesh) disposables.push(o.geometry);
    });

    const { hw, hd, corner } = mediumHalf();
    const medium = new THREE.Mesh(roundedRect(hw, hd, corner), mediumMat);
    medium.position.set(cx, MEDIUM_Y, 0);
    scene.add(medium);
    disposables.push(medium.geometry);

    const { stems, extra } = plantStems(
      v,
      cx,
      2 * hw - 0.06,
      2 * hd - 0.06,
      thin,
      rand,
    );
    const mesh = plantMesh(v, stems, extra, MEDIUM_Y, shared);
    scene.add(mesh);
    disposables.push(mesh.geometry, mesh.material as THREE.Material);
  });

  /* ---- framing ---- */
  const target = new THREE.Vector3(0, 0.35, 0.05);
  const ELEVATION = 0.68; // radians above the horizon
  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* Back off until the row fits across, and the trays' depth fits down —
       whichever needs more room at this aspect. */
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const across = (SPAN_X / 2 + (snug ? 0.8 : 0.9)) / Math.tan(halfH);
    const down =
      (TRAY_D * Math.sin(ELEVATION) * 0.5 + (snug ? 0.7 : 0.95)) /
      Math.tan(halfV);
    /* The garden's own screen (`snug`) draws the row a tenth smaller on a
       screen wide enough to spare it (the owner, 2 Oct 2026: "reduce
       only 10%"), for room round it; a phone's row is already as small
       as it can go across. */
    const dist = Math.max(across, down) / (snug && w >= 640 ? 0.9 : 1);
    camera.position
      .set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist)
      .add(target);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (onAnchors) {
      const toCanvas = (x: number, y: number, z: number) => {
        const p = new THREE.Vector3(x, y, z).project(camera);
        return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
      };
      const { hw } = mediumHalf();
      onAnchors(
        ROW.map((v, n) => {
          const cx = (n - 1) * (TRAY_W + TRAY_GAP);
          /* Over the tallest stems, so an arrow ending here stays off the
             leaves. */
          const top = MEDIUM_Y + v.height + v.heightJitter + 0.22;
          const z = -TRAY_D / 2 + 0.05;
          return {
            front: toCanvas(cx, 0, TRAY_D / 2 + 0.08),
            back: toCanvas(cx, top, z),
            backLeft: toCanvas(cx - hw + 0.2, top, z),
            backRight: toCanvas(cx + hw - 0.2, top, z),
            /* Just outside each long side, a third of the way back and
               at canopy height — clear of the leaves that splay over the
               rim. */
            left: toCanvas(cx - hw - 0.3, MEDIUM_Y + v.height, -TRAY_D * 0.15),
            right: toCanvas(cx + hw + 0.3, MEDIUM_Y + v.height, -TRAY_D * 0.15),
          };
        }),
      );
    }
  }
  resize();
  const resizer = new ResizeObserver(resize);
  if (canvas.parentElement) resizer.observe(canvas.parentElement);

  /* ---- the hand ---- */
  const ray = new THREE.Raycaster();
  const handPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HAND_Y);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const hand = { on: false, x: 0, z: 0, vx: 0, vz: 0, t: 0 };

  function onMove(e: PointerEvent) {
    endDemo();
    demo.touched = true;
    const box = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(handPlane, hit)) return;
    const now = e.timeStamp / 1000;
    if (hand.on && now > hand.t) {
      const dt = Math.max(now - hand.t, 1 / 240);
      /* Smoothed, so a jittery mouse does not read as a flick. */
      hand.vx += ((hit.x - hand.x) / dt - hand.vx) * 0.5;
      hand.vz += ((hit.z - hand.z) / dt - hand.vz) * 0.5;
    } else {
      hand.vx = 0;
      hand.vz = 0;
    }
    hand.on = true;
    hand.x = hit.x;
    hand.z = hit.z;
    hand.t = now;
  }
  function onLeave() {
    hand.on = false;
  }
  /* A mouse stays over the tray after a click; a finger lifted has left. */
  function onUp(e: PointerEvent) {
    if (e.pointerType !== "mouse") onLeave();
  }
  /* A click (or tap) sends a wave out across the trays from where it
     lands (the owner, 3 Oct 2026). A few may run at once. */
  type Bed = { minX: number; maxX: number; minZ: number; maxZ: number };
  const waves: { x: number; z: number; age: number; bed: Bed }[] = [];
  /* Each tray's bed, so a wave stays in the tray clicked. */
  const bedHalf = mediumHalf();
  const beds: Bed[] = ROW.map((_, n) => {
    const cx = (n - 1) * (TRAY_W + TRAY_GAP);
    return {
      minX: cx - bedHalf.hw,
      maxX: cx + bedHalf.hw,
      minZ: -bedHalf.hd,
      maxZ: bedHalf.hd,
    };
  });
  function onDown(e: PointerEvent) {
    onMove(e);
    if (!hand.on) return;
    const bed = beds.find(
      (b) =>
        hand.x >= b.minX &&
        hand.x <= b.maxX &&
        hand.z >= b.minZ &&
        hand.z <= b.maxZ,
    );
    if (!bed) return;
    if (waves.length >= 4) waves.shift();
    waves.push({ x: hand.x, z: hand.z, age: 0, bed });
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointercancel", onLeave);
  canvas.addEventListener("pointerup", onUp);

  /* ---- the show-how sweep ---- */
  const demo = {
    start: -1,
    done: false,
    inView: false,
    x: 0,
    z: 0,
    /** Where the sweep is, 0 to 1, or -1 when it is not running. */
    u: -1,
    /** When the last sweep ended, and how many have been played again. */
    ended: 0,
    replays: 0,
    /** A real hand has been over the trays: no more sweeps. */
    touched: false,
  };
  function endDemo() {
    demo.u = -1;
    if (demo.done) return;
    demo.done = true;
    if (demo.start >= 0) hand.on = false;
  }
  /** Across the row and back, easing at each end, with a gentle weave in
   *  depth so it reads as a hand rather than a ruler. */
  function demoAt(u: number) {
    const reach = SPAN_X / 2 + 0.4;
    const leg = u < 0.5 ? u * 2 : 2 - u * 2;
    const eased = leg * leg * (3 - 2 * leg);
    return {
      x: -reach + 2 * reach * eased,
      z: 0.35 * Math.sin(u * Math.PI * 4),
    };
  }
  function driveDemo(now: number) {
    if (demo.done) {
      /* Nobody has tried it: show it again, a little later. */
      if (
        demo.touched ||
        demo.replays >= DEMO_REPLAYS ||
        !demo.inView ||
        now - demo.ended < DEMO_AGAIN_AFTER
      )
        return;
      demo.replays++;
      demo.done = false;
      demo.start = now;
    }
    if (demo.start < 0) {
      if (!demo.inView) return;
      demo.start = now;
      onDemo?.();
    }
    const u = (now - demo.start - DEMO_DELAY) / DEMO_TIME;
    if (u < 0) return;
    if (u >= 1) {
      endDemo();
      demo.ended = now;
      return;
    }
    demo.u = u;
    const at = demoAt(u);
    if (hand.on && now > hand.t) {
      const dt = now - hand.t;
      hand.vx = (at.x - hand.x) / dt;
      hand.vz = (at.z - hand.z) / dt;
    }
    hand.on = true;
    hand.x = at.x;
    hand.z = at.z;
    hand.t = now;
  }

  /** The sweep's hand, drawn: the fingertip on the leaves where the
   *  unseen hand is, fading in and out at the ends of the sweep. */
  const ghostAt = new THREE.Vector3();
  function drawGhost() {
    const el = ghost?.() ?? null;
    if (!el) return;
    if (demo.u < 0) return hideGhost(el);
    ghostAt.set(hand.x, HAND_Y, hand.z).project(camera);
    const fade = Math.min(1, demo.u / 0.08, (1 - demo.u) / 0.08);
    placeGhost(
      el,
      ((ghostAt.x + 1) / 2) * canvas.clientWidth,
      ((1 - ghostAt.y) / 2) * canvas.clientHeight,
      fade,
    );
  }

  /* ---- loop ---- */
  let raf = 0;
  let visible = true;
  let last = 0;
  let acc = 0;
  let first = true;
  let fieldMoving = false;

  function frame(ms: number) {
    raf = 0;
    const now = ms / 1000;
    const dt = last ? Math.min(now - last, 0.1) : STEP;
    last = now;
    time.value += dt;
    driveDemo(now);

    /* A hand that has stopped moving decays its speed, so a cursor parked
       on the tray parts it but does not keep sweeping. */
    if (hand.on && now - hand.t > 0.05) {
      hand.vx *= 0.8;
      hand.vz *= 0.8;
    }

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      if (hand.on) brush(field, hand.x, hand.z, hand.vx, hand.vz, STEP);
      for (const w of waves) {
        wave(field, w.x, w.z, w.age, STEP, w.bed);
        w.age += STEP;
      }
      while (waves.length && waves[0].age >= WAVE_LIFE) waves.shift();
      stepField(field, STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;

    /* Skip the upload once everything is upright and still — the idle sway
       is in the shader and needs no texture change. */
    const settled = !hand.on && waves.length === 0 && isSettled(field);
    if (!settled || fieldMoving) {
      packField(field, fieldBytes);
      fieldTex.needsUpdate = true;
    }
    fieldMoving = !settled;

    renderer.render(scene, camera);
    drawGhost();
    if (first) {
      first = false;
      onFirstFrame();
    }
    schedule();
  }

  function schedule() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function onVisibility() {
    last = 0;
    schedule();
  }

  /* Off screen, or in a background tab, the loop stops entirely. */
  const watcher = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      demo.inView = entry.intersectionRatio >= 0.5;
      last = 0;
      schedule();
    },
    { threshold: [0, 0.5] },
  );
  watcher.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  return {
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      watcher.disconnect();
      resizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("pointerup", onUp);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}

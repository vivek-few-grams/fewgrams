import * as THREE from "three";
import { CORNER_X, DARK_SPOT, DOOR, WALL_AD, WALL_Z, kitchen } from "./kitchen";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  brush,
  createField,
  isSettled,
  packField,
  stepField,
  type FieldRect,
} from "@/components/tray-play/field";
import {
  LOOKS,
  mulberry32,
  plantMesh,
  plantStems,
  seedMesh,
  sharedUniforms,
  fullMask,
  sprigGeometry,
  type Look,
  type Stems,
} from "@/components/tray-play/plants";
import { LOOK_KEYS, TRAY_FINISH_KEYS } from "@/components/tray-play/kinds";
import {
  CORNER,
  MEDIUM_Y,
  TRAY_D,
  TRAY_H,
  TRAY_RAISE,
  TRAY_W,
  WATER_MARGIN,
  contactShadowTexture,
  disposeTrayMaterials,
  floorHalf,
  innerWallAt,
  mediumHalf,
  mediumTexture,
  roundedRect,
  trayGeometry,
  trayMaterials,
  trayPair,
  type TrayFinish,
  type TrayMaterials,
} from "@/components/tray-play/tray";
import {
  BASIN_H,
  BASIN_R,
  Bin,
  Particles,
  SPOUT,
  basin,
  basinRadiusAt,
  bench,
  blobShadow,
  blobShadowTexture,
  bowl,
  cloth,
  grime,
  peatBlock,
  cutter,
  CUTTER_BLADE,
  seedPacket,
  shelfRack,
  SHELF_RACK,
  PACKET,
  shapeBlock,
  dipTub,
  rippleWater,
  DIP,
  wateringCan,
  trayPrint,
} from "./props";
import type { BenchStep } from "./steps";
import {
  GHOST_IDLE_SECONDS,
  hideGhost,
  placeGhost,
} from "@/components/tray-play/ghost";
import {
  DARK_DAYS,
  DARK_SECONDS,
  DARK_SHARE_TALL,
  STEEP_SECONDS,
  type Anchor,
  TARGETS,
  targetsFor,
  type Phase,
  type Target,
} from "./targets";

export type { Phase, Target } from "./targets";

/**
 * The play garden's bench — SPEC §25. One tray, grown from empty to harvest
 * across eight steps, with the things we sell turning up when they are
 * needed: the tray pair, the coco peat block, the seed, the rack and its
 * light.
 *
 * **Pick up, then use.** Every step is a short run of phases, and each phase
 * names its *targets*: the one or two things on the bench to reach for next
 * (the spray bottle, then the tray; the cloth, then the tray). A target gets
 * a pulsing ring and a bob, and the page pins a short label to it. Clicking a
 * tool puts it in the hand — it follows the pointer — and the hand then does
 * the work on the tray. That is the whole interface (the owner, 1 Oct 2026:
 * "show and highlight whichever item the user should pick next"), so the
 * page around it can say almost nothing.
 *
 * **Every step starts from a known state.** `setStep` poses the bench as it
 * would be had every step before it been done, so a link to `?step=sow`,
 * Back and Skip all land somewhere coherent.
 *
 * **One input path for a hand and for "Do it for me".** The autoplay picks
 * the tools up and drives a synthetic pointer through the same handlers, so
 * the keyboard route is the same garden. Each target's label is a real
 * button that does what clicking the object does.
 *
 * **Portrait is laid out differently.** On a phone held upright the props
 * sit in front of the tray, near the thumb, rather than beside it, which
 * would shrink the tray to fit them across.
 *
 * Loaded with a dynamic `import()` from `GardenStage`, never statically.
 */

export type GardenEvents = {
  onFirstFrame: () => void;
  onProgress: (step: BenchStep, progress: number, phase: Phase) => void;
  /** A tray pair was chosen on the bench. */
  onPick: (finish: TrayFinish) => void;
  /** A seed packet was picked up. */
  onLook: (look: Look) => void;
  /** The pointer is over something that can be clicked (or not). */
  onHover: (target: Target | null) => void;
  /** Whether the wall under the herb shelf is in view, whole, for the
   *  framed product (`ad`). Sent when it changes. */
  onWall: (inView: boolean) => void;
};

export type GardenScene = {
  setStep: (step: BenchStep) => void;
  setFinish: (finish: TrayFinish) => void;
  setLook: (look: Look) => void;
  /** What clicking the target on the bench does. */
  select: (target: Target) => void;
  /** Press-and-hold from a button, for pouring. */
  hold: (on: boolean) => void;
  /** How many dark days have gone by under the cover, 0 to `DARK_DAYS`,
   *  for the window that shows them passing outside. */
  days: () => number;
  /** The dark room's share of the dark step's split screen, 1 (alone) to
   *  0 (the tray carried out into the light); 1 outside the split. */
  split: () => number;
  /** Finish the current step by itself, through the same handlers. */
  autoplay: () => void;
  bindAnchor: (name: Anchor, el: HTMLElement | null) => void;
  /** The ghost hand (`GhostHand`), shown doing the move when the visitor
   *  has been still for `GHOST_IDLE_SECONDS`. */
  bindGhost: (el: HTMLElement | null) => void;
  dispose: () => void;
};

/* ------------------------------------------------------------- layout */

const FLOOR_Y = TRAY_RAISE + 0.013;
/** How far the crop has come (the shader's `uGrow`, 0–1) when the dark
 *  days end: short, pale shoots about half the height they were first
 *  drawn at, then shorter again (the owner, 3 Oct 2026: "immediately after blackout, plants
 *  wont be this tall"). The light step grows them the rest of the way. */
const DARK_GROW = 0.31;
const LEVEL = MEDIUM_Y - FLOOR_Y;
const MED = mediumHalf();
const FLOOR = floorHalf();
const FIELD_RECT: FieldRect = {
  minX: -MED.hw - 0.1,
  minZ: -MED.hd - 0.1,
  width: 2 * MED.hw + 0.2,
  depth: 2 * MED.hd + 0.2,
};
const FIELD_NX = 40;
const FIELD_NZ = 52;
const MASK_NX = 44;
const MASK_NZ = 56;
const HF_NX = 36;
const HF_NZ = 46;
/** The light step's tray goes on the rack's second shelf, which stands
 *  where the bench is: the room and the floor drop by its height instead
 *  of the tray rising, so everything aimed at the tray stays put. */
const OUR_SHELF = 1;
const RACK_DROP = SHELF_RACK.shelves[OUR_SHELF];
/** Where the rack stands in the kitchen: against the plain wall left of the
 *  dark room's door (the owner, 2 Oct 2026), so the trip to the dark room
 *  passes it and the tray comes out to it. Clear of the door's swing. */
const RACK_AT = new THREE.Vector3(
  CORNER_X + SHELF_RACK.w / 2 + 0.2,
  0,
  WALL_Z + SHELF_RACK.d / 2 + 0.2,
);
const RIM_Y = TRAY_RAISE + TRAY_H + 0.004;
/** The lid's pivot sits at its mid-height, so it can flip in place. The lid
 *  is the pair's own water tray, taken from under the grow tray (which then
 *  stands on the bench, `TRAY_RAISE` lower) and upturned onto its rim. */
const LID_ON = TRAY_H + TRAY_H / 2 + 0.012;
const LID_OFF = TRAY_H / 2;
/** How far the shoots have pushed the cover up by the end of the dark. */
const LID_LIFT = 0.3;

type XZ = [number, number];
type Layout = {
  pick: Record<TrayFinish, XZ>;
  cloth: XZ;
  /** The tub of sanitising solution, for the clean step. */
  dip: XZ;
  basin: XZ;
  can: XZ;
  canLight: XZ;
  packets: Record<Look, XZ>;
  lid: XZ;
  bowl: XZ;
  cutter: XZ;
  /** How much larger than modelled the soak step's can is drawn. */
  canScale: number;
};
const WIDE: Layout = {
  pick: { "tray-pair": [-1.3, 0], "tray-pair-food-grade": [1.3, 0] },
  /* The solution comes in right of the tray and the cloth right of that,
     each with a clear gap so the three read as separate things. */
  cloth: [7.0, 0.4],
  dip: [3.75, 0],
  /* Tray, bowl and can in one row (the owner, 2 Oct 2026), each with a
     clear gap, the can's spout pointing back at the bowl. */
  basin: [3.2, 0],
  can: [6.15, 0],
  /* On the rack's shelf, beside the tray. */
  canLight: [1.85, 0.7],
  /* A row along the bench, two each side of the tray (the owner, 2 Oct
     2026), spaced so the names over them never meet. */
  packets: {
    amaranth: [-3.05, 0.35],
    radish: [-1.95, 0.35],
    sunflower: [1.95, 0.35],
    mustard: [3.05, 0.35],
  },
  lid: [2.45, 0],
  bowl: [2.05, 0.45],
  /* Right of the bowl, so the left of the bench is the kit card's (the
     owner, 3 Oct 2026). */
  cutter: [3.75, 0.7],
  canScale: 2,
};
/** The bench kept clear beside each end tray of the pick step, on a wide
 *  stage, for its product card. */
const PICK_CARD_ROOM = 1.6;
const TALL: Layout = {
  pick: { "tray-pair": [0, -1.45], "tray-pair-food-grade": [0, 1.45] },
  cloth: [0, 5.75],
  dip: [0, 3.55],
  basin: [-0.5, 2.75],
  can: [1.65, 2.7],
  canLight: [1.85, 0.7],
  /* Staggered, so three labels on a narrow screen do not collide. */
  packets: {
    amaranth: [-1.2, 2.05],
    radish: [-0.4, 2.75],
    sunflower: [0.4, 2.05],
    mustard: [1.2, 2.75],
  },
  lid: [0, 3.05],
  bowl: [0.55, 2.3],
  cutter: [-0.85, 2.15],
  canScale: 1.3,
};

const v3 = ([x, z]: XZ, y = 0) => new THREE.Vector3(x, y, z);

/* The coco peat bowl and the watering can are drawn larger than modelled
   for the soak step (the owner, 2 Oct 2026): beside a full-size tray at
   true scale they read as toys. The can is doubled on a wide screen and
   only a third up on a phone, where its doubled span would shrink the
   tray to fit the width; it goes back to 1 on the rack, where it pours
   from a fixed pose beside the light. */
const BOWL = 1.4;
/** The soak step's can stands side on with its spout toward the bowl, and
 *  keeps that heading in the hand. */
const CAN_YAW = 3.0;

const STEP = 1 / 120;
const MAX_STEPS = 6;
const ease = (t: number) => 1 - (1 - t) ** 3;
const smooth = THREE.MathUtils.smoothstep;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function clampRounded(
  x: number,
  z: number,
  hw: number,
  hd: number,
  r: number,
): [number, number] {
  const cx = hw - r;
  const cz = hd - r;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= cx || az <= cz) return [x, z];
  const dx = ax - cx;
  const dz = az - cz;
  const d = Math.hypot(dx, dz);
  if (d <= r) return [x, z];
  return [
    Math.sign(x) * (cx + (dx / d) * r),
    Math.sign(z) * (cz + (dz / d) * r),
  ];
}

/** Boustrophedon across the peat: s 0 → 1 visits every row once. */
function zigzag(s: number, rows: number, inset = 0.12): [number, number] {
  const t = clamp01(s) * rows;
  const row = Math.min(rows - 1, Math.floor(t));
  const f = t - row;
  const hw = MED.hw - inset;
  const hd = MED.hd - inset;
  const x = THREE.MathUtils.lerp(-hw, hw, row % 2 === 0 ? f : 1 - f);
  const z = THREE.MathUtils.lerp(-hd, hd, (row + 0.5) / rows);
  return [x, z];
}

type Tween = {
  t: number;
  dur: number;
  run: (k: number) => void;
  done?: () => void;
};

/** A prop on a rig: the outer group is where it stands, the inner is moved
 *  by the bob and the hover lift, so neither fights the other. */
function rig(inner: THREE.Object3D) {
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

export function mountGardenScene(
  canvas: HTMLCanvasElement,
  {
    events,
    finish: startFinish,
    look: startLook,
    tubLabel,
    canLabel,
    doorLabel,
    trayTags,
    font,
  }: {
    events: GardenEvents;
    finish: TrayFinish;
    look: Look;
    /** The solution's name, translated, printed on the tub's front. */
    tubLabel: string;
    /** What the can holds, translated, printed on its body. */
    canLabel: string;
    /** The dark room's name, translated, printed on its door. */
    doorLabel: string;
    /** What each pair is made of, translated, printed on its front. */
    trayTags: Record<TrayFinish, string>;
    /** The page's font stack, to print them in. */
    font: string;
  },
): GardenScene | null {
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
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const thin = coarse ? 0.6 : 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  /* Light from the window, behind and to the left, so shadows fall forward
     across the bench. */
  const sun = new THREE.Vector3(-0.4, 1, -0.45).normalize();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  pmrem.dispose();
  renderer.setClearColor(0x000000, 0);

  const hemi = new THREE.HemisphereLight(0xfff7ea, 0x8a7a66, 1.6);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sunLight.position.copy(sun).multiplyScalar(10);
  scene.add(sunLight);

  const bin = new Bin();
  bin.add(envMap);
  const rand = mulberry32(20261001);
  let L: Layout = WIDE;

  /* ---- bench ---- */
  const benchTop = bin.geometries(bench(bin, rand));
  scene.add(benchTop);
  const BENCH_AT = benchTop.position.clone();
  const room = kitchen(bin, rand, doorLabel, font);
  scene.add(bin.geometries(room.group));
  const blobTex = blobShadowTexture(bin);
  const trayShadowTex = bin.add(contactShadowTexture());

  /* ---- trays ---- */
  type Pair = {
    finish: TrayFinish;
    group: THREE.Group;
    grow: THREE.Object3D;
    /** The water tray and its floor, hidden while it is the lid. */
    water: THREE.Object3D[];
    mats: TrayMaterials;
    shadow: THREE.Mesh;
    shadowMat: THREE.MeshBasicMaterial;
  };
  const pairs = {} as Record<TrayFinish, Pair>;
  for (const f of TRAY_FINISH_KEYS) {
    const mats = trayMaterials(f, true);
    bin.add({ dispose: () => disposeTrayMaterials(mats) });
    const group = bin.geometries(trayPair(0, mats)) as THREE.Group;
    group.userData.target = f;
    group.getObjectByName("water")?.add(trayPrint(bin, trayTags[f], font));
    scene.add(group);
    const shadowMat = bin.add(
      new THREE.MeshBasicMaterial({
        map: trayShadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    const shadow = new THREE.Mesh(
      bin.add(new THREE.PlaneGeometry(TRAY_W * 1.45, TRAY_D * 1.33)),
      shadowMat,
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);
    pairs[f] = {
      finish: f,
      group,
      grow: group.getObjectByName("grow")!,
      water: [
        group.getObjectByName("water")!,
        group.getObjectByName("waterFloor")!,
      ],
      mats,
      shadow,
      shadowMat,
    };
  }
  let finish: TrayFinish = startFinish;
  const activePair = () => pairs[finish];

  /* ---- grime on the active tray's floor ---- */
  const grimeCanvases = grime(mulberry32(7));
  const dirtTex = bin.add(new THREE.CanvasTexture(grimeCanvases.dirt));
  dirtTex.colorSpace = THREE.SRGBColorSpace;
  const wetTex = bin.add(new THREE.CanvasTexture(grimeCanvases.wet));
  wetTex.colorSpace = THREE.SRGBColorSpace;
  function floorPlane() {
    const g = roundedRect(FLOOR.hw, FLOOR.hd, CORNER);
    const p = g.getAttribute("position");
    const uv = new Float32Array(p.count * 2);
    for (let k = 0; k < p.count; k++) {
      uv[k * 2] = (p.getX(k) + FLOOR.hw) / (2 * FLOOR.hw);
      uv[k * 2 + 1] = 1 - (p.getZ(k) + FLOOR.hd) / (2 * FLOOR.hd);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return bin.add(g);
  }
  const dirtMat = bin.add(
    new THREE.MeshStandardMaterial({
      map: dirtTex,
      transparent: true,
      roughness: 1,
      envMapIntensity: 0,
      depthWrite: false,
    }),
  );
  const wetMat = bin.add(
    new THREE.MeshStandardMaterial({
      map: wetTex,
      transparent: true,
      roughness: 0.08,
      envMapIntensity: 1.2,
      depthWrite: false,
    }),
  );
  const dirtPlane = new THREE.Mesh(floorPlane(), dirtMat);
  dirtPlane.position.y = 0.0145;
  const wetPlane = new THREE.Mesh(floorPlane(), wetMat);
  wetPlane.position.y = 0.0155;
  const grimeGroup = new THREE.Group();
  grimeGroup.add(dirtPlane, wetPlane);
  const DIRT_NX = 16;
  const DIRT_NZ = 20;
  const dirtCells = new Float32Array(DIRT_NX * DIRT_NZ);
  /* The tray arrives clean, as it left the pick step (the owner, 1 Oct
     2026: a new tray that turns up dusty reads as a mistake). Sanitising is
     what the step shows: the spray leaves droplets, and the wipe takes them
     off. The wipe is still measured over the whole floor (`dirtCells`), so
     the cloth has to go over all of it. */
  function repaintGrime() {
    grimeCanvases.dirt
      .getContext("2d")!
      .clearRect(0, 0, grimeCanvases.W, grimeCanvases.H);
    grimeCanvases.wet
      .getContext("2d")!
      .clearRect(0, 0, grimeCanvases.W, grimeCanvases.H);
    dirtTex.needsUpdate = true;
    wetTex.needsUpdate = true;
    dirtCells.fill(1);
    dirtMat.opacity = 1;
    wetMat.opacity = 1;
  }
  const toCanvas = (x: number, z: number) => ({
    px: ((x + FLOOR.hw) / (2 * FLOOR.hw)) * grimeCanvases.W,
    py: ((z + FLOOR.hd) / (2 * FLOOR.hd)) * grimeCanvases.H,
  });
  const pxPerUnit = grimeCanvases.W / (2 * FLOOR.hw);

  /* ---- coco peat in the tray: a heightfield ---- */
  const peatTex = bin.add(mediumTexture(rand));
  peatTex.repeat.set(0.9, 0.9);
  const peatMat = bin.add(
    new THREE.MeshStandardMaterial({
      map: peatTex,
      roughness: 1,
      envMapIntensity: 0,
    }),
  );
  const hfGeo = bin.add(new THREE.PlaneGeometry(2, 2, HF_NX - 1, HF_NZ - 1));
  hfGeo.rotateX(-Math.PI / 2);
  const hfBase = Float32Array.from(
    hfGeo.getAttribute("position").array as Float32Array,
  );
  const hf = new Float32Array(HF_NX * HF_NZ);
  const peat = new THREE.Mesh(hfGeo, peatMat);
  /* What lies in the grow tray — the coco peat and the crop — on one
     group, so the tray can be lifted with it (the dark step lifts it to
     take the water tray from under it). At the origin it is world space. */
  const bed = new THREE.Group();
  scene.add(bed);
  bed.add(peat);
  let hfDirty = true;

  function hfVolume() {
    let s = 0;
    for (let k = 0; k < hf.length; k++) s += hf[k];
    return s / hf.length;
  }
  function layoutPeat() {
    const pos = hfGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const h = hf[k];
      const y = FLOOR_Y + h;
      const wall = innerWallAt(y - TRAY_RAISE, TRAY_H) + 0.004;
      const hw = FLOOR.hw + wall;
      const hd = FLOOR.hd + wall;
      const [x, z] = clampRounded(
        hfBase[k * 3] * hw,
        hfBase[k * 3 + 2] * hd,
        hw,
        hd,
        CORNER + wall,
      );
      pos.setXYZ(k, x, h > 0.0005 ? y : FLOOR_Y - 0.004, z);
    }
    pos.needsUpdate = true;
    hfGeo.computeVertexNormals();
    peat.visible = hfVolume() > 0.0005;
  }
  function deposit(x: number, z: number, amount: number) {
    const sig = 0.26;
    for (let k = 0; k < hf.length; k++) {
      const px = hfBase[k * 3] * FLOOR.hw;
      const pz = hfBase[k * 3 + 2] * FLOOR.hd;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      hf[k] = Math.min(
        LEVEL + 0.12,
        hf[k] + amount * Math.exp(-d2 / (2 * sig * sig)),
      );
    }
    hfDirty = true;
  }
  /** Peat slumps: anything steeper than its angle of repose slides down. */
  function slump() {
    const max = ((2 * FLOOR.hw) / (HF_NX - 1)) * 0.9;
    let moved = false;
    for (let j = 0; j < HF_NZ; j++) {
      for (let i = 0; i < HF_NX; i++) {
        const k = j * HF_NX + i;
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ]) {
          if (i + di >= HF_NX || j + dj >= HF_NZ) continue;
          const k2 = (j + dj) * HF_NX + i + di;
          const diff = hf[k] - hf[k2];
          if (Math.abs(diff) > max) {
            const m = (Math.abs(diff) - max) * 0.25 * Math.sign(diff);
            hf[k] -= m;
            hf[k2] += m;
            moved = true;
          }
        }
      }
    }
    if (moved) hfDirty = true;
  }

  /* ---- spring field and the sow / cut mask ---- */
  const field = createField(FIELD_NX, FIELD_NZ, FIELD_RECT);
  const fieldBytes = new Uint8Array(FIELD_NX * FIELD_NZ * 4);
  packField(field, fieldBytes);
  const fieldTex = bin.add(
    new THREE.DataTexture(fieldBytes, FIELD_NX, FIELD_NZ, THREE.RGBAFormat),
  );
  fieldTex.magFilter = THREE.LinearFilter;
  fieldTex.minFilter = THREE.LinearFilter;
  fieldTex.needsUpdate = true;
  const maskBytes = new Uint8Array(MASK_NX * MASK_NZ * 4);
  const maskTex = bin.add(
    new THREE.DataTexture(maskBytes, MASK_NX, MASK_NZ, THREE.RGBAFormat),
  );
  maskTex.magFilter = THREE.NearestFilter;
  maskTex.minFilter = THREE.NearestFilter;
  const maskInside = new Uint8Array(MASK_NX * MASK_NZ);
  let insideCount = 0;
  for (let j = 0; j < MASK_NZ; j++) {
    for (let i = 0; i < MASK_NX; i++) {
      const x = FIELD_RECT.minX + ((i + 0.5) / MASK_NX) * FIELD_RECT.width;
      const z = FIELD_RECT.minZ + ((j + 0.5) / MASK_NZ) * FIELD_RECT.depth;
      const inside = Math.abs(x) < MED.hw - 0.03 && Math.abs(z) < MED.hd - 0.03;
      maskInside[j * MASK_NX + i] = inside ? 1 : 0;
      if (inside) insideCount++;
    }
  }
  function setMask(sown: boolean, cut: boolean, fallen: boolean) {
    for (let k = 0; k < MASK_NX * MASK_NZ; k++) {
      maskBytes[k * 4] = sown ? 255 : 0;
      maskBytes[k * 4 + 1] = cut ? 255 : 0;
      maskBytes[k * 4 + 2] = fallen ? 255 : 0;
      maskBytes[k * 4 + 3] = 255;
    }
    maskTex.needsUpdate = true;
  }
  setMask(false, false, false);
  function paintMask(
    x: number,
    z: number,
    r: number,
    channel: 0 | 1,
    chance = 1,
  ) {
    let changed = 0;
    const i0 = Math.max(
      0,
      Math.floor(((x - r - FIELD_RECT.minX) / FIELD_RECT.width) * MASK_NX),
    );
    const i1 = Math.min(
      MASK_NX - 1,
      Math.ceil(((x + r - FIELD_RECT.minX) / FIELD_RECT.width) * MASK_NX),
    );
    const j0 = Math.max(
      0,
      Math.floor(((z - r - FIELD_RECT.minZ) / FIELD_RECT.depth) * MASK_NZ),
    );
    const j1 = Math.min(
      MASK_NZ - 1,
      Math.ceil(((z + r - FIELD_RECT.minZ) / FIELD_RECT.depth) * MASK_NZ),
    );
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * MASK_NX + i;
        const cx = FIELD_RECT.minX + ((i + 0.5) / MASK_NX) * FIELD_RECT.width;
        const cz = FIELD_RECT.minZ + ((j + 0.5) / MASK_NZ) * FIELD_RECT.depth;
        if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
        if (maskBytes[k * 4 + channel] === 255) continue;
        if (channel === 1 && maskBytes[k * 4] !== 255) continue;
        if (Math.random() > chance) continue;
        maskBytes[k * 4 + channel] = 255;
        if (maskInside[k]) changed++;
      }
    }
    if (changed) maskTex.needsUpdate = true;
    return changed;
  }
  function maskCount(channel: 0 | 1) {
    let n = 0;
    for (let k = 0; k < MASK_NX * MASK_NZ; k++)
      if (maskInside[k] && maskBytes[k * 4 + channel] === 255) n++;
    return n;
  }

  /* ---- the greens ---- */
  const shared = sharedUniforms(fieldTex, FIELD_RECT, maskTex, sun);
  shared.grow.value = 0;
  type Crop = {
    look: Look;
    plants: THREE.Mesh;
    seeds: THREE.Mesh;
    stems: Stems;
    heap: THREE.InstancedMesh;
    /** Sprigs in the air on their way to the bowl. */
    fly: THREE.InstancedMesh;
    /** Where each sprig of the heap comes to rest, in the heap's space. */
    rest: THREE.Matrix4[];
  };
  let crop: Crop | null = null;
  const HEAP = 420;
  const heapAt = new THREE.Vector3();
  /* What is cut is thrown into the bowl (the owner, 3 Oct 2026: "greens
     should be thrown to the bowl not automatically fill in"): each sprig
     cut flies from where the blade is, on an arc, to its place in the
     heap, and only lands there when it arrives. */
  const FLY_MAX = 96;
  const FLY_SECONDS = 0.55;
  /** Sprigs launched per second while the cut is ahead of the bowl. */
  const FLY_RATE = 170;
  let heapWant = 0;
  let heapLaunched = 0;
  let flyBudget = 0;
  const flights: { k: number; t: number; from: THREE.Vector3; spin: number }[] =
    [];
  const throwFrom = new THREE.Vector3();
  function resetHeap() {
    heapWant = 0;
    heapLaunched = 0;
    flyBudget = 0;
    flights.length = 0;
    if (crop) {
      crop.heap.count = 0;
      crop.fly.count = 0;
    }
  }
  function disposeCrop() {
    if (!crop) return;
    bed.remove(crop.plants, crop.seeds);
    scene.remove(crop.heap, crop.fly);
    for (const m of [crop.plants, crop.seeds, crop.heap]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    crop = null;
  }
  function buildCrop(l: Look) {
    if (crop?.look === l) return;
    disposeCrop();
    const v = LOOKS[l];
    const cropRand = mulberry32(20260926);
    const { stems, extra } = plantStems(
      v,
      0,
      2 * MED.hw - 0.06,
      2 * MED.hd - 0.06,
      thin,
      cropRand,
    );
    const plants = plantMesh(v, stems, extra, MEDIUM_Y, shared);
    const seeds = seedMesh(v, stems, MEDIUM_Y, shared);
    bed.add(plants, seeds);
    const heapMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      envMapIntensity: 0.15,
      side: THREE.DoubleSide,
    });
    const sprigLen = Math.min(0.3, v.height * 0.5);
    const heap = new THREE.InstancedMesh(
      sprigGeometry(v, sprigLen),
      heapMat,
      HEAP,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const tint = new THREE.Color();
    /* The height of the bowl's inside at radius r (its profile in
       `bowl`), so a sprig lies on the curve rather than through it. */
    const floorAt = (r: number) => {
      const s = Math.min(1, Math.max(0, (r - 0.16) / 0.46));
      return 0.02 + (1 - Math.sqrt(1 - s * s)) * 0.34;
    };
    /* The bowl's inside radius at height y, less a leaf's width: no part
       of a sprig may stand outside it. Above the rim, the rim's. */
    const bowlRoom = (y: number) => {
      const c = Math.max(-1, 1 - (y - 0.02) / 0.34);
      return (
        (y >= 0.36 ? 0.62 : 0.16 + Math.sqrt(1 - c * c) * 0.46) -
        0.03 -
        v.leafLength * 0.8
      );
    };
    const inBowl = (p: THREE.Vector3) =>
      p.y > floorAt(Math.hypot(p.x, p.z)) &&
      Math.hypot(p.x, p.z) < bowlRoom(p.y);
    const placed: { y: number; m: THREE.Matrix4; c: THREE.Color }[] = [];
    const at = new THREE.Vector3();
    const end = new THREE.Vector3();
    const tip = new THREE.Vector3();
    for (let k = 0; k < HEAP; k++) {
      /* A loose mound filling the bowl: sprigs lying every which way on
         the bowl's curve, each a shade lighter or darker so the heap has
         depth. A sprig that would reach through the bowl's wall is
         thrown again. */
      let y = 0;
      let size = 1;
      let fits = false;
      for (let tries = 0; tries < 40 && !fits; tries++) {
        size = 0.8 + cropRand() * 0.3;
        const layer = cropRand();
        const r = Math.sqrt(cropRand()) * 0.5;
        y = floorAt(r) + 0.04 + layer * 0.3 * (1 - (r / 0.56) ** 2);
        const a = cropRand() * Math.PI * 2;
        e.set(
          (cropRand() - 0.5) * 1.4,
          cropRand() * Math.PI * 2,
          Math.PI / 2 + (cropRand() - 0.5) * 1.1,
          "YXZ",
        );
        q.setFromEuler(e);
        /* Centred on the sprig's middle, not its cut end. */
        const half = (sprigLen * size) / 2;
        at.set(Math.cos(a) * r, y, Math.sin(a) * r);
        end.set(0, -half, 0).applyQuaternion(q).add(at);
        tip
          .set(0, half + v.leafLength * size, 0)
          .applyQuaternion(q)
          .add(at);
        fits = inBowl(end) && inBowl(tip);
      }
      /* One that never fits is left out (drawn at no size). */
      if (!fits) size = 0;
      m.compose(end, q, new THREE.Vector3(size, size, size));
      const shade = 0.72 + cropRand() * 0.36;
      tint.setRGB(shade, shade * (0.97 + cropRand() * 0.06), shade * 0.95);
      placed.push({ y, m: m.clone(), c: tint.clone() });
    }
    placed.sort((p1, p2) => p1.y - p2.y);
    placed.forEach((p, k) => {
      heap.setMatrixAt(k, p.m);
      heap.setColorAt(k, p.c);
    });
    heap.count = 0;
    heap.position.copy(heapAt);
    scene.add(heap);
    const fly = new THREE.InstancedMesh(heap.geometry, heapMat, FLY_MAX);
    fly.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fly.frustumCulled = false;
    fly.count = 0;
    scene.add(fly);
    crop = {
      look: l,
      plants,
      seeds,
      stems,
      heap,
      fly,
      rest: placed.map((p) => p.m),
    };
    resetHeap();
  }
  bin.add({ dispose: disposeCrop });
  let look: Look = startLook;
  buildCrop(look);

  /* ---- the lid: the green water tray, upturned over the sown one (the
     owner, 2 Oct 2026 — the blackout cover is the pair's other tray, not a
     second white one) ---- */
  const lid = new THREE.Group();
  lid.userData.target = "lid";
  const lidInner = new THREE.Group();
  lidInner.position.y = -TRAY_H / 2;
  const lidTray = new THREE.Mesh(
    bin.add(
      trayGeometry(
        TRAY_W + 2 * WATER_MARGIN,
        TRAY_D + 2 * WATER_MARGIN,
        TRAY_H,
      ),
    ),
    pairs[finish].mats.water,
  );
  /* Both faces: upturned, its floor is the solid top of the cover, seen
     from above, with nothing of the tray under it showing through. */
  const lidFloorMat = bin.add(
    new THREE.MeshStandardMaterial({
      roughness: 0.45,
      envMapIntensity: 0.25,
      side: THREE.DoubleSide,
    }),
  );
  const lidFloor = new THREE.Mesh(
    bin.add(
      roundedRect(FLOOR.hw + WATER_MARGIN, FLOOR.hd + WATER_MARGIN, CORNER),
    ),
    lidFloorMat,
  );
  lidFloor.position.y = 0.013;
  lidInner.add(lidTray, lidFloor);
  lid.add(lidInner);
  scene.add(lid);
  const lidShadow = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(TRAY_W * 1.4, TRAY_D * 1.3)),
    bin.add(
      new THREE.MeshBasicMaterial({
        map: trayShadowTex,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  lidShadow.rotation.x = -Math.PI / 2;
  lidShadow.position.y = 0.002;
  scene.add(lidShadow);

  /* ---- props, each on a rig ---- */
  const clothInner = bin.geometries(cloth(bin, rand));
  /* Half as big again as modelled: a proper hand towel beside the trays. */
  clothInner.scale.setScalar(1.5);
  const clothRig = rig(clothInner);
  clothRig.userData.target = "cloth";
  const tub = bin.geometries(basin(bin));
  tub.scale.setScalar(BOWL);
  tub.userData.target = "block";
  const waterMat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#7d969c",
      transparent: true,
      opacity: 0.6,
      roughness: 0.05,
      envMapIntensity: 1,
    }),
  );
  const water = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(1, 40)),
    waterMat,
  );
  water.rotation.x = -Math.PI / 2;
  tub.add(water);
  const blockTex = bin.add(mediumTexture(mulberry32(3), "#9a9a9a"));
  blockTex.repeat.set(0.7, 0.7);
  const block = peatBlock(bin, blockTex);
  block.mesh.position.y = 0.035;
  tub.add(block.mesh);
  const canInner = bin.geometries(wateringCan(bin, canLabel, font));
  const can = rig(canInner);
  can.userData.target = "can";
  const packets = {} as Record<Look, THREE.Group>;
  for (const l of LOOK_KEYS) {
    const inner = bin.geometries(
      seedPacket(bin, mulberry32(11), LOOKS[l].seed),
    );
    packets[l] = rig(inner);
    packets[l].userData.target = `packet-${l}`;
    scene.add(packets[l]);
  }
  const rack = shelfRack(bin, OUR_SHELF);
  bin.geometries(rack.group);
  rack.lightSwitch.userData.target = "lamp";
  /** The light step works at the rack's shelf, with the tray where it
   *  always is, at the origin: so the kitchen and its floor move instead,
   *  by the rack's place and its shelf's height. Elsewhere the rack simply
   *  stands in the kitchen. */
  function shiftToRack(on: boolean) {
    if (on) {
      room.group.position.set(-RACK_AT.x, -RACK_DROP, -RACK_AT.z);
      benchTop.position.set(
        BENCH_AT.x - RACK_AT.x,
        BENCH_AT.y - RACK_DROP,
        BENCH_AT.z - RACK_AT.z,
      );
      rack.group.position.set(0, -RACK_DROP, 0);
    } else {
      room.group.position.set(0, 0, 0);
      benchTop.position.copy(BENCH_AT);
      rack.group.position.copy(RACK_AT);
    }
  }

  /* The other shelves already growing, in black trays like the product
     photo's: two full trays to a shelf, grown with the same stems and seed
     leaves as the tray being played with (the owner, 2 Oct 2026: the
     painted boxes did not read as greens). They have a still field and a
     full mask of their own, so brushing the played tray does not move
     them, but they sway on the same clock. */
  {
    const still = bin.add(
      new THREE.DataTexture(
        new Uint8Array([128, 128, 0, 255]),
        1,
        1,
        THREE.RGBAFormat,
      ),
    );
    still.needsUpdate = true;
    const decorShared = {
      ...sharedUniforms(still, FIELD_RECT, bin.add(fullMask()), sun),
      time: shared.time,
    };
    const peatTop = bin.add(
      new THREE.BoxGeometry(2 * MED.hw, 0.02, 2 * MED.hd),
    );
    const decorRand = mulberry32(20261002);
    const decorLooks: Look[] = ["radish", "amaranth", "sunflower", "radish"];
    const decorMats = pairs["tray-pair"].mats;
    let n = 0;
    SHELF_RACK.shelves.forEach((y, i) => {
      if (i === OUR_SHELF) return;
      for (const x of [-1.17, 1.17]) {
        const t = bin.geometries(trayPair(0, decorMats)) as THREE.Group;
        const v = LOOKS[decorLooks[n++ % decorLooks.length]];
        const { stems, extra } = plantStems(
          v,
          0,
          2 * MED.hw - 0.06,
          2 * MED.hd - 0.06,
          thin * 0.6,
          decorRand,
        );
        /* Kept short, so the leaves stand clear under the shelf above
           rather than behind its plate (the owner, 2 Oct 2026). */
        for (let k = 0; k < stems.count; k++) stems.data[k * 4 + 2] *= 0.5;
        const plants = plantMesh(v, stems, extra, MEDIUM_Y, decorShared);
        bin.add(plants.geometry);
        bin.add(plants.material as THREE.Material);
        const peatBed = new THREE.Mesh(peatTop, peatMat);
        peatBed.position.y = MEDIUM_Y - 0.01;
        t.add(peatBed, plants);
        t.position.set(x, y, 0);
        rack.group.add(t);
      }
    });
  }
  const cutterInner = bin.geometries(cutter(bin));
  cutterInner.scale.setScalar(1.7);
  const knife = rig(cutterInner);
  knife.userData.target = "cutter";
  const bowlProp = bin.geometries(bowl(bin));
  const dipRig = bin.geometries(dipTub(bin, tubLabel, font));

  dipRig.userData.target = "basin";
  const dipWater = dipRig.getObjectByName("water") as THREE.Mesh;
  let stir = 0;
  scene.add(clothRig, tub, can, rack.group, knife, bowlProp, dipRig);

  const shadows = new Map<THREE.Object3D, THREE.Mesh>();
  for (const [obj, w, d] of [
    [dipRig, 3.3, 3.8],
    [clothRig, 1.4, 1.1],
    [tub, 2.0, 2.0],
    [can, 0.95, 0.8],
    [packets.amaranth, 0.7, 0.4],
    [packets.radish, 0.7, 0.4],
    [packets.sunflower, 0.7, 0.4],
    [bowlProp, 1.6, 1.6],
    [knife, 0.9, 0.6],
  ] as const) {
    const s = blobShadow(bin, blobTex, w, d);
    scene.add(s);
    shadows.set(obj, s);
  }

  /* ---- highlight rings ---- */
  const haloTex = bin.add(
    (() => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(128, 128, 70, 128, 128, 126);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.55, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
  );
  const halos = Array.from({ length: LOOK_KEYS.length }, () => {
    const mat = bin.add(
      new THREE.MeshBasicMaterial({
        map: haloTex,
        color: "#4f9a3c",
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    const m = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(2, 2)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  });

  const mist = new Particles(bin, 900, "#ffffff", {
    gravity: 0.6,
    drag: 3.2,
    soft: 0.9,
    opacity: 0.55,
  });
  const drops = new Particles(bin, 700, "#cfe3ea", {
    gravity: 9,
    drag: 0.4,
    soft: 0.5,
    opacity: 0.85,
  });
  const crumbs = new Particles(bin, 700, "#4b3424", {
    gravity: 7,
    drag: 0.6,
    soft: 0.25,
    opacity: 1,
  });
  const seedsFall = new Particles(bin, 500, LOOKS[look].seed, {
    gravity: 6,
    drag: 0.5,
    soft: 0.3,
    opacity: 1,
  });
  /* Fizz off the tray while it soaks: rising, so a negative gravity. */
  const bubbles = new Particles(bin, 400, "#f4fbfd", {
    gravity: -0.8,
    drag: 1.5,
    soft: 0.6,
    opacity: 0.8,
  });
  /* Watering from below: a stream from the spout that lands on the
     green tray's floor and lies there, rather than falling through it. */
  const pourDrops = new Particles(bin, 500, "#cfe3ea", {
    gravity: 9,
    drag: 0.4,
    soft: 0.5,
    floor: 0.04,
    opacity: 0.85,
  });
  scene.add(
    mist.points,
    drops.points,
    crumbs.points,
    seedsFall.points,
    bubbles.points,
    pourDrops.points,
  );
  const particleSets = [mist, drops, crumbs, seedsFall, bubbles, pourDrops];

  /* ------------------------------------------------------------ state */
  let step: BenchStep = "pick";
  let phase: Phase = "choose";
  let progress = 0;
  let reported = { step: "", phase: "", progress: -1 };
  const tweens: Tween[] = [];
  let clock = 0;
  let lightLevel = 1;
  let lightTarget = 1;
  type Held = null | "tray" | "cloth" | "can" | "bowl" | "packet" | "cutter";
  let held: Held = null;
  const val = {
    swell: 0,
    crumble: 0,
    water: 0,
    left: 1,
    growTarget: 0,
    greenTarget: 0,
    waterings: 0,
    lidLift: 0,
    /** Dark days gone by, 0 to `DARK_DAYS`. */
    days: 0,
  };
  const pickAnim = {
    active: false,
    t: 0,
    y: 0,
    vy: 0,
    wobble: 0,
    landed: false,
  };
  const canAnim = { pouring: false, t: 10 };
  let holding = false;
  let hovered: Target | null = null;

  function report() {
    const p = Math.round(progress * 100) / 100;
    if (
      reported.step === step &&
      reported.phase === phase &&
      Math.abs(reported.progress - p) < 0.01
    )
      return;
    reported = { step, phase, progress: p };
    events.onProgress(step, p, phase);
  }
  function setPhase(p: Phase) {
    phase = p;
    report();
  }
  function tween(dur: number, run: (k: number) => void, done?: () => void) {
    tweens.push({ t: 0, dur, run, done });
    run(0);
  }
  /** Bring a prop on from above, with a little bounce. */
  function appear(obj: THREE.Object3D, at: THREE.Vector3, delay = 0) {
    obj.visible = true;
    obj.position.set(at.x, at.y + 1.6, at.z);
    obj.rotation.set(0, obj.rotation.y, 0);
    const from = obj.position.y;
    tween(0.7 + delay, (k) => {
      const t = clamp01((k * (0.7 + delay) - delay) / 0.7);
      const b =
        t < 1 ? 1 - Math.abs(Math.cos(t * Math.PI * 1.5)) * (1 - t) ** 2 : 1;
      obj.position.y = THREE.MathUtils.lerp(
        from,
        at.y,
        t < 0.55 ? (t / 0.55) ** 2 : b,
      );
    });
  }
  /** Send a tool from the hand back to where it lives. */
  function putBack(obj: THREE.Object3D, home: THREE.Vector3, yaw: number) {
    const from = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    tween(0.55, (k) => {
      const t = ease(k);
      obj.position.lerpVectors(from, home, t);
      obj.position.y += Math.sin(k * Math.PI) * 0.4;
      obj.quaternion.slerpQuaternions(q0, q1, t);
    });
  }

  /* ---------------------------------------------------- step baselines */
  const order: BenchStep[] = [
    "pick",
    "clean",
    "soak",
    "fill",
    "sow",
    "dark",
    "light",
    "harvest",
  ];

  function placeTrays() {
    for (const f of TRAY_FINISH_KEYS) {
      const p = pairs[f];
      const mine = f === finish;
      p.group.visible = mine;
      p.shadow.visible = mine;
      p.group.position.set(0, 0, 0);
      p.group.rotation.set(0, 0, 0);
      p.grow.position.y = TRAY_RAISE;
      for (const w of p.water) w.visible = true;
      p.shadow.position.set(0.12, 0.002, 0.1);
      p.shadowMat.opacity = 1;
    }
    bed.position.set(0, 0, 0);
    room.daylight(null);
    shiftToRack(false);
    activePair().grow.add(grimeGroup);
    lidTray.material = activePair().mats.water;
    lidFloorMat.color.copy(
      (activePair().mats.water as THREE.MeshStandardMaterial).color,
    );
  }

  function hideAll() {
    for (const o of [
      dipRig,
      clothRig,
      tub,
      can,
      knife,
      bowlProp,
      lid,
      lidShadow,
      ...Object.values(packets),
    ]) {
      o.visible = false;
    }
    grimeGroup.visible = false;
    for (const s of particleSets) s.clear();
    tweens.length = 0;
    holding = false;
    held = null;
    canAnim.pouring = false;
    canAnim.t = 10;
    auto = null;
    ptr.auto = null;
    ptr.down = false;
  }

  function setStep(next: BenchStep) {
    step = next;
    /* The dark step's trip leaves the kitchen dimmed to black and the
       camera on the dark room's door; every step starts from neither. */
    trip = false;
    zoom = 0;
    fade = 0;
    darkIntro = 0;
    darkOpen = 0;
    leave = 0;
    morning = 0;
    rackAim = 0;
    dragging = false;
    flying = false;
    carryScale = 1;
    activePair().group.scale.setScalar(1);
    lid.scale.setScalar(1);
    bed.scale.setScalar(1);
    hideAll();
    placeTrays();
    progress = 0;
    lightTarget = 1;
    lightLevel = 1;
    rack.beamMat.opacity = 0;
    rack.diffuserMat.color.set("#c9ccc6");
    rack.rocker.rotation.x = -0.22;
    rack.rockerMat.emissiveIntensity = 0;
    const before = (s: BenchStep) => order.indexOf(step) > order.indexOf(s);
    hf.fill(before("fill") ? LEVEL : 0);
    hfDirty = true;
    const sown = before("sow");
    setMask(sown, false, sown);
    shared.grow.value = before("dark") ? (before("light") ? 1 : DARK_GROW) : 0;
    shared.green.value = before("light") ? 1 : 0;
    resetHeap();
    const flat = (o: THREE.Object3D, xz: XZ, yaw = 0, y = 0) => {
      o.position.copy(v3(xz, y));
      o.rotation.set(0, yaw, 0);
    };

    switch (step) {
      case "pick":
        for (const f of TRAY_FINISH_KEYS) {
          pairs[f].group.visible = true;
          pairs[f].shadow.visible = true;
          pairs[f].group.position.copy(v3(L.pick[f], 0.32));
          pairs[f].shadow.position.set(
            L.pick[f][0] + 0.12,
            0.002,
            L.pick[f][1] + 0.1,
          );
        }
        pickAnim.active = false;
        phase = "choose";
        break;
      case "clean":
        repaintGrime();
        grimeGroup.visible = true;
        appear(dipRig, v3(L.dip));
        appear(clothRig, v3(L.cloth), 0.16);
        clothRig.rotation.set(0, 0.3, 0);
        Object.assign(dip, { steep: 0, busy: false });
        phase = "takeTray";
        break;
      case "soak":
        Object.assign(val, { swell: 0, crumble: 0, water: 0, left: 1 });
        block.mesh.visible = true;
        flat(tub, L.basin);
        appear(tub, v3(L.basin));
        appear(can, v3(L.can), 0.15);
        can.scale.setScalar(L.canScale);
        can.rotation.set(0, CAN_YAW, 0); // side on, spout toward the bowl
        phase = "takeCan";
        break;
      case "fill":
        Object.assign(val, { swell: 1, crumble: 1, water: 0, left: 1 });
        tub.rotation.set(0, 0, 0);
        bowlAnim.t = 0;
        appear(tub, v3(L.basin));
        phase = "takeScoop";
        break;
      case "sow":
        LOOK_KEYS.forEach((l, i) => {
          flat(packets[l], L.packets[l], 0.25 - i * 0.15);
          appear(packets[l], v3(L.packets[l]), i * 0.08);
        });
        phase = "takePacket";
        break;
      case "dark":
        /* The lid starts as the water tray, where it is. */
        for (const w of activePair().water) w.visible = false;
        lid.visible = true;
        lid.position.set(0, LID_OFF, 0);
        lid.rotation.set(0, 0, 0);
        val.lidLift = 0;
        val.days = 0;
        room.door(0);
        carry.set(0, 0, 0);
        trip = false;

        phase = "cover";
        takeWaterTray();
        break;
      case "light":
        for (const w of activePair().water) w.visible = false;
        bedAt(-TRAY_RAISE);
        lid.visible = true;
        val.lidLift = LID_LIFT;
        lid.rotation.set(Math.PI, 0, 0);
        /* At the rack: its second shelf where the bench was. */
        shiftToRack(true);
        can.visible = true;
        can.position.copy(v3(L.canLight));
        can.scale.setScalar(1);
        can.rotation.set(0, 2.9, 0);
        val.waterings = 0;
        lightTarget = lightLevel = 0.62;
        placeOnRack();
        phase = "drop";
        break;
      case "harvest":
        flat(knife, L.cutter, -0.5, 0.02);
        appear(knife, v3(L.cutter, 0.02));
        flat(bowlProp, L.bowl);
        appear(bowlProp, v3(L.bowl));
        heapAt.copy(v3(L.bowl));
        if (crop) crop.heap.position.copy(heapAt);
        phase = "takeCutter";
        break;
    }
    val.growTarget = shared.grow.value;
    val.greenTarget = shared.green.value;
    report();
  }

  /* --------------------------------------------------------- the hand */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmp = new THREE.Vector3();
  const ptr = {
    over: false,
    down: false,
    mouse: true,
    auto: null as THREE.Vector3 | null,
    last: new THREE.Vector3(),
    lastY: Number.NaN,
    speed: 0,
    has: false,
  };
  let auto: { t: number } | null = null;

  function hit(y: number, out = tmp): THREE.Vector3 | null {
    if (ptr.auto) return out.set(ptr.auto.x, y, ptr.auto.z);
    if (!ptr.over) return null;
    plane.constant = -y;
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, out);
  }
  const onTray = (p: THREE.Vector3 | null, margin = 0) =>
    !!p && Math.abs(p.x) < MED.hw + margin && Math.abs(p.z) < MED.hd + margin;

  /** The object standing in for each target, for clicks, rings and labels. */
  function targetObject(t: Target): THREE.Object3D | null {
    if (t === "tray") return activePair().group;
    if (t === "tray-pair" || t === "tray-pair-food-grade")
      return pairs[t].group;
    if (t.startsWith("packet-")) return packets[t.slice(7) as Look];
    switch (t) {
      case "basin":
        return dipRig;
      case "cloth":
        return clothRig;
      case "can":
        return can;
      case "block":
        return tub;
      case "lid":
        return lid;
      case "lamp":
        return rack.lightSwitch;
      case "cutter":
        return knife;
    }
    return null;
  }
  /** Which current target, if any, is under the pointer. */
  function pickTarget(): Target | null {
    if (!ptr.over) return null;
    const ts = targetsFor(phase).filter((t) => t !== "tray" || held === null);
    const objs = ts
      .map(targetObject)
      .filter((o): o is THREE.Object3D => !!o && o.visible);
    if (!objs.length) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(objs, true);
    let o: THREE.Object3D | null = hits[0]?.object ?? null;
    while (o && !o.userData.target) o = o.parent;
    const t = (o?.userData.target ?? null) as Target | null;
    /* The active tray counts as "tray" only when the phase is a gesture on
       it; as itself it is never a target after the pick. */
    if (
      t &&
      (t === "tray-pair" || t === "tray-pair-food-grade") &&
      phase !== "choose"
    )
      return ts.includes("tray") ? "tray" : null;
    return t && ts.includes(t) ? t : null;
  }

  function onMove(e: PointerEvent) {
    wake();
    const box = canvas.getBoundingClientRect();
    if (dragging) {
      const at = dragPoint(e.clientX - box.left, e.clientY - box.top, tmp);
      if (at) dragTo.copy(at).sub(grabOff).setY(0.5);
      return;
    }
    ndc.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    );
    ptr.over = true;
    ptr.mouse = e.pointerType === "mouse";
  }
  function onDown(e: PointerEvent) {
    onMove(e);
    if (auto) return;
    if (phase === "toLight" && splitOn()) {
      /* Taken hold of in the dark room, to be dragged into the light. */
      const box = canvas.getBoundingClientRect();
      const at = dragPoint(e.clientX - box.left, e.clientY - box.top, tmp);
      if (
        at &&
        Math.abs(at.x - carry.x) < TRAY_W / 2 + 0.5 &&
        Math.abs(at.z - carry.z) < TRAY_D / 2 + 0.5
      ) {
        dragging = true;
        dragView.w = darkRect.w;
        dragView.h = darkRect.h;
        trayOnLayer();
        grabOff.copy(at).sub(carry).setY(0);
        dragTo.copy(carry).setY(0.5);
        canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    ptr.down = true;
    const t = pickTarget();
    if (t && t !== "tray") {
      select(t);
      return;
    }
    gesture();
  }
  function onUp(e: PointerEvent) {
    if (dragging) {
      dragging = false;
      const box = canvas.getBoundingClientRect();
      if (overLight(e.clientX - box.left, e.clientY - box.top)) sendToLight();
      else {
        /* Let go in the dark: it settles back where it was. */
        const from = carry.clone();
        tween(0.4, (k) => {
          carry.lerpVectors(from, new THREE.Vector3(), ease(k));
          placeCarried();
        });
      }
    }
    ptr.down = false;
    holding = false;
    if (e.pointerType !== "mouse") ptr.over = false;
  }
  function onLeave() {
    ptr.over = false;
    ptr.down = false;
    holding = false;
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointercancel", onLeave);

  /** A press on the bench that is not on a target: the held tool's job. */
  function gesture() {
    switch (phase) {
      case "takeTray":
        if (onTray(hit(RIM_Y), 0.2)) takeTray();
        return;
      case "dip":
        if (overDip(hit(DIP.h))) dipIn();
        return;
      case "lift":
        if (overDip(hit(DIP.h))) liftOut();
        return;
      case "pour":
        holding = true;
        return;
      default:
        return;
    }
  }

  /** What clicking a target does. */
  function select(t: Target) {
    wake();
    if (!targetsFor(phase).includes(t)) return;
    if (t === "tray") {
      if (phase === "takeTray") return takeTray();
      if (phase === "lift") return liftOut();
      if (phase === "toLight") return sendToLight();
      /* The label on the tray is the keyboard's way to do the gesture. */
      autoplay();
      return;
    }
    if (t === "basin") return dipIn();
    if (t === "tray-pair" || t === "tray-pair-food-grade") {
      pick(t);
      return;
    }
    if (t.startsWith("packet-")) {
      const l = t.slice(7) as Look;
      if (l !== look) {
        look = l;
        buildCrop(l);
        (
          seedsFall.points.material as THREE.ShaderMaterial
        ).uniforms.uColor.value.set(LOOKS[l].seed);
        events.onLook(l);
      }
      held = "packet";
      for (const k of LOOK_KEYS) if (k !== l) packets[k].visible = false;
      setPhase("sow");
      return;
    }
    switch (t) {
      case "cloth":
        held = "cloth";
        setPhase("wipe");
        return;
      case "can":
        if (step === "soak") {
          held = "can";
          canAnim.t = 0;
          setPhase("pour");
        } else waterTray();
        return;
      case "block":
        if (phase === "takeScoop") {
          held = "bowl";
          bowlAnim.t = 0;
          setPhase("fill");
        } else autoplay();
        return;
      case "lid":
        if (phase === "cover") coverTray();
        else liftLid();
        return;
      case "lamp":
        lightOn();
        return;
      case "cutter":
        held = "cutter";
        setPhase("cut");
        return;
    }
  }

  function pick(f: TrayFinish) {
    if (step !== "pick" || pickAnim.active) return;
    finish = f;
    pickAnim.active = true;
    pickAnim.t = 0;
    pickAnim.y = pairs[f].group.position.y;
    pickAnim.vy = 0;
    pickAnim.landed = false;
    pickAnim.wobble = 0;
    progress = 0.5;
    setPhase("drop");
    events.onPick(f);
  }

  /* --------------------------------------------------------- actions */

  /* ---- the clean step: into the solution, hold, out, wipe ---- */
  const dip = { steep: 0, busy: false };
  const overDip = (p: THREE.Vector3 | null) =>
    !!p &&
    Math.abs(p.x - L.dip[0]) < DIP.w / 2 + 0.2 &&
    Math.abs(p.z - L.dip[1]) < DIP.d / 2 + 0.2;
  function takeTray() {
    if (phase !== "takeTray" || dip.busy) return;
    held = "tray";
    setPhase("dip");
  }
  /** Lower the tray into the tub, with a splash. */
  function dipIn() {
    if (phase !== "dip" || dip.busy) return;
    const g = activePair().group;
    const from = g.position.clone();
    const to = v3(L.dip, 0.03);
    held = null;
    dip.busy = true;
    tween(
      0.6,
      (k) => {
        const e = ease(k);
        g.position.lerpVectors(from, to, e);
        g.position.y = THREE.MathUtils.lerp(from.y, to.y, e * e);
        g.rotation.set(0, 0, 0);
      },
      () => {
        dip.busy = false;
        for (let n = 0; n < 90; n++) {
          const a = Math.random() * Math.PI * 2;
          drops.emit(
            v3(L.dip, DIP.water).add(
              new THREE.Vector3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.35),
            ),
            new THREE.Vector3(
              Math.cos(a) * 0.8,
              1.8 + Math.random() * 1.4,
              Math.sin(a) * 0.8,
            ),
            0.6 + Math.random() * 0.3,
            0.03 + Math.random() * 0.03,
          );
        }
        stir = 1;
        setPhase("steep");
      },
    );
  }
  /** Lift the tray out, let it drip over the tub, set it back down wet. */
  function liftOut() {
    if (phase !== "lift" || dip.busy) return;
    const g = activePair().group;
    const inTub = g.position.clone();
    const over = v3(L.dip, 1.0);
    const home = new THREE.Vector3(0, 0, 0);
    dip.busy = true;
    tween(
      0.5,
      (k) => g.position.lerpVectors(inTub, over, ease(k)),
      () => {
        tween(
          0.9,
          (k) => {
            g.rotation.x = Math.sin(k * Math.PI) * 0.12;
            for (let n = 0; n < 5; n++)
              drops.emit(
                g.position
                  .clone()
                  .add(
                    new THREE.Vector3(
                      (Math.random() - 0.5) * 1.9,
                      -0.02,
                      (Math.random() - 0.5) * 2.5,
                    ),
                  ),
                new THREE.Vector3(0, -0.5, 0),
                0.5,
                0.025 + Math.random() * 0.02,
              );
          },
          () => {
            tween(
              0.6,
              (k) => {
                const e = ease(k);
                g.position.lerpVectors(over, home, e);
                g.position.y += Math.sin(k * Math.PI) * 0.3;
                g.rotation.x = 0;
              },
              () => {
                dip.busy = false;
                wetAll();
                setPhase("takeCloth");
              },
            );
          },
        );
      },
    );
  }
  /** Beads of solution left all over the floor, for the cloth to take. */
  function wetAll() {
    const g = grimeCanvases.wet.getContext("2d")!;
    for (let k = 0; k < 900; k++) {
      const s = 1 + Math.random() * 3.4;
      g.fillStyle = `rgba(30,40,45,${0.22 + Math.random() * 0.25})`;
      g.beginPath();
      g.ellipse(
        Math.random() * grimeCanvases.W,
        Math.random() * grimeCanvases.H,
        s,
        s * 0.85,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    wetTex.needsUpdate = true;
  }
  function wipe(x: number, z: number, strength: number) {
    const { px, py } = toCanvas(x, z);
    const rx = 0.55 * pxPerUnit;
    const rz = 0.42 * pxPerUnit;
    for (const c of [grimeCanvases.dirt, grimeCanvases.wet]) {
      const g = c.getContext("2d")!;
      g.globalCompositeOperation = "destination-out";
      const grad = g.createRadialGradient(px, py, 0, px, py, rx);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(px, py, rx, rz, 0, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";
    }
    dirtTex.needsUpdate = true;
    wetTex.needsUpdate = true;
    for (let j = 0; j < DIRT_NZ; j++) {
      for (let i = 0; i < DIRT_NX; i++) {
        const cx = -FLOOR.hw + ((i + 0.5) / DIRT_NX) * 2 * FLOOR.hw;
        const cz = -FLOOR.hd + ((j + 0.5) / DIRT_NZ) * 2 * FLOOR.hd;
        const d = Math.hypot((cx - x) / 0.55, (cz - z) / 0.42);
        if (d < 1) dirtCells[j * DIRT_NX + i] *= 1 - strength * (1 - d) * 1.4;
      }
    }
  }
  function scoop(x: number, z: number) {
    if (hfVolume() > LEVEL * 1.06) return;
    deposit(x, z, 0.11);
    /* Measured against the fill that ends the pour, so the bowl is
       empty the moment the tray is full. */
    val.left = clamp01(1 - hfVolume() / (LEVEL * 0.97));
    for (let k = 0; k < 14; k++) {
      crumbs.emit(
        new THREE.Vector3(
          x + (Math.random() - 0.5) * 0.25,
          MEDIUM_Y + 0.4 + Math.random() * 0.1,
          z + (Math.random() - 0.5) * 0.25,
        ),
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          -1 - Math.random(),
          (Math.random() - 0.5) * 0.6,
        ),
        0.5 + Math.random() * 0.3,
        0.03 + Math.random() * 0.04,
      );
    }
  }
  /** The grow tray and what is in it, `y` above where it sits in its water
   *  tray: `-TRAY_RAISE` stands it on the bench. */
  function bedAt(y: number) {
    activePair().grow.position.y = TRAY_RAISE + y;
    bed.position.y = y;
  }
  function shadowUnder(o: THREE.Object3D) {
    lidShadow.position.set(o.position.x + 0.12, 0.002, o.position.z + 0.1);
  }
  /** Nothing to do but watch (the owner, 2 Oct 2026): the white tray is
   *  lifted, its green water tray slid out from under it and set beside,
   *  and the white tray put down on the bench; then the green one is
   *  upturned over it as the cover. */
  function takeWaterTray() {
    const LIFT = 0.75;
    const under = new THREE.Vector3(0, LID_OFF, 0);
    const side = v3(L.lid, LID_OFF);
    tween(
      2.4,
      (k) => {
        const up = smooth(k, 0.12, 0.32);
        const down = smooth(k, 0.7, 0.92);
        bedAt(
          down > 0 ? THREE.MathUtils.lerp(LIFT, -TRAY_RAISE, down) : LIFT * up,
        );
        const out = ease(clamp01((k - 0.32) / 0.35));
        lid.position.lerpVectors(under, side, out);
        lidShadow.visible = out > 0;
        shadowUnder(lid);
      },
      () => {
        phase = "cover";
        coverTray();
      },
    );
  }
  function coverTray() {
    if (phase !== "cover") return;
    phase = "drop";
    const from = lid.position.clone();
    /* Turned over high above the white tray, and only then lowered
       straight down onto its rim — flipped on the way down, its corners
       swept through the tray. */
    /* High enough that its far edge, swinging down as it turns, stays
       clear of the white tray's rim. */
    const HIGH = LID_ON + 1.6;
    tween(
      1.6,
      (k) => {
        const up = smooth(k, 0, 0.18);
        const turn = ease(clamp01((k - 0.12) / 0.4));
        const over = ease(clamp01((k - 0.12) / 0.5));
        const down = smooth(k, 0.66, 1);
        lid.position.set(
          THREE.MathUtils.lerp(from.x, 0, over),
          down > 0
            ? THREE.MathUtils.lerp(HIGH, LID_ON, down)
            : THREE.MathUtils.lerp(from.y, HIGH, up),
          THREE.MathUtils.lerp(from.z, 0, over),
        );
        lid.rotation.set(Math.PI * turn, 0, 0);
        lidShadow.visible = k < 0.5;
        shadowUnder(lid);
      },
      () => {
        lid.position.set(0, LID_ON, 0);
        lid.rotation.set(Math.PI, 0, 0);
        toDarkRoom();
      },
    );
    report();
  }
  /* ---- into the dark room ---- */
  /** Where the covered tray has been carried from its place on the bench. */
  const carry = new THREE.Vector3();
  /** How far the camera has pushed in on the closed door, 0 to 1. */
  let zoom = 0;
  /** The kitchen going dark as the camera reaches the shut door, 0 to 1, so
   *  the dark room opens out of darkness rather than on a cut. */
  let fade = 0;
  /** Seconds the dark room has been shown on its own, and how far the
   *  kitchen has since slid in beside it (`split`). */
  let darkIntro = 0;
  let darkOpen = 0;
  /** The tray carried out into the light: the kitchen growing over the
   *  dark room, 0 to 1, and the hour it reaches meanwhile. */
  let leave = 0;
  let morning = 0;
  /** The kitchen's view turning from its window to the lit rack, the
   *  tray's place in the light, once the days are done; 0 to 1. */
  let rackAim = 0;
  /** The tray being dragged across, and where on it it was taken hold of. */
  let dragging = false;
  /** The drop: the tray flying from where it was let go to its shelf. */
  let flying = false;
  let flight = 0;
  const released = new THREE.Vector3();
  /** The light step follows the drop, with the tray already on its shelf. */
  let fromDark = false;
  /** Drawn over both halves while it crosses, at the size it had in the
   *  dark room's view: the dark room's view as it was when the tray was
   *  taken up. */
  const dragView = { w: 1, h: 1 };
  const grabOff = new THREE.Vector3();
  const dragTo = new THREE.Vector3();
  /** Where the tray is carried, and how large it is drawn (only the drop
   *  into the light shrinks it, to the size of its place on the rack). */
  let carryScale = 1;
  function placeCarried() {
    const pair = activePair();
    const k = carryScale;
    pair.group.position.copy(carry);
    pair.group.scale.setScalar(k);
    pair.shadow.position.set(carry.x + 0.12, 0.002, carry.z + 0.1);
    pair.shadow.visible = carry.y < 0.05 && k === 1;
    lid.position.set(carry.x, (LID_ON + val.lidLift) * k + carry.y, carry.z);
    lid.scale.setScalar(k);
    bed.position.set(carry.x, -TRAY_RAISE * k + carry.y, carry.z);
    bed.scale.setScalar(k);
  }
  /** On its way to the dark room: the camera follows it there. */
  let trip = false;
  /** Covered, it goes to the dark room (the owner, 2 Oct 2026) — a real
   *  room through a door on the left of the kitchen, not a box, because a
   *  tray in the dark still needs air moving round it. The camera turns to
   *  the door, which opens; the tray is carried through and set down
   *  inside; the door shuts and the camera pushes in on it. Then the
   *  screen splits — the tray close up in the dark on one side, the kitchen
   *  turning through day and night on the other (`render`) — and the page
   *  fades in from black over the cut. */
  function toDarkRoom() {
    trip = true;
    /* One movement, no stops (the owner, 2 Oct 2026): lifted as the door
       swings open, carried on one curve to the doorway and through it,
       lowered to the floor as it arrives, the door already shutting behind
       it and the camera closing in on the door as it does. The door opens
       out into the kitchen and is fully open long before the tray reaches
       it, so the two never meet. Times are seconds into the trip. */
    const T = 4.6;
    const HAND = 0.9;
    const front = new THREE.Vector3(DARK_SPOT.x, 0, WALL_Z + TRAY_D / 2 + 0.9);
    /* Swung round in front of the door first, so it goes through square
       to the doorway rather than cutting the corner into the frame. */
    const swing = front.clone().setZ(front.z + 1.2);
    const threshold = front.clone().setZ(WALL_Z);
    const path = new THREE.CatmullRomCurve3(
      [carry.clone(), swing, front, threshold, DARK_SPOT.clone()],
      false,
      "centripetal",
    );
    const at = new THREE.Vector3();
    tween(
      T,
      (k) => {
        const t = k * T;
        room.door(smooth(t, 0.2, 1.3) * (1 - smooth(t, 3.1, 4.1)));
        path.getPoint(smooth(t, 0.1, 3.4), at);
        at.y = HAND * smooth(t, 0, 0.6) * (1 - smooth(t, 2.9, 3.5));
        carry.copy(at);
        placeCarried();
        const z = smooth(t, 2.9, T);
        zoom = z;
        fade = smooth(z, 0.4, 1);
      },
      () => {
        /* In the dark room the tray is shown on its own, at the middle of
           the view. */
        trip = false;
        room.door(0);
        carry.set(0, 0, 0);
        placeCarried();
        setPhase("hold");
      },
    );
  }
  /** Out of the dark room and into the light: the tray goes on over the
   *  seam, the kitchen grows to fill the screen and brightens toward noon,
   *  and the step is done — the light step picks up from that view. */
  function sendToLight() {
    if (phase !== "toLight") return;
    dragging = false;
    phase = "carry";
    released.copy(carry);
    if (!dragging) {
      dragView.w = darkRect.w;
      dragView.h = darkRect.h;
    }
    trayOnLayer();
    flying = true;
    tween(
      1.8,
      (k) => {
        /* The tray's path is worked out where it is drawn (`render`): it
           flies to its shelf on the rack as the kitchen grows. */
        flight = k;
        leave = smooth(k, 0.15, 1);
      },
      () => {
        flying = false;
        carryScale = 1;
        carry.set(0, 0, 0);
        placeCarried();
        /* It is on its shelf already; the light step does not bring it
           on again. */
        fromDark = true;
        /* The light step starts from the kitchen as it is seen now. */
        camPos.copy(roomCam.position);
        camTarget.copy(roomLow);
        camReady = true;
        finishAuto();
        progress = 1;
        setPhase("done");
      },
    );
    report();
  }
  /** A point on the dark room's view, at the height the tray is carried. */
  const darkHit = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  function dragPoint(px: number, py: number, out: THREE.Vector3) {
    const r = darkRect;
    if (r.w < 1 || r.h < 1) return null;
    ndc.set(((px - r.x) / r.w) * 2 - 1, -((py - r.y) / r.h) * 2 + 1);
    ray.setFromCamera(ndc, darkCam);
    return ray.ray.intersectPlane(darkHit, out);
  }
  /** Past the seam, into the kitchen's half. */
  function overLight(px: number, py: number) {
    return L === WIDE
      ? px > darkRect.x + darkRect.w
      : py > darkRect.y + darkRect.h;
  }
  /** The whole rack first, the covered tray slid onto its shelf, and then
   *  the camera comes in close on that one shelf: the tray and its light. */
  let rackClose = 0;
  function placeOnRack() {
    rackClose = 0;
    /* Straight on from the dark room's drop it is already in place. */
    const placed = fromDark;
    fromDark = false;
    const from = placed
      ? new THREE.Vector3()
      : new THREE.Vector3(0, 0.12, SHELF_RACK.d / 2 + TRAY_D / 2 + 0.6);
    carry.copy(from);
    placeCarried();
    const T = placed ? 2.2 : 3.4;
    const lead = placed ? 1.2 : 0;
    tween(
      T,
      (k) => {
        const t = k * T + lead;
        const s = smooth(t, 0.5, 1.8);
        carry.set(0, from.y * (1 - smooth(t, 1.5, 1.9)), from.z * (1 - s));
        placeCarried();
        rackClose = smooth(t, 2.2, 2.6);
      },
      () => {
        carry.set(0, 0, 0);
        placeCarried();
        rackClose = 1;
        setPhase("uncover");
      },
    );
  }
  function liftLid() {
    if (phase !== "uncover") return;
    phase = "drop";
    /* The cover goes back to being the water tray: lifted off and turned
       up beside the tray, then slid back under it while it is held up. */
    const LIFT = 0.75;
    const from = lid.position.clone();
    /* Out through the rack's open left side, between its legs, and turned
       over beside it: the shelf above leaves no room to turn it over where
       it is, and toward the viewer it filled the screen. */
    const side = new THREE.Vector3(
      -SHELF_RACK.w / 2 - TRAY_W / 2 - 0.35,
      LID_OFF,
      0,
    );
    const under = new THREE.Vector3(0, LID_OFF, 0);
    tween(
      2.6,
      (k) => {
        /* Slid straight off the tray and out of the stand, then turned
           over beside it, high enough to clear the bench, and set down:
           turned over the tray, it swept through the tray and the stand. */
        const HIGH = LID_OFF + 0.35;
        const slide = ease(clamp01(k / 0.14));
        const rise = smooth(k, 0.12, 0.2);
        const off = ease(clamp01((k - 0.16) / 0.16));
        const land = smooth(k, 0.3, 0.4);
        const back = ease(clamp01((k - 0.52) / 0.24));
        if (back > 0) lid.position.lerpVectors(side, under, back);
        else {
          lid.position.set(
            THREE.MathUtils.lerp(from.x, side.x, slide),
            land > 0
              ? THREE.MathUtils.lerp(HIGH, side.y, land)
              : THREE.MathUtils.lerp(from.y, HIGH, rise),
            THREE.MathUtils.lerp(from.z, side.z, slide),
          );
        }
        lid.rotation.set(Math.PI * (1 - off), 0, 0);
        lidShadow.visible = slide > 0.5;
        shadowUnder(lid);
        const up = smooth(k, 0.36, 0.52);
        const down = smooth(k, 0.78, 0.97);
        bedAt(
          down > 0
            ? THREE.MathUtils.lerp(LIFT, 0, down)
            : THREE.MathUtils.lerp(-TRAY_RAISE, LIFT, up),
        );
      },
      () => {
        lid.visible = false;
        lidShadow.visible = false;
        for (const w of activePair().water) w.visible = true;
        bedAt(0);
        setPhase("light");
      },
    );
    report();
  }
  function lightOn() {
    if (phase !== "light") return;
    /* Click: the rocker tips, then the tube flickers on. */
    rack.rockerMat.emissiveIntensity = 0;
    tween(0.15, (k) => (rack.rocker.rotation.x = -0.22 + 0.44 * k));
    tween(0.7, (k) => {
      const flick = k < 0.45 ? (Math.sin(k * 60) > 0.2 ? 1 : 0.2) : 1;
      const on = ease(clamp01((k - 0.1) / 0.9)) * flick;
      rack.beamMat.opacity = 0.32 * on;
      rack.diffuserMat.color.setRGB(
        0.79 + 0.21 * on,
        0.8 + 0.18 * on,
        0.78 + 0.13 * on,
      );
    });
    lightTarget = 1.12;
    val.greenTarget = 0.35;
    setPhase("water");
  }
  function waterTray() {
    if (phase !== "water" || canAnim.pouring) return;
    canAnim.pouring = true;
    canAnim.t = 0;
  }

  /* ---------------------------------------------------------- autoplay */
  function autoplay() {
    wake();
    if (
      phase === "done" ||
      step === "pick" ||
      phase === "drop" ||
      phase === "carry"
    )
      return;
    auto = { t: 0 };
  }
  function autoTick(dt: number) {
    if (!auto) return;
    auto.t += dt;
    const t = auto.t;
    const tick = (every: number) =>
      Math.floor(t / every) !== Math.floor((t - dt) / every);
    const at = (x: number, z: number) => {
      ptr.auto = (ptr.auto ?? new THREE.Vector3()).set(x, 0, z);
    };
    const take = (target: Target) => {
      if (tick(0.5)) select(target);
    };
    switch (phase) {
      case "takeTray":
        return take("tray");
      case "dip":
        at(L.dip[0], L.dip[1]);
        if (t > 0.9 && tick(0.5)) select("basin");
        return;
      case "lift":
        if (tick(0.6)) select("tray");
        return;
      case "takeCloth":
        return take("cloth");
      case "takeCan":
        return take("can");
      case "takeScoop":
        return take("block");
      case "takePacket":
        return take(`packet-${look}`);
      case "takeCutter":
        return take("cutter");
      case "uncover":
        return take("lid");
      case "toLight":
        return sendToLight();
      case "light":
        return take("lamp");
      case "water":
        if (tick(2)) waterTray();
        return;
      case "wipe":
      case "sow":
      case "cut": {
        const rate =
          phase === "wipe"
            ? 0.11
            : phase === "cut"
              ? 0.13
              : phase === "sow"
                ? 0.18
                : 0.16;
        const [x, z] = zigzag((t * rate) % 1, 6, 0.15);
        at(x, z);
        return;
      }
      case "fill": {
        /* The bowl held off to the right of where its lip pours, so the
           lip, not the bowl, sweeps the tray. */
        const [x, z] = zigzag((t * 0.16) % 1, 5, 0.25);
        at(x + bowlReach(), z);
        return;
      }
      case "pour": {
        /* The can's body where its tipped spout reaches the bowl: about
           one modelled unit back from the tip along the way it faces. */
        const reach = 0.95 * can.scale.x;
        at(
          L.basin[0] - Math.cos(CAN_YAW) * reach,
          L.basin[1] + Math.sin(CAN_YAW) * reach,
        );
        holding = true;
        return;
      }
    }
  }
  function finishAuto() {
    auto = null;
    ptr.auto = null;
    ptr.down = false;
    holding = false;
  }

  /* ------------------------------------------------------- per frame */
  const pose = new THREE.Vector3();
  function update(dt: number) {
    clock += dt;
    autoTick(dt);
    for (let k = tweens.length - 1; k >= 0; k--) {
      const tw = tweens[k];
      tw.t += dt;
      const kk = clamp01(tw.t / tw.dur);
      tw.run(kk);
      if (kk >= 1) {
        tweens.splice(k, 1);
        tw.done?.();
      }
    }

    const workY =
      phase === "dip" || phase === "lift"
        ? DIP.h
        : phase === "wipe"
          ? FLOOR_Y
          : phase === "pour"
            ? 0.35
            : phase === "cut"
              ? MEDIUM_Y + 0.06
              : MEDIUM_Y;
    const p = hit(workY);
    if (p) {
      if (ptr.has && ptr.lastY === workY) {
        const d = Math.hypot(p.x - ptr.last.x, p.z - ptr.last.z);
        ptr.speed += (d / Math.max(dt, 1e-3) - ptr.speed) * 0.4;
      } else ptr.speed = 0;
      ptr.last.copy(p);
      ptr.lastY = workY;
      ptr.has = true;
    } else {
      ptr.has = false;
      ptr.speed *= 0.8;
    }
    const engaged = !!p && (ptr.auto !== null || ptr.mouse || ptr.down);

    /* Hover: what the pointer would pick up. */
    const h = ptr.auto ? null : pickTarget();
    if (h !== hovered) {
      hovered = h;
      events.onHover(h);
    }

    switch (step) {
      case "pick":
        updatePick(dt);
        break;
      case "clean":
        updateClean(dt, p, engaged);
        break;
      case "soak":
        updateSoak(dt, p);
        break;
      case "fill":
        updateFill(dt, p);
        break;
      case "sow":
        updateSow(dt, p, engaged);
        break;
      case "dark":
        updateDark(dt);
        break;
      case "light":
        updateLight(dt, p, engaged);
        break;
      case "harvest":
        updateHarvest(dt, p, engaged);
        break;
    }

    /* Rings, bobs and the hover lift on whatever is to be reached for. */
    const ts = held
      ? targetsFor(phase).filter((t) => t === "basin")
      : targetsFor(phase).filter(
          (t) => t !== "tray" || phase === "takeTray" || phase === "lift",
        );
    halos.forEach((ring, i) => {
      const t = ts[i];
      const o = t ? targetObject(t) : null;
      const mat = ring.material as THREE.MeshBasicMaterial;
      if (!o || t === "lamp" || !o.visible) {
        mat.opacity = Math.max(0, mat.opacity - dt * 4);
        return;
      }
      o.getWorldPosition(tmp);
      const r =
        t === "block"
          ? 1.0
          : t === "basin"
            ? 2.0
            : t === "lid" || t.startsWith("tray")
              ? 1.75
              : t.startsWith("packet")
                ? /* Just under half the gap between packets, pulse included,
                     so neighbouring rings never touch. */
                  0.48
                : 0.55;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.2);
      ring.position.set(tmp.x, 0.006, tmp.z);
      ring.scale.setScalar(r * o.scale.x * (1 + 0.08 * pulse));
      mat.opacity = Math.min(0.9, mat.opacity + dt * 3) * (0.55 + 0.45 * pulse);
    });
    for (const t of TARGETS) {
      const o = targetObject(t);
      if (!o || t === "tray" || t === "lamp" || t.startsWith("tray")) continue;
      const inner = o.children[0];
      if (!inner || o === lid || o === tub || o === dipRig) continue;
      const want = ts.includes(t)
        ? 0.035 + 0.035 * Math.sin(clock * 3.2) + (hovered === t ? 0.08 : 0)
        : 0;
      inner.position.y += (want - inner.position.y) * Math.min(1, dt * 10);
    }
    /* The switch glows and breathes while it waits to be pressed. */
    if (phase === "light") {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
      rack.rockerMat.emissiveIntensity = 0.35 + 0.65 * pulse;
      rack.lightSwitch.scale.setScalar(1 + 0.08 * pulse);
    } else if (rack.lightSwitch.scale.x !== 1) {
      rack.lightSwitch.scale.setScalar(1);
    }

    shared.grow.value +=
      (val.growTarget - shared.grow.value) * Math.min(1, dt * 2.2);
    if (Math.abs(val.growTarget - shared.grow.value) < 1e-3)
      shared.grow.value = val.growTarget;
    shared.green.value +=
      (val.greenTarget - shared.green.value) * Math.min(1, dt * 1.6);
    if (Math.abs(val.greenTarget - shared.green.value) < 1e-3)
      shared.green.value = val.greenTarget;
    lightLevel += (lightTarget - lightLevel) * Math.min(1, dt * 2.5);
    hemi.intensity = 1.6 * lightLevel;
    sunLight.intensity = 1.6 * lightLevel;
    shared.light.value = 0.35 + 0.65 * Math.min(1.15, lightLevel);

    if (hfDirty) {
      layoutPeat();
      hfDirty = false;
    }
    for (const s of particleSets) s.update(dt);
    for (const [obj, s] of shadows) {
      s.visible = obj.visible;
      s.position.x = obj.position.x;
      s.position.z = obj.position.z;
      s.scale.setScalar(obj.scale.x);
      (s.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        1 - Math.max(0, obj.position.y) * 0.8,
      );
    }
    updateCamera(dt);
    report();
  }

  function updatePick(dt: number) {
    if (!pickAnim.active) {
      for (const f of TRAY_FINISH_KEYS) {
        const g = pairs[f].group;
        const lift = hovered === f ? 0.14 : 0;
        const bob =
          0.32 +
          Math.sin(clock * 1.5 + (f === "tray-pair" ? 0 : 1.7)) * 0.06 +
          lift;
        g.position.y += (bob - g.position.y) * Math.min(1, dt * 8);
        g.rotation.z =
          Math.sin(clock * 1.1 + (f === "tray-pair" ? 0.5 : 2)) * 0.025;
        pairs[f].shadowMat.opacity = 0.55;
      }
      return;
    }
    pickAnim.t += dt;
    const me = pairs[finish];
    const other =
      pairs[finish === "tray-pair" ? "tray-pair-food-grade" : "tray-pair"];
    const ot = clamp01(pickAnim.t / 0.8);
    const [ox, oz] = L.pick[other.finish];
    other.group.position.set(
      ox * (1 + ease(ot) * 1.2),
      0.32 + ease(ot) * 2.4,
      oz * (1 + ease(ot) * 1.2),
    );
    other.shadowMat.opacity = 0.55 * (1 - ot);
    if (ot >= 1) {
      other.group.visible = false;
      other.shadow.visible = false;
    }
    const st = clamp01(pickAnim.t / 0.45);
    const [mx, mz] = L.pick[finish];
    me.group.position.x = mx * (1 - ease(st));
    me.group.position.z = mz * (1 - ease(st));
    me.shadow.position.set(
      me.group.position.x + 0.12,
      0.002,
      me.group.position.z + 0.1,
    );
    if (st < 1) {
      me.group.position.y = THREE.MathUtils.lerp(pickAnim.y, 1.3, ease(st));
      me.group.rotation.z *= 0.9;
      pickAnim.vy = 0;
      return;
    }
    pickAnim.vy -= 14 * dt;
    let y = me.group.position.y + pickAnim.vy * dt;
    if (y <= 0) {
      y = 0;
      if (Math.abs(pickAnim.vy) > 0.6) {
        pickAnim.wobble = Math.min(0.06, Math.abs(pickAnim.vy) * 0.012);
        pickAnim.vy = -pickAnim.vy * 0.3;
      } else {
        pickAnim.vy = 0;
        if (!pickAnim.landed) {
          pickAnim.landed = true;
          progress = 1;
          setPhase("done");
        }
      }
    }
    me.group.position.y = y;
    pickAnim.wobble *= Math.exp(-dt * 5);
    me.group.rotation.x = Math.sin(clock * 22) * pickAnim.wobble;
    me.group.rotation.z = Math.cos(clock * 19) * pickAnim.wobble * 0.6;
    me.shadowMat.opacity = Math.max(0.2, 1 - y * 0.6);
  }

  function updateClean(dt: number, p: THREE.Vector3 | null, engaged: boolean) {
    const g = activePair().group;
    /* The tray's shadow goes where it goes, fainter as it rises, and none
       under the solution. */
    if (dipRig.visible) {
      stir = Math.max(0, stir - dt * 0.6);
      rippleWater(dipWater, clock, stir);
    }
    const sh = pairs[finish];
    sh.shadow.position.set(g.position.x + 0.12, 0.002, g.position.z + 0.1);
    sh.shadowMat.opacity =
      phase === "steep" || (phase === "lift" && overDip(g.position))
        ? 0
        : Math.max(0.15, 1 - Math.max(0, g.position.y) * 0.9);
    /* The tray in the hand, carried over the pointer. */
    if (held === "tray") {
      const aim = p ?? v3(L.dip);
      pose.set(aim.x, 0.85, aim.z);
      g.position.lerp(pose, Math.min(1, dt * 10));
      g.rotation.z = Math.sin(clock * 2) * 0.03;
    }
    /* Soaking: the clock runs on its own; the tray settles and fizzes. */
    if (phase === "steep") {
      dip.steep += dt;
      g.position.y = 0.03 + Math.sin(clock * 3) * 0.008;
      for (let n = 0; n < 3; n++)
        bubbles.emit(
          v3(L.dip, DIP.water - 0.04).add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 1.9,
              0,
              (Math.random() - 0.5) * 2.5,
            ),
          ),
          new THREE.Vector3(0, 0.2, 0),
          0.5 + Math.random() * 0.4,
          0.02 + Math.random() * 0.025,
        );
      if (dip.steep >= STEEP_SECONDS) setPhase("lift");
    }
    if (held === "cloth" && p && engaged && onTray(p, 0.3)) {
      pose.set(
        THREE.MathUtils.clamp(p.x, -FLOOR.hw + 0.45, FLOOR.hw - 0.45),
        FLOOR_Y - 0.01,
        THREE.MathUtils.clamp(p.z, -FLOOR.hd + 0.35, FLOOR.hd - 0.35),
      );
      const from = clothRig.position.clone();
      clothRig.position.lerp(pose, Math.min(1, dt * 28));
      clothRig.rotation.y +=
        (Math.sin(clock * 3) * 0.3 - clothRig.rotation.y) * dt * 3;
      /* Wipe along the whole path the cloth swept this frame, so a quick
         hand does not skip patches. */
      if (ptr.speed > 0.15) {
        const strength = Math.min(0.5, 0.1 + ptr.speed * 0.05);
        const d = from.distanceTo(clothRig.position);
        const n = Math.max(1, Math.ceil(d / 0.12));
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          wipe(
            THREE.MathUtils.lerp(from.x, clothRig.position.x, k),
            THREE.MathUtils.lerp(from.z, clothRig.position.z, k),
            strength / Math.sqrt(n),
          );
        }
      }
    }
    let dirt = 0;
    for (const d of dirtCells) dirt += d;
    const clean = 1 - dirt / dirtCells.length;
    if (phase === "done") return;
    const stage: Partial<Record<Phase, number>> = {
      dip: 0.1,
      steep: 0.15 + 0.35 * clamp01(dip.steep / STEEP_SECONDS),
      lift: 0.5,
      takeCloth: 0.55,
      wipe: 0.55 + 0.45 * clamp01(clean / 0.9),
    };
    progress = Math.min(0.99, stage[phase] ?? 0);
    if (phase === "wipe" && clean >= 0.9) {
      tween(
        0.6,
        (k) => {
          dirtMat.opacity = 1 - k;
          wetMat.opacity = 1 - k;
          const plastic = activePair().mats.grow;
          if (plastic instanceof THREE.MeshStandardMaterial)
            plastic.envMapIntensity = 0.4 + Math.sin(k * Math.PI) * 1.2;
        },
        () => {
          grimeGroup.visible = false;
        },
      );
      held = null;
      putBack(clothRig, v3(L.cloth), 0.3);
      progress = 1;
      finishAuto();
      setPhase("done");
    }
  }

  const pourSpot = new THREE.Vector3();
  function updateSoak(dt: number, p: THREE.Vector3 | null) {
    const basinAt = v3(L.basin);
    if (held === "can") {
      /* The body under the pointer, as it is held. Brought near the bowl
         — over it, or where its spout would reach it — it settles where
         the spout pours into the middle and tips by itself; held down
         anywhere, it tips too. */
      const aim = p ?? basinAt;
      const k = can.scale.x;
      const reach = 0.95 * k;
      const spot = pourSpot.set(
        basinAt.x - Math.cos(CAN_YAW) * reach,
        0,
        basinAt.z + Math.sin(CAN_YAW) * reach,
      );
      const near =
        phase === "pour" &&
        (Math.hypot(aim.x - spot.x, aim.z - spot.z) < 0.45 * k ||
          Math.hypot(aim.x - basinAt.x, aim.z - basinAt.z) < BASIN_R * BOWL);
      const pouring = (holding || near) && phase === "pour";
      canAnim.t = Math.max(
        0,
        Math.min(1, canAnim.t + (pouring ? dt : -dt) * 3),
      );
      const tilt = ease(canAnim.t);
      /* Lifted as it stood, facing the bowl, and tipped forward over its
         spout — never turned round, which would swing it across the tray.
         Tipped, the spout sits about a sixth of a modelled unit below the
         foot, times the scale, so the foot rises enough to pour over the
         rim. */
      const at = near ? spot : aim;
      pose.set(at.x, 0.4 + 0.34 * k * tilt, at.z);
      can.position.lerp(pose, Math.min(1, dt * 12));
      can.rotation.set(0, CAN_YAW, -0.85 * tilt);
      if (pouring && canAnim.t > 0.7) {
        const tip = can.localToWorld(SPOUT.clone());
        for (let n = 0; n < 6; n++) {
          drops.emit(
            tip,
            new THREE.Vector3(
              -0.6 - Math.random() * 0.4,
              -0.4 - Math.random() * 0.3,
              (Math.random() - 0.5) * 0.35,
            ),
            0.6,
            0.035 + Math.random() * 0.03,
          );
        }
        if (
          Math.hypot(tip.x - 0.25 - basinAt.x, tip.z - basinAt.z) <
          BASIN_R * BOWL
        )
          val.water = Math.min(1, val.water + dt * 0.55);
      }
    }
    if (val.water > 0.02 && val.swell < 1) {
      const sip = Math.min(val.water, dt * 0.38);
      val.water -= sip * 0.55;
      val.swell = Math.min(1, val.swell + sip * 0.95);
    }
    /* Soaked through, the block gives way on its own and slumps into
       loose peat as it drinks the last of the water (the owner, 2 Oct
       2026: no rubbing), shedding a few crumbs as it goes. */
    const loosen = smooth(val.swell, 0.4, 1);
    if (loosen > val.crumble) {
      val.crumble = loosen;
      if (Math.random() < 0.35) {
        const at = v3(L.basin, 0.4);
        crumbs.emit(
          at.set(
            at.x + (Math.random() - 0.5) * 0.6 * BOWL,
            at.y,
            at.z + (Math.random() - 0.5) * 0.4 * BOWL,
          ),
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.6,
            0.3 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.6,
          ),
          0.6,
          0.03 + Math.random() * 0.03,
        );
      }
    }
    if (phase !== "pour") val.water = Math.max(0, val.water - dt * 0.3);
    if (phase === "pour" && val.swell >= 1) {
      holding = false;
      held = null;
      putBack(can, v3(L.can), CAN_YAW);
    }
    shapeBlock(block, val.swell, smooth(val.crumble, 0, 1), val.left);
    const level = 0.04 + val.water * (BASIN_H - 0.14);
    water.position.y = level;
    const r = basinRadiusAt(level);
    water.scale.set(r, r, 1);
    water.visible = val.water > 0.01;
    if (phase !== "done") {
      progress = Math.min(0.99, 0.55 * val.swell + 0.45 * val.crumble);
      if (val.crumble >= 1) {
        progress = 1;
        finishAuto();
        setPhase("done");
      }
    }
  }

  /* Step 5: the bowl itself is picked up and tipped over the tray (the
     owner, 2 Oct 2026, in place of a scoop in the hand). It pours from
     its rim on the side toward the tray, so held with the pointer on the
     bowl, the peat lands that far to the left. */
  let scoopClock = 0;
  const bowlAnim = { t: 0 };
  const BOWL_TIP = 0.95;
  const bowlLip = new THREE.Vector3();
  const lipAt = new THREE.Vector3();
  /** How far left of the bowl's foot its rim pours from, tipped. */
  const bowlReach = () =>
    BOWL *
    ((BASIN_R + 0.05) * Math.cos(BOWL_TIP) + BASIN_H * Math.sin(BOWL_TIP));
  function updateFill(dt: number, p: THREE.Vector3 | null) {
    /* Drawn by the square of what is left, so the mound visibly drops
       with the first pour rather than holding its height until the end
       (its own size rule is by volume). It keeps a floor size so it
       never inverts; past the last crumbs it simply goes. */
    shapeBlock(block, 1, 1, val.left * val.left);
    block.mesh.visible = val.left > 0.04;
    water.visible = false;
    slump();
    const vol = hfVolume();
    if (held === "bowl") {
      const aim = p ?? new THREE.Vector3(L.basin[0], 0, L.basin[1]);
      /* Tips by itself whenever its rim would pour onto the tray, and
         rights itself when moved off. */
      const over = onTray(lipAt.set(aim.x - bowlReach(), 0, aim.z), 0.1);
      bowlAnim.t = clamp01(bowlAnim.t + (over ? dt : -dt) * 4);
      const tilt = ease(bowlAnim.t);
      pose.set(aim.x, MEDIUM_Y + 0.35 + 0.6 * tilt, aim.z);
      tub.position.lerp(pose, Math.min(1, dt * 12));
      tub.rotation.set(0, 0, BOWL_TIP * tilt);
      scoopClock += dt;
      /* A steady stream: a heap every twentieth of a second or so, from
         as soon as the bowl is half tipped. */
      if (tilt > 0.5 && scoopClock > 0.05) {
        scoopClock = 0;
        tub.localToWorld(bowlLip.set(-(BASIN_R + 0.05), BASIN_H, 0));
        if (onTray(bowlLip)) scoop(bowlLip.x, bowlLip.z);
      }
    }
    if (phase !== "done") {
      progress = Math.min(
        0.99,
        phase === "takeScoop" ? 0 : clamp01(vol / (LEVEL * 0.97)),
      );
      /* Full: the bowl goes back and the peat settles flat on its own
         (the owner, 2 Oct 2026: no levelling by hand). */
      if (phase === "fill" && vol >= LEVEL * 0.97) {
        held = null;
        val.left = 0;
        putBack(tub, v3(L.basin), 0);
        const from = Float32Array.from(hf);
        tween(0.7, (k) => {
          for (let i = 0; i < hf.length; i++)
            hf[i] = THREE.MathUtils.lerp(from[i], LEVEL, ease(k));
          hfDirty = true;
        });
        progress = 1;
        finishAuto();
        setPhase("done");
      }
    }
  }

  const packetMouth = new THREE.Vector3();
  function updateSow(dt: number, p: THREE.Vector3 | null, engaged: boolean) {
    let moving = false;
    for (let k = 0; k < MASK_NX * MASK_NZ; k++) {
      if (maskBytes[k * 4] === 255 && maskBytes[k * 4 + 2] < 255) {
        maskBytes[k * 4 + 2] = Math.min(
          255,
          maskBytes[k * 4 + 2] + Math.ceil(dt * 500),
        );
        moving = true;
      }
    }
    if (moving) maskTex.needsUpdate = true;
    const mine = packets[look];
    if (held === "packet") {
      const at = p && onTray(p, 0.3) ? p : new THREE.Vector3(0, MEDIUM_Y, 0);
      /* Tipped on its side, the pouch pours from one top corner — the low
         one — and that corner, not the pouch, follows the pointer: the
         pouch is set off by wherever the corner sits from its foot. */
      packetMouth.set(-PACKET.w / 2 + 0.05, PACKET.h - 0.03, 0);
      mine.localToWorld(packetMouth);
      pose.set(
        at.x + mine.position.x - packetMouth.x,
        MEDIUM_Y + 0.5,
        at.z + mine.position.z - packetMouth.z,
      );
      mine.position.lerp(pose, Math.min(1, dt * 12));
      mine.rotation.y += (0.2 - mine.rotation.y) * dt * 6;
      mine.rotation.z += (1.15 - mine.rotation.z) * Math.min(1, dt * 6);
      if (
        phase === "sow" &&
        p &&
        engaged &&
        onTray(p, 0.2) &&
        (ptr.speed > 0.1 || ptr.auto)
      ) {
        /* The corner that tips lowest: the top of the pouch's left edge. */
        packetMouth.set(-PACKET.w / 2 + 0.05, PACKET.h - 0.03, 0);
        mine.localToWorld(packetMouth);
        paintMask(p.x, p.z, 0.27, 0, 0.55);
        for (let n = 0; n < 3; n++) {
          seedsFall.emit(
            packetMouth,
            new THREE.Vector3(
              -0.15 - Math.random() * 0.2,
              -0.7,
              (Math.random() - 0.5) * 0.2,
            ),
            0.35,
            LOOKS[look].seedSize * 1.6,
          );
        }
      }
    }
    if (phase === "sow") {
      const sown = maskCount(0) / insideCount;
      progress = Math.min(0.99, sown / 0.88);
      if (sown >= 0.88) {
        for (let k = 0; k < MASK_NX * MASK_NZ; k++) maskBytes[k * 4] = 255;
        maskTex.needsUpdate = true;
        held = null;
        putBack(mine, v3(L.packets[look]), 0);
        progress = 1;
        finishAuto();
        setPhase("done");
      }
    }
  }

  function updateDark(dt: number) {
    if (phase === "toLight" || leave > 0) {
      rackAim = Math.min(1, rackAim + dt / 1.4);
      morning = Math.min(leave > 0 ? 0.25 : 0.1, morning + dt * 0.04);
      if (leave > 0) morning = Math.max(morning, 0.1 + 0.15 * ease(leave));
    }
    if (dragging) {
      carry.lerp(dragTo, Math.min(1, dt * 16));
      placeCarried();
    }
    /* Inside the dark room: first on its own, then the kitchen slides in
       beside it, then the days run by themselves — faster when it is done
       for the visitor — and the shoots come up with them. */
    const pace = auto ? 3 : 1;
    if (phase === "hold" && darkOpen < 1) {
      darkIntro += dt * pace;
      if (darkIntro > 0.9) darkOpen = Math.min(1, darkOpen + (dt * pace) / 1.1);
    }
    if (phase === "hold" && darkOpen >= 1) {
      val.days = Math.min(
        DARK_DAYS,
        val.days + ((dt * DARK_DAYS) / DARK_SECONDS) * pace,
      );
      val.growTarget = DARK_GROW * (val.days / DARK_DAYS);
    }
    val.lidLift = LID_LIFT * smooth(shared.grow.value, 0.15, DARK_GROW);
    if (phase === "hold" || phase === "done") {
      lid.position.y = LID_ON + val.lidLift;
    }
    if (phase === "hold") {
      progress = Math.min(0.99, 0.25 + 0.75 * (val.days / DARK_DAYS));
      if (val.days >= DARK_DAYS && shared.grow.value > DARK_GROW - 0.01) {
        /* The days are done: the visitor takes the tray out into the
           light (the owner, 2 Oct 2026) — or it is done for them. */
        progress = 0.99;
        morning = 0;
        setPhase("toLight");
        if (auto) sendToLight();
      }
    } else if (phase === "cover") progress = 0;
  }

  function updateLight(dt: number, p: THREE.Vector3 | null, engaged: boolean) {
    if (canAnim.pouring) {
      canAnim.t += dt;
      const ct = canAnim.t;
      const home = v3(L.canLight);
      /* Watered from below, once (the owner, 2 Oct 2026): the white tray
         is lifted, the can pours into the green tray under it, and the
         white tray goes back down to drink. The can is placed by where
         its spout's tip has to be — inside the green tray's rim, in the
         gap under the lifted white tray — so the stream visibly leaves
         the spout and lands in the tray. */
      bedAt(0.75 * smooth(ct, 0, 0.35) * (1 - smooth(ct, 2.3, 2.7)));
      const k =
        ease(clamp01((ct - 0.25) / 0.45)) *
        (1 - ease(clamp01((ct - 1.95) / 0.4)));
      can.rotation.set(
        0,
        THREE.MathUtils.lerp(2.9, Math.PI, k),
        THREE.MathUtils.lerp(0, -0.55, k),
      );
      can.updateMatrixWorld();
      const reach = SPOUT.clone().multiply(can.scale).applyEuler(can.rotation);
      pose.set(TRAY_W / 2 - 0.3, TRAY_H + 0.16, TRAY_D / 2 - 0.35).sub(reach);
      can.position.lerpVectors(home, pose, k);
      can.updateMatrixWorld(true);
      if (ct > 0.75 && ct < 1.95) {
        const tip = can.localToWorld(SPOUT.clone());
        for (let n = 0; n < 4; n++) {
          pourDrops.emit(
            tip,
            new THREE.Vector3(
              -0.55 - Math.random() * 0.2,
              -0.1 - Math.random() * 0.2,
              (Math.random() - 0.5) * 0.12,
            ),
            0.5 + Math.random() * 0.2,
            0.035 + Math.random() * 0.025,
          );
        }
      }
      if (ct > 2.75) {
        canAnim.pouring = false;
        bedAt(0);
        val.waterings++;
        val.growTarget = 1;
        val.greenTarget = 1;
        progress = 1;
        finishAuto();
        setPhase("done");
      }
    }
    if (phase !== "done") {
      const base = phase === "uncover" ? 0 : phase === "light" ? 0.15 : 0.35;
      progress = Math.min(
        0.99,
        base + (phase === "water" ? val.waterings * 0.64 : 0),
      );
    }
    handInGreens(dt, p, engaged);
  }

  function updateHarvest(
    dt: number,
    p: THREE.Vector3 | null,
    engaged: boolean,
  ) {
    if (held === "cutter") {
      /* Held low as a hand holds it, blade pointing away and handle toward
         the visitor, the middle of the blade where the pointer is. A slice
         cuts the stems along the whole blade as it moves, so a sweep
         across the tray clears a band as deep as the blade is long. */
      const at =
        p && onTray(p, 0.3) ? p : new THREE.Vector3(0, MEDIUM_Y, MED.hd);
      pose.set(at.x, MEDIUM_Y + 0.09, at.z);
      knife.position.lerp(pose, Math.min(1, dt * 14));
      const lean = THREE.MathUtils.clamp(-hand.vx * 0.08, -0.35, 0.35);
      knife.rotation.set(0, lean, 0);
      knife.updateMatrixWorld(true);
      if (
        phase === "cut" &&
        p &&
        engaged &&
        onTray(p, 0.25) &&
        (ptr.speed > 0.1 || ptr.auto)
      ) {
        const along = new THREE.Vector3();
        for (let k = 0; k <= 6; k++) {
          along.set(
            0,
            0,
            THREE.MathUtils.lerp(CUTTER_BLADE.from, CUTTER_BLADE.to, k / 6),
          );
          cutterInner.localToWorld(along);
          paintMask(along.x, along.z, 0.11, 1);
          if (k === 3) throwFrom.set(along.x, MEDIUM_Y + 0.12, along.z);
        }
      }
    }
    const sown = Math.max(1, maskCount(0));
    const cut = maskCount(1) / sown;
    heapWant = Math.max(heapWant, Math.round(Math.min(1, cut / 0.9) * HEAP));
    if (phase === "cut") {
      progress = Math.min(0.99, cut / 0.9);
      if (cut >= 0.9) {
        for (let k = 0; k < MASK_NX * MASK_NZ; k++)
          if (maskBytes[k * 4] === 255) maskBytes[k * 4 + 1] = 255;
        maskTex.needsUpdate = true;
        heapWant = HEAP;
        held = null;
        putBack(knife, v3(L.cutter, 0.02), -0.5);
        progress = 1;
        finishAuto();
        setPhase("done");
      }
    }
    throwGreens(dt);
    handInGreens(dt, p, engaged);
  }

  const flyM = new THREE.Matrix4();
  const flyQ = new THREE.Quaternion();
  const flySpin = new THREE.Quaternion();
  const flyS = new THREE.Vector3();
  const sprigTo = new THREE.Vector3();
  const flyAt = new THREE.Vector3();
  const flyAxis = new THREE.Vector3(1, 0, 0.4).normalize();
  const flyColor = new THREE.Color();
  /** Launch what has been cut toward the bowl, move what is in the air,
   *  and land what has arrived. Launched in heap order and all in the air
   *  for the same time, so they land in order, bottom of the heap first. */
  function throwGreens(dt: number) {
    if (!crop) return;
    if (heapLaunched < heapWant) flyBudget += dt * FLY_RATE;
    else flyBudget = 0;
    while (
      heapLaunched < heapWant &&
      flights.length < FLY_MAX &&
      flyBudget >= 1
    ) {
      flyBudget -= 1;
      const from =
        throwFrom.lengthSq() > 0
          ? throwFrom.clone()
          : new THREE.Vector3(0, MEDIUM_Y + 0.12, 0);
      from.x += (Math.random() - 0.5) * 0.25;
      from.z += (Math.random() - 0.5) * 0.25;
      flights.push({
        k: heapLaunched++,
        t: 0,
        from,
        spin: (Math.random() - 0.5) * 9,
      });
    }
    let n = 0;
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      f.t += dt / FLY_SECONDS;
      if (f.t >= 1) {
        crop.heap.count = Math.max(crop.heap.count, f.k + 1);
        continue;
      }
      crop.rest[f.k].decompose(sprigTo, flyQ, flyS);
      sprigTo.add(heapAt);
      const u = f.t;
      flyAt.lerpVectors(f.from, sprigTo, u);
      /* Up and over the bowl's rim, then down into it. */
      flyAt.y += Math.sin(Math.PI * u) * 0.9;
      flySpin.setFromAxisAngle(flyAxis, f.spin * (1 - u));
      flyQ.premultiply(flySpin);
      flyM.compose(flyAt, flyQ, flyS);
      crop.fly.setMatrixAt(n, flyM);
      crop.heap.getColorAt(f.k, flyColor);
      crop.fly.setColorAt(n, flyColor);
      flights[n++] = f;
    }
    flights.length = n;
    crop.fly.count = n;
    crop.fly.instanceMatrix.needsUpdate = true;
    if (crop.fly.instanceColor) crop.fly.instanceColor.needsUpdate = true;
  }

  /* A hand in grown greens bends them, as on the home page. */
  let fieldAcc = 0;
  let fieldMoving = false;
  const hand = { x: 0, z: 0, vx: 0, vz: 0, on: false };
  function handInGreens(
    dt: number,
    p0: THREE.Vector3 | null,
    engaged: boolean,
  ) {
    const p = hit(MEDIUM_Y + 0.4, new THREE.Vector3());
    if (p && engaged && onTray(p, 0.2) && p0) {
      if (hand.on) {
        hand.vx += ((p.x - hand.x) / Math.max(dt, 1e-3) - hand.vx) * 0.5;
        hand.vz += ((p.z - hand.z) / Math.max(dt, 1e-3) - hand.vz) * 0.5;
      }
      hand.x = p.x;
      hand.z = p.z;
      hand.on = true;
    } else hand.on = false;
    fieldAcc += dt;
    let n = 0;
    while (fieldAcc >= STEP && n < MAX_STEPS) {
      if (hand.on) brush(field, hand.x, hand.z, hand.vx, hand.vz, STEP);
      stepField(field, STEP);
      fieldAcc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) fieldAcc = 0;
    const settled = !hand.on && isSettled(field);
    if (!settled || fieldMoving) {
      packField(field, fieldBytes);
      fieldTex.needsUpdate = true;
    }
    fieldMoving = !settled;
  }

  /* ----------------------------------------------------------- camera */
  /** The region a step needs in view: the tray, plus what the step puts on
   *  the bench, as x0, x1, z0, z1, top. */
  function focusFor(s: BenchStep): number[] {
    let box = [-1.15, 1.15, -1.45, 1.45, 0.9];
    const add = ([x, z]: XZ, r: number, top = 0.9) => {
      box = [
        Math.min(box[0], x - r),
        Math.max(box[1], x + r),
        Math.min(box[2], z - r),
        Math.max(box[3], z + r),
        Math.max(box[4], top),
      ];
    };
    switch (s) {
      case "pick":
        for (const f of TRAY_FINISH_KEYS) {
          const [x, z] = L.pick[f];
          add([x, z], 0);
          /* On a wide stage each pair's product card stands beside it,
             so the frame keeps room for one at each end, with space
             between card and tray (the owner, 2 Oct 2026). */
          const card = L === WIDE ? PICK_CARD_ROOM : 0;
          box = [
            Math.min(box[0], x - 1.05 - card),
            Math.max(box[1], x + 1.05 + card),
            Math.min(box[2], z - 1.35),
            Math.max(box[3], z + 1.35),
            0.7,
          ];
        }
        break;
      case "clean":
        add(L.dip, 1.5, 0.5);
        add(L.cloth, 0.6);
        break;
      case "soak":
        add(L.basin, 0.85 * BOWL);
        /* Side on, the can runs from its spout (toward the bowl) to its
           handle: off centre on its foot, so framed by its real span. */
        add([L.can[0] - 0.25 * L.canScale, L.can[1]], 0.68 * L.canScale);
        break;
      case "fill":
        add(L.basin, 0.85 * BOWL);
        break;
      case "sow":
        for (const l of LOOK_KEYS) add(L.packets[l], 0.42);
        /* Room in front for the front row's tags, hung under them. */
        if (L === TALL) box[3] += 1.2;
        break;
      case "dark": {
        add(L.lid, 0);
        box = [
          Math.min(box[0], L.lid[0] - 1.1),
          Math.max(box[1], L.lid[0] + 1.1),
          Math.min(box[2], L.lid[1] - 1.4),
          Math.max(box[3], L.lid[1] + 1.4),
          box[4],
        ];
        /* On the way to the dark room the view turns to its door and
           follows the tray there, leaving the bench behind. */
        if (trip) {
          /* The door, and the rack waiting beside it. */
          box = [
            CORNER_X,
            DOOR.x1 + 1.3,
            WALL_Z,
            WALL_Z + TRAY_D + 1.6,
            SHELF_RACK.h + 0.2,
          ];
          add([carry.x, carry.z], TRAY_D / 2 + 0.2);
        }
        break;
      }
      case "light": {
        /* The whole rack, floor to top, then just our shelf: the tray,
           the can beside it and the light under the plate above. */
        const { w, d, shelves, h } = SHELF_RACK;
        box =
          rackClose < 0.5
            ? [
                -w / 2 - 0.3,
                w / 2 + 0.3,
                -d / 2,
                d / 2,
                h - RACK_DROP + 0.1,
                -RACK_DROP,
              ]
            : [
                -w / 2 - 0.1,
                w / 2 + 0.1,
                -d / 2,
                d / 2 + 0.2,
                shelves[OUR_SHELF + 1] - RACK_DROP + 0.05,
                -0.15,
              ];
        break;
      }
      case "harvest":
        add(L.bowl, 0.7);
        add(L.cutter, 0.55);
        /* Bare bench on the left for the kit card, so it stands clear of
           the tray (the owner, 3 Oct 2026). */
        if (L === WIDE) box[0] -= 2.6;
        break;
    }
    return box;
  }
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  let camReady = false;
  /* Low enough that the wall and window show over the bench. */
  let elevation = 0.42;
  /** The elevation the current framing is worked out for. */
  let fitElev = elevation;
  const fitCam = new THREE.PerspectiveCamera();
  const corner = new THREE.Vector3();
  const up = new THREE.Vector3();
  function extent(target: THREE.Vector3, dist: number, box: number[]) {
    fitCam.copy(camera);
    fitCam.position
      .set(0, Math.sin(fitElev) * dist, Math.cos(fitElev) * dist)
      .add(target);
    fitCam.lookAt(target);
    fitCam.updateMatrixWorld();
    const [x0, x1, z0, z1, top, bottom = 0] = box;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [x0, x1]) {
      for (const y of [bottom, top]) {
        for (const z of [z0, z1]) {
          corner.set(x, y, z).project(fitCam);
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
        }
      }
    }
    return { minX, maxX, minY, maxY };
  }
  /** Fit the step's box with a margin — more at the top and bottom, where
   *  the page puts its step dots and buttons — and centre it. */
  function frameFor(s: BenchStep) {
    const box = focusFor(s);
    /* The rack is seen straight on, nearly level; everything else from
       above the bench. */
    /* The pick looks further down, so the bench takes the room the wall
       had and the trays rise clear of the card at the bottom (the owner,
       3 Oct 2026), and so do the other kitchen steps. */
    const tilted = L === WIDE && s !== "light" && !(s === "dark" && trip);
    /* The kitchen steps tilt less, and only as far as keeps the shelf and
       the frame under it whole (the owner, same day): the steepest of
       these that does. The pick has no frame. */
    const tilts =
      s === "light"
        ? [rackClose < 0.5 ? 0.06 : 0.1]
        : !tilted
          ? [elevation]
          : s === "pick"
            ? [elevation + 0.16]
            : s === "dark"
              ? [elevation + 0.08]
              : [elevation + 0.08, elevation + 0.04, elevation];
    /* The top third is the room — window, shelf, print — so the work sits
       below it. */
    /* Soaking and filling are low work on the bench — a bowl, a can, the
       tray — so they come closer (the owner, 2 Oct 2026: the tray read
       small there), reaching higher into the room and nearer the dots. */
    const close = s === "soak" || s === "fill" || s === "sow";
    /* The rack stands up into the room, where the other steps leave it
       for the window. */
    const TOP = s === "light" ? 0.72 : close ? 0.42 : s === "pick" ? 0.45 : 0.3;
    /* Under the work is the card that says where you are, so on a wide
       stage the work stops above it (the owner, 3 Oct 2026). */
    const BOTTOM =
      s === "light"
        ? -0.7
        : L === WIDE
          ? -0.56
          : /* A phone's card is taller, stacked; the front pair's card
               hangs under its tray, above that. */
            s === "pick"
            ? -0.3
            : -0.5;
    /* Where a frame can hang, its nail stays in view; of the
       tilts, the one that keeps the work largest. */
    const keep = tilts.length > 1 ? shelfTop() : null;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < tilts.length; i++) {
      fitElev = tilts[i];
      const d = fitTo(box, TOP, BOTTOM, keep);
      if (d < bestDist - 1e-3) {
        bestDist = d;
        best = i;
      }
    }
    if (best !== tilts.length - 1) {
      fitElev = tilts[best];
      fitTo(box, TOP, BOTTOM, keep);
    }
  }
  const shelfAbove = new THREE.Vector3();
  const keepAt = new THREE.Vector3();
  /** The nail under the wall shelf, in the world: the frame hangs from
   *  it. What is on the shelf may crop off the top (the owner, 3 Oct
   *  2026); the nail and the frame may not. */
  function shelfTop() {
    return room.group.localToWorld(
      shelfAbove.set(
        (WALL_AD.x0 + WALL_AD.x1) / 2,
        WALL_AD.shelfBottom - 0.04,
        WALL_AD.z,
      ),
    );
  }
  /** Fit `box` between `top` and `bottom` (and the side margins) from
   *  `fitElev`, with `keep` (if any) under the top edge, leaving the pose
   *  in `wantTarget` and `wantPos`; returns its distance. */
  function fitTo(
    box: number[],
    TOP: number,
    BOTTOM: number,
    keep: THREE.Vector3 | null,
  ) {
    const [x0, x1, z0, z1, top, bottom = 0] = box;
    const MX = 0.97;
    wantTarget.set(
      (x0 + x1) / 2,
      bottom + (top - bottom) * 0.35,
      (z0 + z1) / 2,
    );
    let dist = 6;
    for (let pass = 0; pass < 2; pass++) {
      let lo = 1;
      let hi = 40;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2;
        const e = extent(wantTarget, mid, box);
        /* `extent` leaves `fitCam` at this pose. */
        if (
          e.minX > -MX &&
          e.maxX < MX &&
          e.minY > BOTTOM &&
          e.maxY < TOP &&
          (!keep || keepAt.copy(keep).project(fitCam).y < 0.97)
        )
          hi = mid;
        else lo = mid;
      }
      dist = hi;
      if (pass === 0) {
        const e = extent(wantTarget, dist, box);
        const off = (e.minY + e.maxY) / 2 - (TOP + BOTTOM) / 2;
        const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
        up.set(0, Math.cos(fitElev), -Math.sin(fitElev));
        wantTarget.addScaledVector(up, off * halfH);
      }
    }
    wantPos
      .set(0, Math.sin(fitElev) * dist, Math.cos(fitElev) * dist)
      .add(wantTarget);
    return dist;
  }
  const doorAt = new THREE.Vector3();
  const doorView = new THREE.Vector3();
  function updateCamera(dt: number) {
    /* Once the tray has gone into the light, the stage is the kitchen's
       view; the light step moves on from exactly there. */
    if (step === "dark" && leave > 0) {
      camPos.copy(roomCam.position);
      camTarget.copy(roomLow);
      camReady = true;
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      return;
    }
    frameFor(step);
    if (step === "dark" && zoom > 0) {
      doorAt.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h * 0.5, WALL_Z);
      doorView.copy(doorAt).add(new THREE.Vector3(0, 0.4, 6.2));
      wantTarget.lerp(doorAt, zoom);
      wantPos.lerp(doorView, zoom);
    }
    if (!camReady) {
      camTarget.copy(wantTarget);
      camPos.copy(wantPos);
      camReady = true;
    } else {
      const k = Math.min(1, dt * 2.4);
      camTarget.lerp(wantTarget, k);
      camPos.lerp(wantPos, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const scale =
      (h * renderer.getPixelRatio()) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (const s of particleSets) s.uniforms.uScale.value = scale;
    const next = camera.aspect < 0.9 ? TALL : WIDE;
    elevation = next === TALL ? 0.68 : 0.42;
    if (next !== L) {
      L = next;
      if (started) setStep(step);
    }
  }
  let started = false;
  resize();
  const resizer = new ResizeObserver(resize);
  if (canvas.parentElement) resizer.observe(canvas.parentElement);

  /* -------------------------------------------------------- ghost hand */
  /* When the visitor has been still for `GHOST_IDLE_SECONDS` with the bench
     at rest, a pale hand shows the move on the screen over the scene — taps
     the thing to pick up, carries the held tool to where it goes, or sweeps
     the tray — and the scene underneath does nothing (the owner, 2 Oct
     2026: "add the ghost hand demo when users get stuck"). It plays every
     `GHOST_PERIOD` until a hand moves; any real pointer, label or "Do it
     for me" puts it away. Drawn in `ghost.ts`. */
  let ghostEl: HTMLElement | null = null;
  let idle = 0;
  let ghostKey = "";
  const GHOST_PLAY = 2.6;
  const GHOST_PERIOD = 6;
  function wake() {
    idle = 0;
    hideGhost(ghostEl);
  }
  type GhostMove =
    | { kind: "tap"; at: THREE.Vector3 }
    | { kind: "carry"; from: THREE.Vector3; to: THREE.Vector3; tap: boolean }
    | { kind: "sweep"; y: number; dx: number }
    | { kind: "drag" };
  const gFrom = new THREE.Vector3();
  const gTo = new THREE.Vector3();
  /** Where on the object a finger goes: its middle, a little up. */
  function touchPoint(t: Target, out: THREE.Vector3): THREE.Vector3 | null {
    const o = targetObject(t);
    if (!o || !o.visible) return null;
    o.getWorldPosition(out);
    out.y += t === "can" || t === "block" ? 0.3 * o.scale.x : 0.08;
    return out;
  }
  function ghostMove(): GhostMove | null {
    const tap = (t: Target): GhostMove | null => {
      const at = touchPoint(t, gTo);
      return at ? { kind: "tap", at } : null;
    };
    switch (phase) {
      case "choose":
        return tap(TRAY_FINISH_KEYS[0]);
      case "takeTray":
      case "lift":
        return tap("tray");
      case "takeCloth":
        return tap("cloth");
      case "takeCan":
      case "water":
        return tap("can");
      case "takeScoop":
        return tap("block");
      case "takePacket":
        return tap(`packet-${look}`);
      case "takeCutter":
        return tap("cutter");
      case "uncover":
        return tap("lid");
      case "light":
        return tap("lamp");
      case "dip":
        activePair().group.getWorldPosition(gFrom);
        return {
          kind: "carry",
          from: gFrom,
          to: gTo.copy(v3(L.dip, DIP.h)),
          tap: true,
        };
      case "pour":
        can.getWorldPosition(gFrom);
        gFrom.y += 0.3 * can.scale.x;
        return {
          kind: "carry",
          from: gFrom,
          to: gTo.copy(v3(L.basin, 0.5)),
          tap: false,
        };
      case "wipe":
        return { kind: "sweep", y: FLOOR_Y, dx: 0 };
      case "sow":
        return { kind: "sweep", y: MEDIUM_Y, dx: 0 };
      case "cut":
        return { kind: "sweep", y: MEDIUM_Y + 0.06, dx: 0 };
      case "fill":
        return { kind: "sweep", y: MEDIUM_Y, dx: bowlReach() };
      case "toLight":
        return splitOn() ? { kind: "drag" } : null;
      default:
        return null;
    }
  }
  /** A world point in the canvas's CSS pixels, through whichever view it
   *  is drawn in. */
  const gScreen = new THREE.Vector3();
  function onScreen(v: THREE.Vector3, dark: boolean) {
    const box = canvas.getBoundingClientRect();
    gScreen.copy(v).project(dark ? darkCam : camera);
    return dark
      ? {
          x: darkRect.x + ((gScreen.x + 1) / 2) * darkRect.w,
          y: darkRect.y + ((1 - gScreen.y) / 2) * darkRect.h,
        }
      : {
          x: ((gScreen.x + 1) / 2) * box.width,
          y: ((1 - gScreen.y) / 2) * box.height,
        };
  }
  const glide = (a: number) => a * a * (3 - 2 * a);
  function driveGhost(dt: number) {
    if (!ghostEl) return;
    /* Only a bench at rest, waiting on the visitor, counts as stuck. */
    const key = `${step}:${phase}`;
    if (key !== ghostKey || auto || dragging || tweens.length > 0 || ptr.down) {
      ghostKey = key;
      return wake();
    }
    idle += dt;
    const g = idle - GHOST_IDLE_SECONDS;
    const u = g < 0 ? -1 : (g % GHOST_PERIOD) / GHOST_PLAY;
    const move = u >= 0 && u <= 1 ? ghostMove() : null;
    if (!move) return hideGhost(ghostEl);
    const fade = Math.min(1, u / 0.1, (1 - u) / 0.1);
    if (move.kind === "tap") {
      const to = onScreen(move.at, false);
      /* In from below and to the right, as a hand comes onto a screen. */
      const k = glide(Math.min(1, u / 0.45));
      const tapK = u < 0.45 ? 0 : Math.min(1, (u - 0.45) / 0.3);
      return placeGhost(
        ghostEl,
        to.x + 90 * (1 - k),
        to.y + 70 * (1 - k),
        fade,
        tapK,
      );
    }
    if (move.kind === "carry") {
      const a = onScreen(move.from, false);
      const b = onScreen(move.to, false);
      const k = glide(Math.min(1, Math.max(0, (u - 0.1) / 0.55)));
      const tapK = move.tap && u > 0.68 ? Math.min(1, (u - 0.68) / 0.25) : 0;
      return placeGhost(
        ghostEl,
        a.x + (b.x - a.x) * k,
        a.y + (b.y - a.y) * k,
        fade,
        tapK,
      );
    }
    if (move.kind === "drag") {
      /* Take hold of the tray in the dark room and pull it across the
         seam into the middle of the kitchen's half. */
      activePair().group.getWorldPosition(gFrom);
      const a = onScreen(gFrom, true);
      const box = canvas.getBoundingClientRect();
      const b =
        L === WIDE
          ? { x: (darkRect.x + darkRect.w + box.width) / 2, y: a.y }
          : { x: a.x, y: (darkRect.y + darkRect.h + box.height) / 2 };
      const k = glide(Math.min(1, Math.max(0, (u - 0.2) / 0.6)));
      return placeGhost(
        ghostEl,
        a.x + (b.x - a.x) * k,
        a.y + (b.y - a.y) * k,
        fade,
        u > 0.12 && u < 0.85 ? 0.05 : 0,
      );
    }
    /* A sweep: two passes across the tray, the way the hand does it. */
    const [x, z] = zigzag(Math.min(1, Math.max(0, (u - 0.08) / 0.84)), 3, 0.2);
    const at = onScreen(gFrom.set(x + move.dx, move.y, z), false);
    placeGhost(ghostEl, at.x, at.y, fade);
  }

  /* ----------------------------------------------------------- anchors */
  const anchors = new Map<Anchor, HTMLElement>();
  const anchorPoint = new THREE.Vector3();
  /* The coco peat product's tag: over the bowl while the block waits dry,
     before the can is picked up and again once it is soaked — never over
     the pour, when the block's own label is in play. */
  /* The soak clock, over the solution while the tray is under. */
  function infoAnchor(name: "medium" | "timer" | "ad"): THREE.Vector3 | null {
    if (name === "medium") return mediumAnchor();
    if (name === "ad") return null;
    if (step !== "clean" || !dipRig.visible || phase !== "steep") return null;
    return anchorPoint.copy(v3(L.dip, 1.25));
  }
  function mediumAnchor(): THREE.Vector3 | null {
    if (step !== "soak" || !tub.visible) return null;
    if (phase !== "takeCan" && phase !== "done") return null;
    /* Over the bowl's back rim, the tag standing above it with its arrow
       pointing down at the block: the can's place beside the bowl is
       taken, so the tag reads from above, as every other label does. */
    tub.getWorldPosition(anchorPoint);
    anchorPoint.y += 0.6;
    anchorPoint.z -= BASIN_R * BOWL * 0.7;
    return anchorPoint;
  }
  function anchorFor(t: Target): THREE.Vector3 | null {
    if (t === "tray") {
      /* Over the back of the tray, wherever it is — on the bench, in the
         hand or in the solution. */
      activePair().group.getWorldPosition(anchorPoint);
      anchorPoint.y += 0.55;
      anchorPoint.z += -MED.hd + 0.1;
      return anchorPoint;
    }
    if (t === "basin") {
      anchorPoint.copy(v3(L.dip, DIP.h + 0.35));
      return anchorPoint;
    }
    const o = targetObject(t);
    if (!o || !o.visible) return null;
    o.getWorldPosition(anchorPoint);
    const lift: Partial<Record<string, number>> = {
      cloth: 0.3,
      can: 0.85,
      block: 0.8,
      lid: 0.5,
      lamp: 0.2,
      cutter: 0.25,
    };
    /* A tray pair's product card stands outside the tray, beside its
       outer end — left of the left pair, right of the right (the owner,
       2 Oct 2026: "keep it to left and right side of the tray"). A
       phone's pair is stacked with no room beside it, so there the back
       pair's card stands over its back edge and the front pair's hangs
       under its front edge. `anchorPlace` tells the label which. */
    if (t.startsWith("tray")) {
      const first = t === TRAY_FINISH_KEYS[0];
      if (L === TALL) {
        anchorPoint.y += 0.1;
        anchorPoint.z += first ? -TRAY_D / 2 - 0.05 : TRAY_D / 2 + 0.12;
      } else {
        anchorPoint.y += 0.1;
        anchorPoint.x += (first ? -1 : 1) * (TRAY_W / 2 + 0.25);
      }
      return anchorPoint;
    }
    /* Measured on the props as modelled; one drawn larger (the can, the
       bowl) carries its label up with it. */
    if (frontPacket(t)) {
      anchorPoint.z += PACKET.d;
      return anchorPoint;
    }
    anchorPoint.y += t.startsWith("packet")
      ? PACKET.h + 0.08
      : (lift[t] ?? 0.5) * o.scale.x;
    return anchorPoint;
  }
  const cutPoint = new THREE.Vector3();
  const cutHull: [number, number][] = [];
  /** Clip the wall frame (`el`'s box, whose top left is at `left, top` on
   *  the stage) around every tray and tool standing in front of it: each
   *  one's outline — the hull of its parts' boxes, as the camera sees
   *  them — is a hole in the frame, so it is seen in front. */
  function cutFrame(el: HTMLElement, left: number, top: number, box: DOMRect) {
    const frame = el.firstElementChild as HTMLElement | null;
    if (!frame) return;
    const w = frame.offsetWidth;
    const h = frame.offsetHeight;
    const holes: string[] = [];
    const seen = new Set<THREE.Object3D>();
    for (const t of TARGETS) {
      const o = targetObject(t);
      if (!o || !o.visible || seen.has(o)) continue;
      seen.add(o);
      const pts: [number, number][] = [];
      o.traverseVisible((m) => {
        const geo = (m as THREE.Mesh).geometry as
          THREE.BufferGeometry | undefined;
        if (!geo) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox!;
        for (let i = 0; i < 8; i++) {
          cutPoint
            .set(
              i & 1 ? b.max.x : b.min.x,
              i & 2 ? b.max.y : b.min.y,
              i & 4 ? b.max.z : b.min.z,
            )
            .applyMatrix4(m.matrixWorld)
            .project(camera);
          pts.push([
            ((cutPoint.x + 1) / 2) * box.width - left,
            ((1 - cutPoint.y) / 2) * box.height - top,
          ]);
        }
      });
      if (pts.length < 3) continue;
      /* Nothing of it over the frame (and its cord, above): no hole. */
      if (
        pts.every(([x]) => x < 0) ||
        pts.every(([x]) => x > w) ||
        pts.every(([, y]) => y > h) ||
        pts.every(([, y]) => y < -80)
      )
        continue;
      hull(pts);
      holes.push(
        "M" +
          cutHull.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") +
          "Z",
      );
    }
    frame.style.clipPath = holes.length
      ? /* Everything round the frame — its cord, nail and shadow — and
           then the holes, cut by the even-odd rule. */
        `path(evenodd, "M-400 -400H${w + 400}V${h + 400}H-400Z${holes.join("")}")`
      : "";
  }
  /** The convex hull of `pts`, into `cutHull` (monotone chain). */
  function hull(pts: [number, number][]) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (
      o: [number, number],
      a: [number, number],
      b: [number, number],
    ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    cutHull.length = 0;
    for (const p of pts) {
      while (
        cutHull.length >= 2 &&
        cross(cutHull[cutHull.length - 2], cutHull[cutHull.length - 1], p) <= 0
      )
        cutHull.pop();
      cutHull.push(p);
    }
    const lower = cutHull.length + 1;
    for (let i = pts.length - 2; i >= 0; i--) {
      const p = pts[i];
      while (
        cutHull.length >= lower &&
        cross(cutHull[cutHull.length - 2], cutHull[cutHull.length - 1], p) <= 0
      )
        cutHull.pop();
      cutHull.push(p);
    }
    cutHull.pop();
  }
  const rackPoint = new THREE.Vector3();
  /** The light step's arrow: a dotted curve from the front edge of our
   *  shelf on the rack (in from the leg, which the card can cover when
   *  the view closes in) to the rack's card, bottom left, ending in a head
   *  at the card's edge. Drawn only where the card stands clear of the
   *  rack, to its left. */
  function placeRackArrow(el: HTMLElement, box: DOMRect) {
    const card = document
      .querySelector('[data-garden-card="light"]')
      ?.getBoundingClientRect();
    const line = el.querySelector("[data-arrow-line]");
    const head = el.querySelector("[data-arrow-head]");
    if (step !== "light" || !card || !card.width || !line || !head) {
      el.dataset.show = "false";
      return;
    }
    const { w, d, shelves } = SHELF_RACK;
    rack.group.localToWorld(
      rackPoint.set(-w / 2 + 1.1, shelves[OUR_SHELF] + 0.05, d / 2),
    );
    rackPoint.project(camera);
    const sx = ((rackPoint.x + 1) / 2) * box.width;
    const sy = ((1 - rackPoint.y) / 2) * box.height;
    const ex = card.right - box.left + 10;
    const ey = card.top - box.top + card.height / 2;
    if (rackPoint.z > 1 || sx < ex + 40) {
      el.dataset.show = "false";
      return;
    }
    /* Out of the shelf level, then down and round into the card's side. */
    const c1x = sx - (sx - ex) * 0.15;
    const c1y = sy + (ey - sy) * 0.6;
    const c2x = ex + (sx - ex) * 0.55;
    const c2y = ey;
    line.setAttribute(
      "d",
      `M${sx.toFixed(1)} ${sy.toFixed(1)}C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
    );
    /* The head points along the curve's last stretch: leftward. */
    const ang = Math.atan2(ey - c2y, ex - c2x);
    const L = 9;
    const p = (a: number) =>
      `${(ex - L * Math.cos(ang + a)).toFixed(1)} ${(ey - L * Math.sin(ang + a)).toFixed(1)}`;
    head.setAttribute(
      "d",
      `M${p(0.5)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${p(-0.5)}`,
    );
    el.style.transform = "translate(0px, 0px)";
    el.dataset.place = "frame";
    el.dataset.show = "true";
  }
  /** The framed product on the wall: sized to the wall under the herb
   *  shelf as the camera sees it, and only while all of it is in view —
   *  the page shows its card instead otherwise (`onWall`). The rack hides
   *  that wall at the light step, and the dark step is elsewhere. */
  const adA = new THREE.Vector3();
  const adB = new THREE.Vector3();
  let wallInView: boolean | null = null;
  function placeWallAd(box: DOMRect) {
    const el = anchors.get("ad");
    let fits = false;
    if (step !== "light" && step !== "dark" && !splitOn()) {
      room.group.localToWorld(adA.set(WALL_AD.x0, WALL_AD.top, WALL_AD.z));
      room.group.localToWorld(adB.set(WALL_AD.x1, WALL_AD.bottom, WALL_AD.z));
      adA.project(camera);
      adB.project(camera);
      const x0 = ((adA.x + 1) / 2) * box.width;
      const x1 = ((adB.x + 1) / 2) * box.width;
      const y0 = ((1 - adA.y) / 2) * box.height;
      const y1 = ((1 - adB.y) / 2) * box.height;
      adB.set(WALL_AD.x0, WALL_AD.shelfBottom, WALL_AD.z);
      room.group.localToWorld(adB).project(camera);
      const shelfY = ((1 - adB.y) / 2) * box.height;
      /* The part of the shelf's wall on screen: a camera that cuts the
         shelf off still leaves the wall under the part it shows, and the
         frame hangs there, kept wholly on screen. */
      const W = box.width;
      const vx0 = Math.max(x0, 8);
      const vx1 = Math.min(x1, W - 8);
      fits = adA.z < 1 && vx1 - vx0 > 120 && y0 >= 8 && y0 < box.height * 0.6;
      /* The wall showing between the shelf and the frame, for the cord. */
      el?.style.setProperty(
        "--ad-gap",
        `${Math.max(0, Math.round(y0 - shelfY))}px`,
      );
      if (el && fits) {
        el.style.setProperty("--ad-w", `${Math.round(vx1 - vx0)}px`);
        /* The frame grows past this to hold its content (`WallFrame`). */
        el.style.setProperty("--ad-h", `${Math.max(0, Math.round(y1 - y0))}px`);
        const tw =
          (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
        const cx = THREE.MathUtils.clamp(
          (vx0 + vx1) / 2,
          tw / 2 + 8,
          Math.max(tw / 2 + 8, W - tw / 2 - 8),
        );
        el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(y0)}px)`;
        el.dataset.place = "frame";
        /* The frame is drawn over the scene, so a tray lifted in front
           of that wall would pass behind it. Instead the frame is cut
           where anything stands in front of it, so the tray covers it as
           it would a real frame on the wall (the owner, 3 Oct 2026). */
        cutFrame(el, cx - (vx1 - vx0) / 2, y0, box);
      }
    }
    if (el) el.dataset.show = fits ? "true" : "false";
    if (fits !== wallInView) {
      wallInView = fits;
      events.onWall(fits);
    }
  }
  /** Where a label sits against its point: standing on it (`above`, the
   *  rule), hung under it, or beside it to the left or right. */
  type Place = "above" | "below" | "left" | "right";
  /** On a phone the packets stand in two staggered rows; the front row's
   *  tags hang under their packets, so the two rows' tags never meet. */
  function frontPacket(name: Anchor) {
    if (L !== TALL || !name.startsWith("packet-")) return false;
    const [, z] = L.packets[name.slice(7) as Look];
    return z > Math.min(...Object.values(L.packets).map(([, pz]) => pz));
  }
  function anchorPlace(name: Anchor): Place {
    if (frontPacket(name)) return "below";
    if (name !== "tray-pair" && name !== "tray-pair-food-grade") return "above";
    const first = name === TRAY_FINISH_KEYS[0];
    if (L === TALL) return first ? "above" : "below";
    return first ? "left" : "right";
  }
  function placeAnchors() {
    const box = canvas.getBoundingClientRect();
    const live = held
      ? targetsFor(phase).filter((t) => t === "tray" || t === "basin")
      : targetsFor(phase);
    placeWallAd(box);
    /* The seed tags of one row, to be spread apart where they meet. */
    const rows: Record<
      string,
      { el: HTMLElement; x: number; y: number; tw: number }[]
    > = {};
    for (const [name, el] of anchors) {
      if (name === "ad") continue;
      if (name === "rackArrow") {
        placeRackArrow(el, box);
        continue;
      }
      const at =
        name === "medium" || name === "timer"
          ? infoAnchor(name)
          : live.includes(name) && !auto && !dragging
            ? anchorFor(name)
            : null;
      if (!at) {
        el.dataset.show = "false";
        continue;
      }
      /* In the dark step's split the tray is drawn in the dark room's
         view, so its label is placed in that view's rectangle. */
      const split = splitOn();
      at.project(split ? darkCam : camera);
      let rawX = split
        ? darkRect.x + ((at.x + 1) / 2) * darkRect.w
        : ((at.x + 1) / 2) * box.width;
      let rawY = split
        ? darkRect.y + ((1 - at.y) / 2) * darkRect.h
        : ((1 - at.y) / 2) * box.height;
      const tag = el.firstElementChild as HTMLElement | null;
      const tw = tag?.offsetWidth ?? 0;
      const th = tag?.offsetHeight ?? 0;
      const W = box.width;
      const H = box.height;
      const clamp = (v: number, lo: number, hi: number) =>
        THREE.MathUtils.clamp(v, lo, Math.max(lo, hi));
      let place = anchorPlace(name);
      /* A pair's card goes beside its tray only where it fits there with
         a clear gap; on a narrower stage it stands over the tray's back
         edge instead, still a row. */
      const GAP = 16;
      if (
        (place === "left" && rawX - GAP - tw < 8) ||
        (place === "right" && rawX + GAP + tw > box.width - 8)
      ) {
        place = "above";
        pairs[name as TrayFinish].group.getWorldPosition(anchorPoint);
        /* Over the rim, not on it. */
        anchorPoint.y += TRAY_H + 0.2;
        anchorPoint.z -= TRAY_D / 2 + 0.1;
        anchorPoint.project(camera);
        rawX = ((anchorPoint.x + 1) / 2) * box.width;
        rawY = ((1 - anchorPoint.y) / 2) * box.height;
      } else if (place === "left") rawX -= GAP;
      else if (place === "right") rawX += GAP;
      el.dataset.place = place;
      let x: number;
      let y: number;
      if (place === "left" || place === "right") {
        x =
          place === "left"
            ? clamp(rawX, tw + 8, W - 8)
            : clamp(rawX, 8, W - tw - 8);
        y = clamp(rawY, th / 2 + 8, H - th / 2 - 8);
      } else {
        /* The coco peat tag hangs to the right of its point on a wide
           screen, not centred on it. */
        const side = name === "medium" && L !== TALL;
        x = side
          ? Math.min(rawX, W - tw - 8)
          : clamp(rawX, tw / 2 + 8, W - tw / 2 - 8);
        y =
          place === "below"
            ? clamp(rawY, 8, H - th - 8)
            : clamp(rawY, th + 8, H - 8);
      }
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.dataset.show = at.z < 1 ? "true" : "false";
      if (name.startsWith("packet-") && at.z < 1)
        (rows[place] ??= []).push({ el, x, y, tw });
    }
    /* On a narrow stage two seed tags in a row can meet (fixed-size words
       over a scene that shrinks): push them apart, keeping the row's
       middle and the stage's edges. */
    for (const row of Object.values(rows)) {
      if (row.length < 2) continue;
      row.sort((a, b) => a.x - b.x);
      const GAP = 6;
      const W = box.width;
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 1; i < row.length; i++) {
          const a = row[i - 1];
          const b = row[i];
          const need = a.tw / 2 + b.tw / 2 + GAP - (b.x - a.x);
          if (need > 0) {
            a.x -= need / 2;
            b.x += need / 2;
          }
        }
        for (const t of row)
          t.x = THREE.MathUtils.clamp(t.x, t.tw / 2 + 8, W - t.tw / 2 - 8);
      }
      for (const t of row)
        t.el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px)`;
    }
  }

  /* ------------------------------------------------- the dark room split */
  /* While the dark days pass the screen is two places at once: the tray,
     close up and covered, alone in a dark room; and the kitchen, empty of
     it, turning through day and night. Side by side on a wide stage, one
     over the other on a tall one — the page lays its words out the same
     way (`DarkSplit`). */
  const darkCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const roomCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const size = new THREE.Vector2();
  const NIGHT_HEMI = new THREE.Color("#7f8fc4");
  const DAY_HEMI = new THREE.Color("#fff7ea");
  const splitOn = () =>
    step === "dark" &&
    (phase === "hold" ||
      phase === "toLight" ||
      phase === "done" ||
      flying ||
      leave > 0);
  /** The dark room's share of the stage's width (wide) or height (tall):
   *  all of it alone, half or `DARK_SHARE_TALL` once the kitchen has slid
   *  in, none once the tray has been carried into the light. */
  function darkShare() {
    const half = L === WIDE ? 0.5 : DARK_SHARE_TALL;
    return 1 - (1 - half) * ease(darkOpen) - half * ease(leave);
  }
  /** Where the dark room is drawn, in CSS pixels from the top left. */
  const darkRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Aim `cam` at `target` from `elevation` radians up, far enough back that
   *  a sphere of `radius` fits its view. */
  function aim(
    cam: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    radius: number,
    elev: number,
  ) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = radius / Math.min(tanV, tanV * cam.aspect);
    cam.position.set(
      target.x,
      target.y + Math.sin(elev) * dist,
      target.z + Math.cos(elev) * dist,
    );
    cam.lookAt(target);
    cam.updateProjectionMatrix();
  }
  const darkAt = new THREE.Vector3(0, 0.3, 0.15);
  const roomAt = new THREE.Vector3(0.5, 1.9, -3.4);
  function render() {
    renderer.getSize(size);
    const { x: w, y: h } = size;
    if (!splitOn()) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      if (fade > 0) {
        /* Into the dark: the kitchen dims as the camera reaches the door. */
        const keep = [hemi.intensity, sunLight.intensity];
        hemi.intensity *= 1 - fade;
        sunLight.intensity *= 1 - fade;
        scene.environmentIntensity = 1 - fade;
        renderer.render(scene, camera);
        [hemi.intensity, sunLight.intensity] = keep;
        scene.environmentIntensity = 1;
      } else renderer.render(scene, camera);
      return;
    }
    const wide = L === WIDE;
    /* Dark room left or on top, the kitchen right or below: the kitchen
       slides in as the screen opens, and takes all of it when the tray is
       carried into the light. */
    const share = darkShare();
    const pw = wide ? w * share : w;
    const ph = wide ? h : h * share;
    const kw = wide ? w - pw : w;
    const kh = wide ? h : h - ph;
    darkRect.x = 0;
    darkRect.y = 0;
    darkRect.w = pw;
    darkRect.h = ph;
    renderer.setScissorTest(true);
    const intensity = [hemi.intensity, sunLight.intensity];
    const room0 = room.group.visible;
    const rack0 = rack.group.visible;

    if (pw >= 1 && ph >= 1) {
      /* The dark room: the covered tray and nothing else, faintly lit. */
      room.group.visible = false;
      rack.group.visible = false;
      benchTop.visible = false;
      activePair().shadow.visible = false;
      hemi.color.copy(NIGHT_HEMI);
      /* Up out of the black the kitchen faded to at the door, here rather
         than in the page: the page hears of the cut a frame or two late,
         and the tray flashed up lit in between. */
      const lit = smooth(darkIntro, 0, 0.9);
      hemi.intensity = 0.55 * lit;
      sunLight.intensity = 0.25 * lit;
      scene.environmentIntensity = 0.18 * lit;
      renderer.setViewport(0, wide ? 0 : kh, pw, ph);
      renderer.setScissor(0, wide ? 0 : kh, pw, ph);
      renderer.setClearColor(0x050706, 1);
      renderer.clear();
      aimDark(pw, ph, wide);
      /* While it crosses, the tray is drawn once, over both halves. */
      const crossing = [activePair().group, lid, bed];
      const shown = crossing.map((o) => o.visible);
      if (dragging || flying) for (const o of crossing) o.visible = false;
      renderer.render(scene, darkCam);
      crossing.forEach((o, i) => (o.visible = shown[i]));
    }

    if (kw >= 1 && kh >= 1) {
      /* The kitchen, without the tray, at the hour the days have reached.
         It is drawn moved to the rack, camera and all — which looks the
         same — so that it is already where the light step has it when the
         tray is carried in (`shiftToRack`). */
      room.group.visible = room0;
      shiftToRack(true);
      benchTop.visible = true;
      rack.group.visible = true;
      /* Without the tray, until it has landed on its shelf. */
      const landed = leave >= 1 && !flying;
      const hidden = landed
        ? [lidShadow]
        : [activePair().group, activePair().shadow, lid, lidShadow, bed];
      const was = hidden.map((o) => o.visible);
      for (const o of hidden) o.visible = false;
      /* Past the last night, morning comes up toward noon. */
      /* One sunrise-to-sunrise cycle stands for all the days. */
      const f = val.days < DARK_DAYS ? val.days / DARK_DAYS : morning;
      const day = room.dayAt(f);
      room.daylight(f);
      hemi.color.copy(NIGHT_HEMI).lerp(DAY_HEMI, day);
      hemi.intensity = 0.35 + 1.25 * day;
      sunLight.intensity = 0.05 + 1.55 * day;
      scene.environmentIntensity = 0.2 + 0.8 * day;
      renderer.setViewport(wide ? pw : 0, 0, kw, kh);
      renderer.setScissor(wide ? pw : 0, 0, kw, kh);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      aimRoom(w, h, kw, kh, wide);
      renderer.render(scene, roomCam);
      hidden.forEach((o, i) => (o.visible = was[i]));
      shiftToRack(step === "light");
    }

    if (dragging || flying) drawCrossing(w, h, wide, pw, ph, kw, kh);

    room.group.visible = room0;
    rack.group.visible = rack0;
    benchTop.visible = true;
    activePair().shadow.visible = true;
    hemi.color.copy(DAY_HEMI);
    [hemi.intensity, sunLight.intensity] = intensity;
    scene.environmentIntensity = 1;
    renderer.setScissorTest(false);
  }
  /* ---- the tray crossing from the dark into the light ---- */
  const TRAY_LAYER = 1;
  /** Everything that is the tray, and the lights, on a layer of its own,
   *  so it can be drawn by itself over both halves. */
  function trayOnLayer() {
    for (const o of [activePair().group, lid, bed])
      o.traverse((c) => c.layers.enable(TRAY_LAYER));
    hemi.layers.enable(TRAY_LAYER);
    sunLight.layers.enable(TRAY_LAYER);
  }
  const shelfAt = new THREE.Vector3();
  const flyTo = new THREE.Vector3();
  const flyEdge = new THREE.Vector3();
  const flyPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** The tray drawn over the whole stage with the dark room's camera, its
   *  view stretched past the dark room's edge, so dragging it carries it
   *  visibly over the seam; dropped, it flies to its shelf in the kitchen's
   *  view and shrinks to the size it is drawn there. */
  function drawCrossing(
    w: number,
    h: number,
    wide: boolean,
    pw: number,
    ph: number,
    kw: number,
    kh: number,
  ) {
    const vw = dragView.w;
    const vh = dragView.h;
    darkCam.aspect = vw / vh;
    aim(darkCam, darkAt, wide ? 2.6 : 2.8, wide ? 0.78 : 0.9);
    darkCam.setViewOffset(vw, vh, 0, wide ? -vh * 0.08 : 0, w, h);
    darkCam.updateProjectionMatrix();
    darkCam.updateMatrixWorld();
    if (flying && kw >= 1 && kh >= 1) {
      /* Where its shelf is on screen, and how wide the tray is drawn
         there, from the kitchen's camera as it stands this frame. */
      const kx = wide ? pw : 0;
      const ky = wide ? 0 : ph;
      const toScreen = (v: THREE.Vector3) => {
        v.project(roomCam);
        return [kx + ((v.x + 1) / 2) * kw, ky + ((1 - v.y) / 2) * kh];
      };
      const [sx, sy] = toScreen(shelfAt.set(0, 0, 0));
      const [ex] = toScreen(shelfAt.set(TRAY_W / 2, 0, 0));
      const wantW = Math.abs(ex - sx) * 2;
      ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
      ray.setFromCamera(ndc, darkCam);
      if (ray.ray.intersectPlane(flyPlane, flyTo)) {
        flyEdge.copy(flyTo);
        flyEdge.x += TRAY_W / 2;
        const a = flyTo.clone().project(darkCam);
        const b = flyEdge.project(darkCam);
        const haveW = Math.abs(b.x - a.x) * w;
        const e = ease(clamp01(flight / 0.85));
        carry.lerpVectors(released, flyTo, e);
        carry.y += Math.sin(e * Math.PI) * 0.6;
        carryScale = THREE.MathUtils.lerp(1, wantW / Math.max(haveW, 1), e);
        placeCarried();
      }
    }
    /* Lit from the dark to the day as it crosses the seam. */
    const c = carry.clone().project(darkCam);
    const along = wide ? ((c.x + 1) / 2) * w - pw : ((1 - c.y) / 2) * h - ph;
    const light = flying ? 1 : smooth(along, -60, 160);
    hemi.color.copy(NIGHT_HEMI).lerp(DAY_HEMI, light);
    hemi.intensity = THREE.MathUtils.lerp(0.55, 1.5, light);
    sunLight.intensity = THREE.MathUtils.lerp(0.25, 1.4, light);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.18, 1, light);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    darkCam.layers.set(TRAY_LAYER);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, darkCam);
    renderer.autoClear = true;
    darkCam.layers.set(0);
    /* Back to the dark room's own view: the pointer is read through it. */
    aimDark(vw, vh, wide);
    darkCam.updateMatrixWorld();
  }
  /** The dark room's camera, for a view `pw` × `ph`. */
  function aimDark(pw: number, ph: number, wide: boolean) {
    darkCam.aspect = pw / ph;
    /* Clear of the page's words: the stages are over the tray and the
       step card under it (the owner, 3 Oct 2026), so on a wide stage it
       sits a little low, in the room the stages leave. */
    darkCam.setViewOffset(pw, ph, 0, wide ? -ph * 0.08 : 0, pw, ph);
    aim(darkCam, darkAt, wide ? 2.6 : 2.8, wide ? 0.78 : 0.9);
  }
  /** The kitchen's camera. While the screen opens it is framed at its
   *  final size and uncovered, so it slides in rather than zooming; once
   *  the tray is carried into it, it is framed to the whole of its growing
   *  panel. */
  const roomLow = new THREE.Vector3();
  const rackMid = new THREE.Vector3(0, SHELF_RACK.h / 2 - RACK_DROP, 0);
  function aimRoom(
    w: number,
    h: number,
    kw: number,
    kh: number,
    wide: boolean,
  ) {
    /* The window, or — once the days are done — the whole lit rack, the
       way the light step opens on it. */
    const r = ease(rackAim);
    roomLow.set(
      roomAt.x - RACK_AT.x,
      roomAt.y - RACK_DROP,
      roomAt.z - RACK_AT.z,
    );
    roomLow.lerp(rackMid, r);
    const radius = THREE.MathUtils.lerp(3.3, SHELF_RACK.h / 2 + 0.5, r);
    const elev = THREE.MathUtils.lerp(0.12, 0.06, r);
    if (leave > 0) {
      roomCam.clearViewOffset();
      roomCam.aspect = kw / kh;
      aim(roomCam, roomLow, radius, elev);
      return;
    }
    const fw = wide ? w / 2 : w;
    const fh = wide ? h : h * (1 - DARK_SHARE_TALL);
    roomCam.aspect = fw / fh;
    roomCam.setViewOffset(fw, fh, 0, 0, kw, kh);
    aim(roomCam, roomLow, radius, elev);
  }

  /* -------------------------------------------------------------- loop */
  let raf = 0;
  let visible = true;
  let last = 0;
  let first = true;
  function frame(ms: number) {
    raf = 0;
    const now = ms / 1000;
    const dt = last ? Math.min(now - last, 0.05) : 1 / 60;
    last = now;
    shared.time.value += dt;
    room.update(shared.time.value);
    update(dt);
    render();
    placeAnchors();
    driveGhost(dt);
    if (first) {
      first = false;
      events.onFirstFrame();
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
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
    schedule();
  });
  watcher.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);

  setStep("pick");
  started = true;
  schedule();

  return {
    setStep,
    setFinish(f) {
      if (f === finish) return;
      finish = f;
      if (step !== "pick") setStep(step);
    },
    setLook(l) {
      if (l === look) return;
      look = l;
      buildCrop(l);
      (
        seedsFall.points.material as THREE.ShaderMaterial
      ).uniforms.uColor.value.set(LOOKS[l].seed);
      if (step !== "sow") setStep(step);
    },
    select,
    hold(on) {
      holding = on && phase === "pour";
    },
    days: () => (step === "dark" ? val.days : 0),
    split: () => (splitOn() ? darkShare() : 1),
    autoplay,
    bindAnchor(name, el) {
      if (el) anchors.set(name, el);
      else anchors.delete(name);
    },
    bindGhost(el) {
      ghostEl = el;
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      watcher.disconnect();
      resizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
      bin.dispose();
      renderer.dispose();
    },
  };
}

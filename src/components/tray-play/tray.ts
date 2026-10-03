import * as THREE from "three";
import type { TrayFinish } from "./kinds";

export type { TrayFinish } from "./kinds";

/**
 * The trays — built like the pairs we sell (`content/trays/tray-pair*.json`):
 * moulded plastic, flared walls, a rolled lip, the grow tray nested in a
 * solid one that holds the water. Shared by the home page's row of three and
 * the play garden's one, so the tray a visitor picks on `/garden` is the one
 * they saw on the home page.
 *
 * Kept at the size and depth the home scene was composed at. The real tray
 * is 2:1 and 3 cm deep; drawn that way the greens shrank and the row lost its
 * framing (tried and reverted, 1 Oct 2026 — the owner preferred this).
 * Portrait: x is across, z is front to back.
 */
export const TRAY_W = 2.0;
export const TRAY_D = 2.6;
export const TRAY_H = 0.3;
/** The water tray is this much larger all round, so its rim shows outside
 *  the grow tray's. */
export const WATER_MARGIN = 0.035;
/** The grow tray sits this far up inside the water tray. */
export const TRAY_RAISE = 0.045;
/* The moulding, in world units: walls lean out by FLARE over their height,
   the rolled lip stands LIP proud of the wall, the plastic is SKIN thick. */
const FLARE = 0.04;
const LIP = 0.035;
const SKIN = 0.012;
export const CORNER = 0.09;
/** Coco peat sits a little under the rim — the height the greens were
 *  composed at. */
export const MEDIUM_Y = TRAY_RAISE + TRAY_H - 0.08;
/** Darker than first drawn (the owner, 3 Oct 2026: "can we make soil
 *  darker"), so the stems read pale against it. */
export const MEDIUM_COLOR = "#21160f";

/**
 * The two pairs we sell, by content key. Black is the recycled pair; the
 * food-grade one is a white grow tray (the one with drain holes, that holds
 * the coco peat) in a green water tray — the colours printed in its own spec
 * row ("one with drain holes in white, one solid in green"). A tray key with no finish here has no model and is not offered
 * in the garden.
 */
export const TRAY_FINISHES: Record<
  TrayFinish,
  { grow: string; water: string; floor: string }
> = {
  "tray-pair": { grow: "#0d0d0c", water: "#0d0d0c", floor: "#121211" },
  "tray-pair-food-grade": {
    grow: "#e9ebe6",
    water: "#2f7d3b",
    floor: "#2a6f35",
  },
};

/** A rounded rectangle, centred and lying flat, for floors and the coco peat. */
export function roundedRect(hw: number, hd: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Inner face of the wall at height `y`, as an offset from the base outline. */
export function innerWallAt(y: number, height: number) {
  return (
    -SKIN +
    FLARE * 0.97 * THREE.MathUtils.clamp((y - 0.01) / (height - 0.016), 0, 1)
  );
}

/** Half-extents of the grow tray's inside at the height of the coco peat —
 *  where the peat meets the wall, a hair wider so no seam shows. */
export function mediumHalf() {
  const wallAt = innerWallAt(MEDIUM_Y - TRAY_RAISE, TRAY_H) + 0.004;
  return {
    hw: TRAY_W / 2 - FLARE - LIP + wallAt,
    hd: TRAY_D / 2 - FLARE - LIP + wallAt,
    corner: CORNER + wallAt,
  };
}

/** Half-extents of the grow tray's floor. */
export function floorHalf() {
  return { hw: TRAY_W / 2 - FLARE - LIP, hd: TRAY_D / 2 - FLARE - LIP };
}

/**
 * One moulded tray: a cross-section — inner wall, rolled lip, outer wall —
 * swept round a rounded rectangle. That one profile is everything that makes
 * it read as a plastic tray rather than five boxes: walls that lean out, a
 * lip with a round edge that catches a highlight, corners with a radius.
 * `outerW` and `outerD` are rim to rim.
 */
export function trayGeometry(outerW: number, outerD: number, height: number) {
  const hw = outerW / 2 - FLARE - LIP;
  const hd = outerD / 2 - FLARE - LIP;
  const cx = hw - CORNER;
  const cz = hd - CORNER;

  /* (offset from the base outline, height), inside → over the lip → down
     the outside. */
  const profile: [number, number][] = [
    [innerWallAt(0.01, height), 0.01],
    [innerWallAt(height - 0.006, height), height - 0.006],
    [FLARE - SKIN * 0.4, height + 0.002],
    [FLARE + LIP * 0.45, height + 0.004],
    [FLARE + LIP * 0.9, height + 0.001],
    [FLARE + LIP, height - 0.008],
    [FLARE + LIP * 0.9, height - 0.016],
    [FLARE + LIP * 0.35, height - 0.019],
    [FLARE * 0.97 + 0.003, height - 0.02],
    [0.003, 0.008],
    [-0.002, 0],
  ];

  const SEG = 6;
  const corners: [number, number, number][] = [
    [cx, cz, 0],
    [-cx, cz, Math.PI / 2],
    [-cx, -cz, Math.PI],
    [cx, -cz, (3 * Math.PI) / 2],
  ];
  const ring: { x: number; z: number; dx: number; dz: number }[] = [];
  for (const [ox, oz, a0] of corners) {
    for (let k = 0; k <= SEG; k++) {
      const a = a0 + (k / SEG) * (Math.PI / 2);
      ring.push({ x: ox, z: oz, dx: Math.cos(a), dz: Math.sin(a) });
    }
  }

  const pos: number[] = [];
  for (const r of ring) {
    for (const [o, y] of profile) {
      pos.push(r.x + r.dx * (CORNER + o), y, r.z + r.dz * (CORNER + o));
    }
  }
  const P = profile.length;
  const idx: number[] = [];
  for (let m = 0; m < ring.length; m++) {
    const m2 = (m + 1) % ring.length;
    for (let k = 0; k < P - 1; k++) {
      const a = m * P + k;
      const b = m2 * P + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  /* The outermost point of the lip must face outward; if the winding above
     made it face in, flip every triangle. */
  const n = g.getAttribute("normal");
  const lip = 5;
  if (n.getX(lip) * ring[0].dx + n.getZ(lip) * ring[0].dz < 0) {
    const flipped: number[] = [];
    for (let k = 0; k < idx.length; k += 3)
      flipped.push(idx[k], idx[k + 2], idx[k + 1]);
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}

export type TrayMaterials = {
  grow: THREE.Material;
  water: THREE.Material;
  /** The water tray's floor, seen through the grow tray's drain holes and
   *  round its edge. */
  floor: THREE.Material;
  /** The grow tray's own floor — only needed when it is empty (the garden),
   *  since the home page's trays are always full of peat. */
  growFloor?: THREE.Material;
};

/** Satin moulded polypropylene in a finish's colours, lit by the scene's
 *  environment. Dispose of every material returned. */
/** The grow tray's floor as a tile one world unit square, repeated by the
 *  floor's own UVs (a `ShapeGeometry` maps them to world units): the
 *  diamond grid of ribs a real grow tray is moulded with, and a drainage
 *  hole in every diamond. Two canvases — the colour, and a bump map that
 *  raises the ribs and sinks the holes — so the pattern catches the light
 *  rather than being painted flat. `hole` is what shows through one. */
function growFloorTextures(base: string, hole: string) {
  const N = 256;
  const S = N / 6; // a rib every sixth of a unit, close to the moulded trays
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    return [c, c.getContext("2d")!] as const;
  };
  const ribs = (g: CanvasRenderingContext2D, width: number) => {
    g.lineWidth = width;
    g.beginPath();
    for (let k = -6; k <= 12; k++) {
      g.moveTo(k * S, 0);
      g.lineTo(k * S + N, N);
      g.moveTo(k * S, 0);
      g.lineTo(k * S - N, N);
    }
    g.stroke();
  };
  const holes = (g: CanvasRenderingContext2D, r: number) => {
    g.beginPath();
    /* The diamonds' centres fall at (i + ½, j) and (i, j + ½) cells. */
    for (let i = -1; i <= 6; i++) {
      for (let j = -1; j <= 6; j++) {
        for (const [x, y] of [
          [(i + 0.5) * S, j * S],
          [i * S, (j + 0.5) * S],
        ]) {
          g.moveTo(x + r, y);
          g.arc(x, y, r, 0, Math.PI * 2);
        }
      }
    }
    g.fill();
  };

  const [colour, cg] = make();
  cg.fillStyle = base;
  cg.fillRect(0, 0, N, N);
  cg.strokeStyle = "rgba(255,255,255,0.09)";
  ribs(cg, 2.2);
  cg.fillStyle = hole;
  holes(cg, 2.6);

  const [bump, bg] = make();
  bg.fillStyle = "#808080";
  bg.fillRect(0, 0, N, N);
  bg.strokeStyle = "#ffffff";
  ribs(bg, 2.6);
  bg.fillStyle = "#000000";
  holes(bg, 2.6);

  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(colour, true), bumpMap: tex(bump, false) };
}

export function trayMaterials(
  finish: TrayFinish,
  withGrowFloor = false,
): TrayMaterials {
  const f = TRAY_FINISHES[finish];
  const light = finish === "tray-pair-food-grade";
  const grow = new THREE.MeshStandardMaterial({
    color: f.grow,
    roughness: 0.4,
    envMapIntensity: 0.4,
  });
  const water =
    f.water === f.grow
      ? grow
      : new THREE.MeshStandardMaterial({
          color: f.water,
          roughness: 0.45,
          envMapIntensity: light ? 0.25 : 0.4,
        });
  const floor = new THREE.MeshStandardMaterial({
    color: f.floor,
    roughness: 0.9,
    envMapIntensity: 0.2,
  });
  return {
    grow,
    water,
    floor,
    growFloor: withGrowFloor
      ? new THREE.MeshStandardMaterial({
          ...growFloorTextures(f.grow, light ? "#16331b" : "#8f918c"),
          bumpScale: 1.4,
          roughness: 0.55,
          envMapIntensity: 0.3,
        })
      : undefined,
  };
}

export function disposeTrayMaterials(m: TrayMaterials) {
  if (m.growFloor instanceof THREE.MeshStandardMaterial) {
    m.growFloor.map?.dispose();
    m.growFloor.bumpMap?.dispose();
  }
  new Set([m.grow, m.water, m.floor, m.growFloor].filter(Boolean)).forEach(
    (x) => x!.dispose(),
  );
}

/** The nested pair at `x`: the water tray on the surface, the grow tray
 *  raised inside it, each with a floor so nothing shows through. The grow
 *  tray is the group's child named `grow`, for a scene that moves it; the
 *  water tray is `water` and `waterFloor`, for one that takes it away. */
export function trayPair(x: number, m: TrayMaterials) {
  const group = new THREE.Group();
  const water = trayGeometry(
    TRAY_W + 2 * WATER_MARGIN,
    TRAY_D + 2 * WATER_MARGIN,
    TRAY_H,
  );
  const waterTray = new THREE.Mesh(water, m.water);
  waterTray.name = "water";
  group.add(waterTray);
  const waterFloor = roundedRect(
    TRAY_W / 2 + WATER_MARGIN - FLARE - LIP,
    TRAY_D / 2 + WATER_MARGIN - FLARE - LIP,
    CORNER,
  );
  waterFloor.translate(0, 0.012, 0);
  const waterTrayFloor = new THREE.Mesh(waterFloor, m.floor);
  waterTrayFloor.name = "waterFloor";
  group.add(waterTrayFloor);

  const grow = new THREE.Group();
  grow.name = "grow";
  grow.position.y = TRAY_RAISE;
  grow.add(new THREE.Mesh(trayGeometry(TRAY_W, TRAY_D, TRAY_H), m.grow));
  if (m.growFloor) {
    const { hw, hd } = floorHalf();
    const growFloor = roundedRect(hw, hd, CORNER);
    growFloor.translate(0, 0.013, 0);
    grow.add(new THREE.Mesh(growFloor, m.growFloor));
  }
  group.add(grow);

  group.position.x = x;
  return group;
}

/** A soft dark rounded rectangle, for the shadow each tray throws on the
 *  surface under it — a texture rather than a shadow map, which would cost a
 *  second pass over every stem for a shape that never changes. */
export function contactShadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.filter = "blur(18px)";
  g.fillStyle = "rgba(60, 40, 20, 0.55)";
  g.beginPath();
  g.roundRect(40, 40, 176, 240, 18);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Coco peat: dark, fibrous, flecked. Painted once, on a canvas. `wet` is
 *  peat that has been soaked — darker and richer than a dry block. */
export function mediumTexture(rand: () => number, base = MEDIUM_COLOR) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < 2200; k++) {
    const shade = rand() < 0.5 ? "rgba(8,4,2,0.6)" : "rgba(80,56,40,0.28)";
    g.strokeStyle = shade;
    g.lineWidth = 0.6 + rand() * 1.4;
    const x = rand() * c.width;
    const y = rand() * c.height;
    const a = rand() * Math.PI;
    const len = 2 + rand() * 7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

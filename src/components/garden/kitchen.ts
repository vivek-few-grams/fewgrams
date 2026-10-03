import * as THREE from "three";
import type { Bin } from "./props";

/**
 * The room behind the bench (the owner, 2 Oct 2026: "the table looks
 * boring"): a kitchen wall with a window onto sky, hills and a swaying
 * branch, a bird that crosses now and then, a shelf of herbs, a framed
 * print and a couple of pots at the ends of the counter. The bench's back
 * edge is the wall's foot, at `WALL_Z`.
 *
 * Like the props, it is all primitives and painted canvases — nothing to
 * fetch. The window is a hole in the wall with the outside built behind
 * it, so the bird and the branch are hidden by the wall wherever they pass
 * it, with no clipping to arrange.
 *
 * Left along the wall is a door into the dark room the dark step carries
 * its tray to; `door(k)` swings it, 0 shut to 1 open.
 *
 * `update(time)` moves the branch and the bird; everything else is still.
 * `daylight(f)` turns the room through a day for the dark step — `f` 0 is
 * sunrise, 0.5 sunset: the sky darkens, the sun and then the moon cross the
 * window and the lamp on the counter comes on at night; `null` puts the
 * usual bright morning back.
 */
export const WALL_Z = -3.4;
const WIN = { x0: -2.3, x1: 3.3, y0: 0.42, y1: 3.9 };
/** The doorway into the dark room, left along the same wall, wide enough to
 *  carry a covered tray through. */
export const DOOR = { x0: -10.4, x1: -7.6, h: 5.25 };
/** The herb shelf, right of the window, on the wall, and the frame hung
 *  under it. The shelf is wide, so the frame is big enough to read (the
 *  owner, 3 Oct 2026); the frame is only as tall as what it holds plus a
 *  slim margin, and the shelf sits just above it, so the herbs' tops still
 *  show. Its left end stays clear of the curtain. */
const SHELF_W = 4;
/** The frame's height for its width: the photograph and a slim margin
 *  above and below it (`WallFrame`). */
const AD_ASPECT = 0.43;
/** The frame's foot, just above the strip of white tiles (0.4 high) — it
 *  keeps to the green wall (the owner, 2 Oct 2026). */
const AD_BOTTOM = 0.52;
/** From the shelf's top down to the frame's: the board and the cord. */
const AD_DROP = 0.3;
const SHELF = {
  x: WIN.x1 + 1 + SHELF_W / 2,
  y: AD_BOTTOM + SHELF_W * AD_ASPECT + AD_DROP,
};
/** Where the product of the moment hangs, framed, on the wall under the
 *  herb shelf (the owner, 2 Oct 2026: "keep width of the frame same as
 *  width of the upper shelf… it should not overlap on anything else"): as
 *  wide as the shelf, from a cord's drop below it down to the tiles,
 *  in the room's own space. The frame is exactly this, never larger. */
export const WALL_AD = {
  x0: SHELF.x - SHELF_W / 2,
  x1: SHELF.x + SHELF_W / 2,
  top: SHELF.y - AD_DROP,
  /** The shelf board's underside: the nail goes in the wall between it
   *  and the frame's top. */
  shelfBottom: SHELF.y - 0.045,
  bottom: AD_BOTTOM,
  z: WALL_Z + 0.02,
};
/** The dark room behind it: a real room, not a box — floor to ceiling,
 *  wider than its door, with a fan turning in an air vent. It stops short
 *  of the hills built outside the window, which would otherwise show
 *  through its floor. */
const DARK = { x0: -13.6, x1: -5.0, depth: 3.2, h: 6 };
/** The room's left corner (the owner, 2 Oct 2026): a side wall here, just
 *  past the rack that stands between it and the dark room's door, so there
 *  is no bare wall beyond. */
export const CORNER_X = -16.6;
/** Where a tray stands in the dark room, on its floor. */
export const DARK_SPOT = new THREE.Vector3(
  (DOOR.x0 + DOOR.x1) / 2,
  0,
  WALL_Z - 1.6,
);

function paint(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  transparent = false,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (!transparent) g.clearRect(0, 0, w, h);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function kitchen(
  bin: Bin,
  rand: () => number,
  doorLabel: string,
  font: string,
) {
  const g = new THREE.Group();
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    bin.add(new THREE.MeshStandardMaterial(o));

  /* ---- the wall, with the window and the doorway cut out ---- */
  const shape = new THREE.Shape();
  shape.moveTo(CORNER_X, 0);
  shape.lineTo(DOOR.x0, 0);
  shape.lineTo(DOOR.x0, DOOR.h);
  shape.lineTo(DOOR.x1, DOOR.h);
  shape.lineTo(DOOR.x1, 0);
  shape.lineTo(36, 0);
  shape.lineTo(36, 26);
  shape.lineTo(CORNER_X, 26);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(WIN.x0, WIN.y0);
  hole.lineTo(WIN.x1, WIN.y0);
  hole.lineTo(WIN.x1, WIN.y1);
  hole.lineTo(WIN.x0, WIN.y1);
  hole.closePath();
  shape.holes.push(hole);
  const wallGeo = bin.add(new THREE.ShapeGeometry(shape));
  /* Lambert, not standard: a flat matte plaster that keeps its colour
     rather than picking up the room's reflections. */
  const wall = new THREE.Mesh(
    wallGeo,
    bin.add(new THREE.MeshLambertMaterial({ color: "#7f8a6c" })),
  );
  wall.position.z = WALL_Z;
  g.add(wall);

  /* The side wall at the corner, running forward from the back wall past
     wherever a camera stands, so nothing beyond the corner shows. */
  const side = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(80, 26)),
    bin.add(new THREE.MeshLambertMaterial({ color: "#76825f" })),
  );
  side.rotation.y = Math.PI / 2;
  side.position.set(CORNER_X, 13, WALL_Z + 40);
  g.add(side);

  /* A strip of white tiles where the wall meets the counter. */
  const tiles = bin.add(
    paint(512, 64, (c) => {
      c.fillStyle = "#f6f3ec";
      c.fillRect(0, 0, 512, 64);
      c.strokeStyle = "rgba(150,140,125,0.45)";
      c.lineWidth = 2;
      for (let x = 0; x <= 512; x += 32) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 64);
        c.stroke();
      }
      for (const y of [1, 32, 63]) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(512, y);
        c.stroke();
      }
    }),
  );
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.repeat.set(12, 1);
  for (const [x0, x1] of [
    [CORNER_X, DOOR.x0],
    [DOOR.x1, WIN.x0],
    [WIN.x1, 36],
  ]) {
    const t = tiles.clone();
    bin.add(t);
    t.repeat.set((x1 - x0) / 2.4, 1);
    const strip = new THREE.Mesh(
      bin.add(new THREE.PlaneGeometry(x1 - x0, 0.4)),
      std({ map: t, roughness: 0.3, envMapIntensity: 0.6 }),
    );
    strip.position.set((x0 + x1) / 2, 0.2, WALL_Z + 0.005);
    g.add(strip);
  }

  /* ---- the window ---- */
  const frameMat = std({
    color: "#f8f5ee",
    roughness: 0.5,
    envMapIntensity: 0.4,
  });
  const W = WIN.x1 - WIN.x0;
  const H = WIN.y1 - WIN.y0;
  const cx = (WIN.x0 + WIN.x1) / 2;
  const cy = (WIN.y0 + WIN.y1) / 2;
  const bar = (w: number, h: number, x: number, y: number, d = 0.16) => {
    const m = new THREE.Mesh(bin.add(new THREE.BoxGeometry(w, h, d)), frameMat);
    m.position.set(x, y, WALL_Z - 0.04);
    g.add(m);
  };
  bar(W + 0.3, 0.15, cx, WIN.y1 + 0.075);
  bar(0.15, H, WIN.x0 - 0.075, cy);
  bar(0.15, H, WIN.x1 + 0.075, cy);
  bar(0.07, H, cx, cy, 0.08);
  bar(W, 0.07, cx, WIN.y0 + H * 0.62, 0.08);
  /* The sill, standing proud of the wall over the counter. */
  const sill = new THREE.Mesh(
    bin.add(new THREE.BoxGeometry(W + 0.6, 0.1, 0.42)),
    frameMat,
  );
  sill.position.set(cx, WIN.y0 - 0.05, WALL_Z + 0.12);
  g.add(sill);
  /* Faint glass, catching the room's light. */
  const glass = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(W, H)),
    std({
      color: "#ffffff",
      roughness: 0.05,
      envMapIntensity: 0.8,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  );
  glass.position.set(cx, cy, WALL_Z - 0.06);
  g.add(glass);

  /* ---- outside: crisp shapes, not a painted picture, so it stays sharp
     at any size, with things that move: clouds drift, trees sway, birds
     cross, the curtains stir. ---- */
  /* Everything outside is unlit, so night is a tint on each material,
     from its own colour (kept here) toward a dark blue. */
  const outside: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  const basic = (
    color: string,
    extra: THREE.MeshBasicMaterialParameters = {},
  ) => {
    const mat = bin.add(new THREE.MeshBasicMaterial({ color, ...extra }));
    outside.push({ mat, base: mat.color.clone() });
    return mat;
  };
  const OUT = WALL_Z - 1;

  const skyGeo = bin.add(new THREE.PlaneGeometry(30, 14, 1, 10));
  {
    const pos = skyGeo.getAttribute("position");
    const cols: number[] = [];
    const top = new THREE.Color("#7db4e3");
    const low = new THREE.Color("#e6f2f5");
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getY(k) + 7) / 14;
      const c = low.clone().lerp(top, Math.pow(t, 0.8));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  }
  const sky = new THREE.Mesh(skyGeo, basic("#ffffff", { vertexColors: true }));
  sky.position.set(cx, 4, OUT - 5);
  g.add(sky);

  const sunGlow = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(1.0, 40)),
    basic("#fff4c8", { transparent: true, opacity: 0.35 }),
  );
  sunGlow.position.set(cx + 1.7, 3.9, OUT - 4.9);
  const sunDisc = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(0.42, 40)),
    basic("#fff8e2"),
  );
  sunDisc.position.set(cx + 1.7, 3.9, OUT - 4.88);
  g.add(sunGlow, sunDisc);
  const SUN_AT = sunDisc.position.clone();

  /* The moon and the stars, for the dark step's nights only. */
  const moon = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(0.36, 40)),
    bin.add(new THREE.MeshBasicMaterial({ color: "#f4f0dc" })),
  );
  moon.visible = false;
  g.add(moon);
  const starGeo = bin.add(new THREE.BufferGeometry());
  {
    const pts: number[] = [];
    for (let k = 0; k < 90; k++) {
      pts.push(cx + (rand() - 0.5) * 16, 1.2 + rand() * 6.5, OUT - 4.95);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  }
  const starMat = bin.add(
    new THREE.PointsMaterial({
      color: "#fffbe8",
      size: 0.06,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const stars = new THREE.Points(starGeo, starMat);
  stars.visible = false;
  g.add(stars);

  const puff = bin.add(new THREE.CircleGeometry(1, 28));
  const cloudMat = basic("#ffffff", { transparent: true, opacity: 0.95 });
  const clouds = [
    [cx - 3, 3.5, 0.55, 0.12],
    [cx + 0.5, 4.3, 0.4, 0.08],
    [cx + 4, 3.1, 0.48, 0.1],
    [cx - 7, 4.0, 0.35, 0.07],
  ].map(([x, y, sc, speed]) => {
    const c = new THREE.Group();
    for (const [dx, dy, r] of [
      [-0.9, 0, 0.5],
      [-0.35, 0.25, 0.7],
      [0.35, 0.15, 0.6],
      [0.9, -0.02, 0.45],
      [0, -0.12, 0.55],
    ]) {
      const m = new THREE.Mesh(puff, cloudMat);
      m.position.set(dx, dy, 0);
      m.scale.set(r, r * 0.8, 1);
      c.add(m);
    }
    c.scale.setScalar(sc);
    c.position.set(x, y, OUT - 4.6);
    g.add(c);
    return { c, speed };
  });

  const hill = (
    base: number,
    amps: [number, number, number][],
    color: string,
    z: number,
  ) => {
    const sh = new THREE.Shape();
    sh.moveTo(-15, -2);
    for (let x = -15; x <= 15; x += 0.25) {
      let y = base;
      for (const [a, f, ph] of amps) y += a * Math.sin(x * f + ph);
      sh.lineTo(x, y);
    }
    sh.lineTo(15, -2);
    sh.closePath();
    const m = new THREE.Mesh(
      bin.add(new THREE.ShapeGeometry(sh, 2)),
      basic(color),
    );
    m.position.set(cx, 0, z);
    g.add(m);
  };
  hill(
    0.85,
    [
      [0.45, 0.35, 0.4],
      [0.15, 1.1, 1.2],
    ],
    "#b5d3a2",
    OUT - 4.2,
  );
  hill(
    0.45,
    [
      [0.35, 0.5, 2.1],
      [0.12, 1.4, 0.3],
    ],
    "#93c07b",
    OUT - 3.6,
  );
  hill(
    0.05,
    [
      [0.2, 0.7, 0.9],
      [0.08, 2.2, 1.7],
    ],
    "#7cb064",
    OUT - 2.4,
  );

  /* Trees: a trunk and a round crown that leans with the wind from its
     foot. */
  const trunkMat = basic("#7a5a3e");
  const crowns = [basic("#4e8a3a"), basic("#5f9e47"), basic("#3f7531")];
  const trees = [
    [cx - 2.0, 0.4, 0.9, OUT - 3.0, 0],
    [cx + 2.4, 0.55, 0.7, OUT - 3.2, 1.3],
    [cx + 0.6, 0.75, 0.5, OUT - 3.8, 2.4],
    [cx - 4.6, 0.3, 1.0, OUT - 2.9, 0.7],
    [cx + 5.2, 0.2, 1.1, OUT - 2.8, 3.1],
  ].map(([x, y, sc, z, phase]) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(
      bin.add(new THREE.PlaneGeometry(0.14, 0.9)),
      trunkMat,
    );
    trunk.position.y = 0.45;
    t.add(trunk);
    const crown = new THREE.Group();
    crown.position.y = 0.75;
    for (const [dx, dy, r, k] of [
      [0, 0.35, 0.55, 0],
      [-0.38, 0.12, 0.4, 1],
      [0.4, 0.15, 0.42, 2],
      [0.05, 0.75, 0.38, 1],
      [-0.2, 0.55, 0.32, 2],
    ]) {
      const m = new THREE.Mesh(puff, crowns[k]);
      m.position.set(dx, dy, 0.001 * k);
      m.scale.setScalar(r);
      crown.add(m);
    }
    t.add(crown);
    t.position.set(x, y, z);
    t.scale.setScalar(sc);
    g.add(t);
    return { t, phase };
  });

  /* A leafy branch hanging into the top corner of the view outside. */
  const branchTex = bin.add(
    paint(
      256,
      256,
      (c) => {
        c.strokeStyle = "#6b4a32";
        c.lineWidth = 6;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(0, 20);
        c.quadraticCurveTo(110, 40, 210, 150);
        c.stroke();
        for (let k = 0; k < 16; k++) {
          const t = k / 15;
          const x = t * 200;
          const y = 22 + t * t * 125;
          for (const side of [-1, 1]) {
            c.save();
            c.translate(x, y);
            c.rotate(0.9 + side * 0.9 + t * 0.4);
            c.fillStyle = k % 3 === 0 ? "#4f8f3a" : "#64a64b";
            c.beginPath();
            c.ellipse(16, 0, 16, 7, 0, 0, Math.PI * 2);
            c.fill();
            c.restore();
          }
        }
      },
      true,
    ),
  );
  const branchPivot = new THREE.Group();
  branchPivot.position.set(WIN.x0 - 0.3, WIN.y1 + 0.2, WALL_Z - 0.6);
  const branch = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(2.4, 2.4)),
    bin.add(
      new THREE.MeshBasicMaterial({
        map: branchTex,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  branch.position.set(1.2, -1.2, 0);
  {
    const mat = branch.material as THREE.MeshBasicMaterial;
    outside.push({ mat, base: mat.color.clone() });
  }

  branchPivot.add(branch);
  g.add(branchPivot);

  /* Birds: two wings that flap, each on its own path and timing. */
  const birdMat = basic("#3b3a3f", { side: THREE.DoubleSide });
  const wingGeo = bin.add(new THREE.BufferGeometry());
  wingGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 0.22, 0, 0.05, 0.1, 0, -0.07],
      3,
    ),
  );
  const bodyGeo = bin.add(new THREE.SphereGeometry(0.05, 8, 6));
  const birds = [
    { cycle: 9, offset: 0, y: 0.7, dir: 1, size: 1 },
    { cycle: 13, offset: 5, y: 0.45, dir: -1, size: 0.7 },
  ].map((b) => {
    const bird = new THREE.Group();
    const wings = [-1, 1].map((side) => {
      const w = new THREE.Mesh(wingGeo, birdMat);
      w.scale.x = side;
      bird.add(w);
      return w;
    });
    const body = new THREE.Mesh(bodyGeo, birdMat);
    body.scale.set(1, 0.8, 1.8);
    bird.add(body);
    bird.rotation.x = -1.2;
    bird.scale.setScalar(b.size);
    g.add(bird);
    return { ...b, bird, wings };
  });

  /* Linen curtains at each side of the window, on a rod, stirring. */
  const rod = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.035, 0.035, W + 2.0, 12)),
    std({ color: "#8a6a4a", roughness: 0.6 }),
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.set(cx, WIN.y1 + 0.32, WALL_Z + 0.18);
  g.add(rod);
  const linen = bin.add(
    new THREE.MeshLambertMaterial({
      color: "#f4ecdc",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    }),
  );
  const CW = 1.15;
  const CH = H + 0.3;
  const curtains = [-1, 1].map((side) => {
    const geo = bin.add(new THREE.PlaneGeometry(CW, CH, 18, 14));
    geo.userData.rest = Float32Array.from(
      geo.getAttribute("position").array as Float32Array,
    );
    const m = new THREE.Mesh(geo, linen);
    m.position.set(
      side < 0 ? WIN.x0 - 0.25 : WIN.x1 + 0.25,
      WIN.y1 + 0.3 - CH / 2,
      WALL_Z + 0.16,
    );
    g.add(m);
    return { m, geo, side };
  });

  /* ---- a shelf of herbs, right of the window ---- */
  const wood = std({ color: "#b98c5f", roughness: 0.7, envMapIntensity: 0.2 });
  const shelf = new THREE.Mesh(
    bin.add(new THREE.BoxGeometry(SHELF_W, 0.09, 0.5)),
    wood,
  );
  shelf.position.set(SHELF.x, SHELF.y, WALL_Z + 0.25);
  g.add(shelf);
  /* ---- plants: leaves, not balls. Each leaf is a painted outline on a
     curved strip, so it cups and droops; a plant is stems or vines with
     leaves set along them. ---- */
  const terracotta = std({
    color: "#b8653f",
    roughness: 0.92,
    envMapIntensity: 0.12,
  });
  const soil = std({ color: "#3f2b1e", roughness: 1, envMapIntensity: 0 });
  const potGeo = bin.add(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.15, 0],
        [0.165, 0.02],
        [0.2, 0.28],
        [0.205, 0.29],
        [0.238, 0.296],
        [0.242, 0.36],
        [0.218, 0.366],
        [0.206, 0.335],
        [0, 0.335],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
  );
  const soilGeo = bin.add(new THREE.CircleGeometry(0.205, 24));
  soilGeo.rotateX(-Math.PI / 2);

  const leafTex = (kind: "oval" | "heart" | "blade") =>
    bin.add(
      paint(
        kind === "blade" ? 64 : 128,
        kind === "blade" ? 512 : 256,
        (c) => {
          const w = kind === "blade" ? 64 : 128;
          const h = kind === "blade" ? 512 : 256;
          const m = w / 2;
          c.beginPath();
          if (kind === "oval") {
            c.moveTo(m, h - 4);
            c.bezierCurveTo(-6, h * 0.7, 6, h * 0.18, m, 4);
            c.bezierCurveTo(w - 6, h * 0.18, w + 6, h * 0.7, m, h - 4);
          } else if (kind === "heart") {
            c.moveTo(m, h - 22);
            c.bezierCurveTo(m - 40, h + 4, -14, h * 0.62, 24, h * 0.4);
            c.quadraticCurveTo(m - 10, h * 0.16, m, 4);
            c.quadraticCurveTo(m + 10, h * 0.16, w - 24, h * 0.4);
            c.bezierCurveTo(w + 14, h * 0.62, m + 40, h + 4, m, h - 22);
          } else {
            c.moveTo(6, h);
            c.quadraticCurveTo(0, h * 0.35, m, 2);
            c.quadraticCurveTo(w, h * 0.35, w - 6, h);
          }
          c.closePath();
          const grad = c.createLinearGradient(0, h, 0, 0);
          if (kind === "blade") {
            grad.addColorStop(0, "#3d6b34");
            grad.addColorStop(1, "#2d5a2a");
          } else if (kind === "heart") {
            grad.addColorStop(0, "#4f8f37");
            grad.addColorStop(1, "#6aa84a");
          } else {
            grad.addColorStop(0, "#4c8a36");
            grad.addColorStop(1, "#78b558");
          }
          c.fillStyle = grad;
          c.fill();
          c.save();
          c.clip();
          if (kind === "blade") {
            /* Snake-plant banding and a golden edge. */
            c.strokeStyle = "rgba(160,200,140,0.45)";
            c.lineWidth = 5;
            for (let y = 20; y < h; y += 26) {
              c.beginPath();
              c.moveTo(0, y);
              c.quadraticCurveTo(m, y - 10, w, y + 4);
              c.stroke();
            }
            c.strokeStyle = "#d4c35a";
            c.lineWidth = 7;
            c.stroke(
              new Path2D(
                `M6 ${h} Q0 ${h * 0.35} ${m} 2 Q${w} ${h * 0.35} ${w - 6} ${h}`,
              ),
            );
          } else {
            if (kind === "heart") {
              /* Pothos marbling. */
              c.fillStyle = "rgba(225,230,140,0.35)";
              for (let k = 0; k < 6; k++) {
                c.beginPath();
                c.ellipse(
                  m + (k % 2 ? 18 : -18),
                  h * (0.25 + k * 0.1),
                  10,
                  26,
                  k % 2 ? 0.4 : -0.4,
                  0,
                  Math.PI * 2,
                );
                c.fill();
              }
            }
            c.strokeStyle = "rgba(200,230,170,0.7)";
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(m, h);
            c.lineTo(m, 10);
            c.stroke();
            c.lineWidth = 1.6;
            c.strokeStyle = "rgba(200,230,170,0.45)";
            for (let k = 1; k < 7; k++) {
              const y = h - k * (h / 7.5);
              for (const side of [-1, 1]) {
                c.beginPath();
                c.moveTo(m, y);
                c.quadraticCurveTo(
                  m + side * w * 0.22,
                  y - 8,
                  m + side * w * 0.42,
                  y - 26,
                );
                c.stroke();
              }
            }
            /* A soft sheen down one side. */
            const sh = c.createLinearGradient(0, 0, w, 0);
            sh.addColorStop(0, "rgba(255,255,255,0)");
            sh.addColorStop(0.3, "rgba(255,255,255,0.12)");
            sh.addColorStop(0.5, "rgba(255,255,255,0)");
            c.fillStyle = sh;
            c.fillRect(0, 0, w, h);
          }
          c.restore();
        },
        true,
      ),
    );
  const leafMats = (kind: "oval" | "heart" | "blade") => {
    const map = leafTex(kind);
    return ["#ffffff", "#dfe9c6", "#c9dab0"].map((color) =>
      std({
        map,
        color,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.55,
        envMapIntensity: 0.35,
      }),
    );
  };
  const mats = {
    oval: leafMats("oval"),
    heart: leafMats("heart"),
    blade: leafMats("blade"),
  };
  /** A leaf strip one unit long along +z, one wide, cupped across and
   *  drooping toward its tip; its face is up (+y). */
  const leafGeo = (droop: number, cup: number) => {
    const geo = new THREE.PlaneGeometry(1, 1, 3, 8);
    const pos = geo.getAttribute("position");
    for (let k = 0; k < pos.count; k++) {
      const u = pos.getX(k);
      const v = pos.getY(k) + 0.5;
      pos.setXYZ(k, u, -droop * v * v + cup * u * u, v);
    }
    geo.computeVertexNormals();
    return bin.add(geo);
  };
  const geos = {
    oval: leafGeo(0.25, 0.35),
    heart: leafGeo(0.22, 0.25),
    blade: leafGeo(0.04, 0.3),
    flat: leafGeo(0.1, 0.3),
  };
  const stemMat = std({ color: "#5d8a3a", roughness: 0.7 });
  /** One leaf at `at`, pointing out along `yaw`, risen by `rise` from flat. */
  const leaf = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    kind: keyof typeof mats,
    at: THREE.Vector3,
    yaw: number,
    rise: number,
    w: number,
    l: number,
    roll = 0,
  ) => {
    const m = new THREE.Mesh(geo, mats[kind][Math.floor(rand() * 3)]);
    m.position.copy(at);
    m.rotation.set(-rise, yaw, roll, "YXZ");
    m.scale.set(w, w, l);
    parent.add(m);
  };
  const tube = (parent: THREE.Object3D, pts: THREE.Vector3[], r: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    parent.add(
      new THREE.Mesh(
        bin.add(new THREE.TubeGeometry(curve, 16, r, 5, false)),
        stemMat,
      ),
    );
    return curve;
  };

  /** Basil: a few upright stems, leaves in opposite pairs, a tuft on top. */
  const basil = () => {
    const p = new THREE.Group();
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand() * 0.5;
      const lean = 0.25 + rand() * 0.25;
      const L = 0.3 + rand() * 0.18;
      const top = new THREE.Vector3(
        Math.sin(a) * lean * L,
        L,
        Math.cos(a) * lean * L,
      );
      const curve = tube(
        p,
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(top.x * 0.4, L * 0.5, top.z * 0.4),
          top,
        ],
        0.011,
      );
      [0.4, 0.68, 0.92].forEach((t, i) => {
        const at = curve.getPoint(t);
        const s = 0.2 * (1.15 - t * 0.45);
        for (const side of [-1, 1])
          leaf(
            p,
            geos.oval,
            "oval",
            at,
            a + side * (Math.PI / 2) + (i % 2) * 0.6,
            0.35 + t * 0.5,
            s * 0.75,
            s * 1.35,
          );
      });
      for (let q = 0; q < 3; q++)
        leaf(p, geos.oval, "oval", top, a + q * 2.1, 1.1, 0.09, 0.15);
    }
    return p;
  };
  /** Pothos: heart leaves on vines that spill over the rim and hang. */
  const pothos = (hang = 0.28) => {
    const p = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rand() * 0.4;
      const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const drop = hang * (0.5 + rand() * 0.6);
      const curve = tube(
        p,
        [
          d.clone().multiplyScalar(0.05).setY(0.04),
          d.clone().multiplyScalar(0.24).setY(0.1),
          d
            .clone()
            .multiplyScalar(0.33)
            .setY(-drop * 0.4),
          d.clone().multiplyScalar(0.37).setY(-drop),
        ],
        0.007,
      );
      for (let q = 0; q < 6; q++) {
        const t = 0.12 + q * 0.16;
        const at = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const yaw = Math.atan2(tan.x, tan.z) + (q % 2 ? 1 : -1) * 0.9;
        leaf(p, geos.heart, "heart", at, yaw, 0.25 + rand() * 0.3, 0.2, 0.23);
      }
    }
    for (let q = 0; q < 6; q++)
      leaf(
        p,
        geos.heart,
        "heart",
        new THREE.Vector3(0, 0.03, 0),
        q * 1.05,
        0.9 + rand() * 0.3,
        0.2,
        0.24,
      );
    return p;
  };
  /** Snake plant: stiff banded blades fanning up from the soil. */
  const snake = () => {
    const p = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.08;
      leaf(
        p,
        geos.blade,
        "blade",
        new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r),
        a,
        1.3 + rand() * 0.2,
        0.11 + rand() * 0.03,
        0.55 + rand() * 0.45,
        (rand() - 0.5) * 0.8,
      );
    }
    return p;
  };
  const pot = (
    x: number,
    y: number,
    z: number,
    scale: number,
    kind: "basil" | "pothos" | "snake",
  ) => {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(potGeo, terracotta));
    const dirt = new THREE.Mesh(soilGeo, soil);
    dirt.position.y = 0.33;
    p.add(dirt);
    const plant =
      kind === "basil" ? basil() : kind === "pothos" ? pothos() : snake();
    plant.position.y = 0.33;
    p.add(plant);
    p.position.set(x, y, z);
    p.scale.setScalar(scale);
    p.rotation.y = rand() * Math.PI * 2;
    g.add(p);
  };
  pot(SHELF.x - 1.3, SHELF.y + 0.05, WALL_Z + 0.25, 1.0, "basil");
  pot(SHELF.x - 0.2, SHELF.y + 0.05, WALL_Z + 0.25, 1.05, "pothos");
  /* A glass jar of seed beside them. */
  const jar = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 20)),
    std({
      color: "#e9f1ef",
      roughness: 0.05,
      envMapIntensity: 1,
      transparent: true,
      opacity: 0.45,
    }),
  );
  jar.position.set(SHELF.x + 1, SHELF.y + 0.26, WALL_Z + 0.25);
  g.add(jar);
  const seedFill = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 20)),
    std({ color: "#b48a4a", roughness: 0.9 }),
  );
  seedFill.position.set(SHELF.x + 1, SHELF.y + 0.18, WALL_Z + 0.25);
  g.add(seedFill);
  const lidMesh = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20)),
    wood,
  );
  lidMesh.position.set(SHELF.x + 1, SHELF.y + 0.5, WALL_Z + 0.25);
  g.add(lidMesh);

  /* ---- a framed print, left of the window ---- */
  const print = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(1.2, 1.5)),
    std({
      roughness: 0.8,
      envMapIntensity: 0.2,
      map: bin.add(
        paint(240, 300, (c) => {
          c.fillStyle = "#f4eee2";
          c.fillRect(0, 0, 240, 300);
          c.strokeStyle = "#4f7d3c";
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(120, 260);
          c.quadraticCurveTo(110, 160, 130, 60);
          c.stroke();
          for (let k = 0; k < 7; k++) {
            const y = 230 - k * 26;
            for (const side of [-1, 1]) {
              c.save();
              c.translate(118 + k * 1.5, y);
              c.rotate(side * (0.9 - k * 0.05));
              c.fillStyle = k % 2 ? "#79ab5f" : "#5d9448";
              c.beginPath();
              c.ellipse(0, -26, 11, 26, 0, 0, Math.PI * 2);
              c.fill();
              c.restore();
            }
          }
        }),
      ),
    }),
  );
  print.position.set(WIN.x0 - 2.2, 2.35, WALL_Z + 0.04);
  g.add(print);
  const frameWood = std({
    color: "#3f3226",
    roughness: 0.6,
    envMapIntensity: 0.3,
  });
  for (const [w, h, x, y] of [
    [1.42, 0.11, 0, 0.8],
    [1.42, 0.11, 0, -0.8],
    [0.11, 1.6, -0.66, 0],
    [0.11, 1.6, 0.66, 0],
  ]) {
    const m = new THREE.Mesh(
      bin.add(new THREE.BoxGeometry(w, h, 0.08)),
      frameWood,
    );
    m.position.set(WIN.x0 - 2.2 + x, 2.35 + y, WALL_Z + 0.06);
    g.add(m);
  }

  /* ---- pots on the counter, out at the ends ---- */
  pot(-6.2, 0, WALL_Z + 0.7, 1.7, "snake");
  /* Right of the framed product under the shelf, clear of it (the owner,
     2 Oct 2026). */
  pot(SHELF.x + SHELF_W / 2 + 1.5, 0, WALL_Z + 0.8, 1.4, "pothos");
  pot(WIN.x0 + 0.6, WIN.y0, WALL_Z + 0.15, 0.75, "basil");

  /* ---- a lamp on the counter, right of the window, lit at night ---- */
  const lamp = new THREE.Group();
  const brass = std({ color: "#b08a4e", roughness: 0.35, metalness: 0.6 });
  const lampBase = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 24)),
    brass,
  );
  lampBase.position.y = 0.03;
  const stem = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10)),
    brass,
  );
  stem.position.y = 0.48;
  const shadeMat = std({
    color: "#f3e6c8",
    roughness: 0.8,
    emissive: "#ffc76a",
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
  const shade = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.24, 0.42, 0.42, 28, 1, true)),
    shadeMat,
  );
  shade.position.y = 1.02;
  const bulb = new THREE.PointLight("#ffbf66", 0, 9, 1.4);
  bulb.position.y = 0.9;
  lamp.add(lampBase, stem, shade, bulb);
  lamp.position.set(WIN.x1 - 0.55, 0, WALL_Z + 0.55);
  g.add(lamp);

  /* ---- the dark room, through the door on the left ---- */
  let fan: THREE.Group;
  let hinge: THREE.Group;
  {
    const dark = (color: string) =>
      bin.add(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    const W2 = DARK.x1 - DARK.x0;
    const mid = (DARK.x0 + DARK.x1) / 2;
    const back = WALL_Z - DARK.depth;
    const plane = (w: number, h: number, mat: THREE.Material) =>
      new THREE.Mesh(bin.add(new THREE.PlaneGeometry(w, h)), mat);
    const floor = plane(W2, DARK.depth, dark("#1b1714"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(mid, 0.001, WALL_Z - DARK.depth / 2);
    const ceiling = plane(W2, DARK.depth, dark("#0d0e0f"));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(mid, DARK.h, WALL_Z - DARK.depth / 2);
    const wallMat = dark("#15181a");
    const far = plane(W2, DARK.h, wallMat);
    far.position.set(mid, DARK.h / 2, back);
    g.add(floor, ceiling, far);
    for (const x of [DARK.x0, DARK.x1]) {
      const side = plane(DARK.depth, DARK.h, wallMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(x, DARK.h / 2, WALL_Z - DARK.depth / 2);
      g.add(side);
    }
    /* The air vent, high on the far wall facing the door: a grille with a
       fan turning behind it, so the room breathes. */
    const vent = new THREE.Group();
    vent.position.set((DOOR.x0 + DOOR.x1) / 2, 4.2, back + 0.02);
    const grilleMat = dark("#3a3f42");
    const rim = new THREE.Mesh(
      bin.add(new THREE.RingGeometry(0.5, 0.6, 40)),
      grilleMat,
    );
    const hollow = new THREE.Mesh(
      bin.add(new THREE.CircleGeometry(0.5, 40)),
      dark("#07080a"),
    );
    hollow.position.z = -0.005;
    vent.add(hollow, rim);
    for (const y of [-0.3, -0.1, 0.1, 0.3]) {
      const bar = plane(0.9, 0.035, grilleMat);
      bar.position.set(0, y, 0.02);
      vent.add(bar);
    }
    fan = new THREE.Group();
    const blade = bin.add(new THREE.PlaneGeometry(0.16, 0.42));
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(blade, dark("#2b3033"));
      b.position.set(0, 0.22, 0);
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      arm.add(b);
      fan.add(arm);
    }
    fan.position.z = 0.01;
    vent.add(fan);
    g.add(vent);

    /* The door frame, and the door on its hinge at the left jamb, opening
       out into the kitchen: swung inward it would sweep through the tray
       set down just inside. */
    const frameMat = std({
      color: "#f3efe6",
      roughness: 0.5,
      envMapIntensity: 0.3,
    });
    const jamb = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(
        bin.add(new THREE.BoxGeometry(w, h, 0.18)),
        frameMat,
      );
      m.position.set(x, y, WALL_Z + 0.02);
      g.add(m);
    };
    jamb(0.14, DOOR.h + 0.14, DOOR.x0 - 0.07, (DOOR.h + 0.14) / 2);
    jamb(0.14, DOOR.h + 0.14, DOOR.x1 + 0.07, (DOOR.h + 0.14) / 2);
    jamb(
      DOOR.x1 - DOOR.x0 + 0.28,
      0.14,
      (DOOR.x0 + DOOR.x1) / 2,
      DOOR.h + 0.07,
    );
    hinge = new THREE.Group();
    hinge.position.set(DOOR.x0, 0, WALL_Z);
    const DW = DOOR.x1 - DOOR.x0;
    const leafMat = std({
      color: "#365646",
      roughness: 0.55,
      envMapIntensity: 0.3,
    });
    const leaf = new THREE.Mesh(
      bin.add(new THREE.BoxGeometry(DW - 0.02, DOOR.h - 0.02, 0.07)),
      leafMat,
    );
    leaf.position.set(DW / 2, DOOR.h / 2, 0);
    hinge.add(leaf);
    /* Two raised panels, so it reads as a door. */
    for (const y of [DOOR.h * 0.27, DOOR.h * 0.7]) {
      const panel = new THREE.Mesh(
        bin.add(new THREE.BoxGeometry(DW - 0.5, DOOR.h * 0.32, 0.03)),
        leafMat,
      );
      panel.position.set(DW / 2, y, 0.045);
      hinge.add(panel);
    }
    /* Its name on a plate at eye height. */
    const sign = new THREE.Mesh(
      bin.add(new THREE.PlaneGeometry(1.5, 0.34)),
      std({
        roughness: 0.6,
        envMapIntensity: 0.3,
        map: bin.add(
          paint(600, 136, (c) => {
            c.fillStyle = "#f6f1e4";
            c.beginPath();
            c.roundRect(4, 4, 592, 128, 26);
            c.fill();
            c.fillStyle = "#1f3a2c";
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.font = `700 80px ${font}`;
            c.fillText(doorLabel, 300, 70, 560);
          }),
        ),
      }),
    );
    sign.position.set(DW / 2, DOOR.h * 0.86, 0.065);
    hinge.add(sign);
    const knob = new THREE.Mesh(
      bin.add(new THREE.SphereGeometry(0.07, 16, 12)),
      std({ color: "#c9a560", roughness: 0.3, metalness: 0.7 }),
    );
    knob.position.set(DW - 0.25, DOOR.h * 0.46, 0.1);
    hinge.add(knob);
    g.add(hinge);
  }
  function door(k: number) {
    /* Outward, toward the viewer, to lie back along the wall's left. */
    hinge.rotation.y = -1.75 * k;
  }

  let night = false;
  function update(time: number) {
    fan.rotation.z = -time * 6;
    branchPivot.rotation.z =
      Math.sin(time * 0.7) * 0.06 + Math.sin(time * 1.9) * 0.015;
    for (const { c, speed } of clouds) {
      c.position.x += speed * 0.016;
      if (c.position.x > cx + 9) c.position.x = cx - 9;
    }
    for (const { t, phase } of trees) {
      t.children[1].rotation.z =
        Math.sin(time * 0.9 + phase) * 0.05 +
        Math.sin(time * 2.3 + phase) * 0.012;
    }
    for (const b of birds) {
      const u = ((time + b.offset) % b.cycle) / 4;
      /* No birds at night. */
      if (u > 1 || night) {
        b.bird.visible = false;
        continue;
      }
      b.bird.visible = true;
      const span = W + 3;
      const x = b.dir > 0 ? WIN.x0 - 1.5 + u * span : WIN.x1 + 1.5 - u * span;
      b.bird.position.set(
        x,
        WIN.y0 + H * b.y + Math.sin(u * Math.PI * 2) * 0.22,
        WALL_Z - 1.4,
      );
      b.bird.rotation.y = b.dir > 0 ? 0 : Math.PI;
      const flap = Math.sin(time * 16 + b.offset) * 0.7;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
    for (const { geo, side } of curtains) {
      const rest = geo.userData.rest as Float32Array;
      const a = geo.getAttribute("position").array as Float32Array;
      for (let k = 0; k < a.length; k += 3) {
        const x = rest[k];
        const y = rest[k + 1];
        const down = (CH / 2 - y) / CH;
        const breeze = down * down;
        a[k] = x + breeze * 0.05 * Math.sin(time * 0.8 + side);
        a[k + 2] =
          Math.sin(x * 15) * 0.045 +
          breeze * 0.08 * Math.sin(time * 1.1 + x * 2.5 + side * 1.7);
      }
      geo.getAttribute("position").needsUpdate = true;
      geo.computeVertexNormals();
    }
  }

  const NIGHT = new THREE.Color("#1c2747");
  const DUSK = new THREE.Color("#f2a46b");
  const WHITE = new THREE.Color(1, 1, 1);
  const tint = new THREE.Color();
  /** How much daylight there is at `f` through the day, 0 to 1. */
  const dayAt = (f: number) =>
    THREE.MathUtils.smoothstep(Math.sin(f * 2 * Math.PI), -0.2, 0.3);
  function daylight(f: number | null) {
    if (f === null) {
      for (const o of outside) o.mat.color.copy(o.base);
      sunDisc.position.copy(SUN_AT);
      sunGlow.position.set(SUN_AT.x, SUN_AT.y, SUN_AT.z - 0.02);
      sunDisc.visible = sunGlow.visible = true;
      moon.visible = stars.visible = false;
      shadeMat.emissiveIntensity = 0;
      bulb.intensity = 0;
      night = false;
      return;
    }
    const a = f * 2 * Math.PI;
    const up = Math.sin(a);
    const day = dayAt(f);
    const glow = Math.max(0, 1 - Math.abs(up) / 0.35);
    /* Night blue under everything, warmed toward orange at dawn and dusk. */
    tint
      .copy(NIGHT)
      .lerp(DUSK, glow * 0.6)
      .lerp(WHITE, day);
    for (const o of outside) o.mat.color.copy(o.base).multiply(tint);
    /* Sun and moon on one wheel across the window, opposite each other. */
    sunDisc.position.set(cx - 4.6 * Math.cos(a), 0.5 + 3.8 * up, OUT - 4.88);
    sunGlow.position.set(sunDisc.position.x, sunDisc.position.y, OUT - 4.9);
    moon.position.set(cx + 4.6 * Math.cos(a), 0.5 - 3.8 * up, OUT - 4.88);
    sunDisc.visible = sunGlow.visible = up > -0.2;
    moon.visible = up < 0.2;
    stars.visible = day < 1;
    starMat.opacity = 1 - day;
    shadeMat.emissiveIntensity = 1.6 * (1 - day);
    bulb.intensity = 9 * (1 - day);
    night = day < 0.4;
  }

  return { group: g, update, daylight, dayAt, door };
}

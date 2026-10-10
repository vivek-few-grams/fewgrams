import * as THREE from "three";
import type { FieldRect } from "./field";
import type { Look } from "./kinds";

export type { Look } from "./kinds";

/**
 * The greens themselves — what a stem and its pair of seed leaves look like,
 * per variety, and the shaders that bend, grow and colour them. Shared by the
 * home page's three trays (`scene.ts`) and the play garden's one
 * (`garden/scene.ts`), so a tray grown on `/garden` is the same tray a
 * visitor touched on the home page.
 *
 * Every stem is one instance of a small mesh: a tapered, bowed stem and a
 * pair of cupped seed leaves (see `plantGeometry`). A tray is one instanced
 * mesh, so thousands of stems are one draw call. The vertex shader looks up
 * the spring-field cell each stem stands in and bows it by that, so the only
 * per-frame upload is a small texture.
 *
 * Three more inputs exist for the garden and are inert on the home page:
 *
 * - `uGrow`, 0 → 1: a seed's sprout to a full stem. Each stem starts at its
 *   own moment, so a tray comes up unevenly, as a real one does.
 * - `uGreen`, 0 → 1: pale and yellow, as shoots are under a blackout cover,
 *   to coloured, as they are once they see light.
 * - `uMask`: red is "sown here", green is "cut here", one texel per patch of
 *   tray — so a stem grows only where seed fell, and stops being a plant
 *   where the cutter went.
 *
 * At their defaults (1, 1, sown everywhere and cut nowhere) the shaders draw
 * exactly what they drew before these existed.
 */

/** A seeded generator, so every visit — and every still photograph made from
 *  a scene — plants the same trays. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type LeafShape = "round" | "heart" | "long";

export type Variety = {
  /** Stem colour at the medium, and under the leaves. */
  stemBase: string;
  stemTop: string;
  /** Leaves are mixed between these two per stem. */
  leafA: string;
  leafB: string;
  /** Where the leaf meets its stalk, and the midrib — paler on every
   *  cotyledon, because that tissue is the youngest. */
  leafBase: string;
  /** The underside, seen when a leaf tips up or a hand turns it over. */
  leafUnder: string;
  /** The seed, as it lies on the coco peat before it sprouts. */
  seed: string;
  /** Seed length in world units; its width is a share of that. */
  seedSize: number;
  seedRound: number;
  /** Stem height in world units, ± `heightJitter`. */
  height: number;
  heightJitter: number;
  stemWidth: number;
  /** Seed-leaf outline, length and width. */
  shape: LeafShape;
  leafLength: number;
  leafWidth: number;
  /** A radish cotyledon is notched at the tip: 0 none, 1 deep. */
  notch: number;
  /** How far the two halves of a leaf fold up from the midrib. */
  cup: number;
  /** How far a leaf's tip arches up (+) or droops (−), per unit length. */
  arch: number;
  /** How far the pair stand open from flat, in radians. */
  open: number;
  /** Stems per square world unit. */
  density: number;
  /** How far a stem leans for the same push — 1 is the field as solved.
   *  A thin, tall stem gives more than a short, stocky one. */
  flex: number;
  /** Idle sway, as a multiple of the room's air. */
  sway: number;
  /** A jiggle each stem makes at its own pace while its patch is moving —
   *  0 for none. The field is shared and deliberately calm (the owner,
   *  1 Oct 2026); this is how one tray can be livelier without the others. */
  bounce: number;
};

/* Colours were taken off the hero's trays photograph (public/brand/
   hero-trays.jpg), so the drawing and the photograph agree. */
export const LOOKS: Record<Look, Variety> = {
  amaranth: {
    // Red amaranth — short, dense, magenta stems, small round dark leaves
    // that are magenta underneath.
    stemBase: "#f0cbd6",
    stemTop: "#c8246a",
    leafA: "#7a1f45",
    leafB: "#5c3036",
    leafBase: "#b23a6f",
    leafUnder: "#c4487f",
    seed: "#3a1d1a",
    seedSize: 0.018,
    seedRound: 0.9,
    height: 0.52,
    heightJitter: 0.1,
    stemWidth: 0.0105,
    shape: "round",
    leafLength: 0.085,
    leafWidth: 0.065,
    notch: 0,
    cup: 0.35,
    arch: 0.12,
    open: 0.3,
    density: 470,
    flex: 1,
    sway: 1,
    bounce: 0,
  },
  radish: {
    // Radish — pale stems blushing pink, broad notched (heart) leaves.
    stemBase: "#f5f3e6",
    stemTop: "#ebd3d8",
    leafA: "#4f8c2c",
    leafB: "#6fa83f",
    leafBase: "#a9c86a",
    leafUnder: "#a3c483",
    seed: "#7a5434",
    seedSize: 0.03,
    seedRound: 0.85,
    height: 0.58,
    heightJitter: 0.1,
    stemWidth: 0.0135,
    shape: "heart",
    leafLength: 0.12,
    leafWidth: 0.11,
    notch: 0.55,
    cup: 0.3,
    arch: 0.1,
    open: 0.22,
    density: 290,
    flex: 1,
    sway: 1,
    bounce: 0,
  },
  sunflower: {
    // Sunflower — tall, thick pale stems, long fleshy leaves. No seed hulls
    // on the leaves, though real trays carry a few: drawn at this size they
    // read as beetles (tried 1 Oct 2026), and nothing on a food page may look
    // like a bug. The seed on bare peat is fine — there it is a seed.
    stemBase: "#f4f3e0",
    stemTop: "#cfdc98",
    leafA: "#3e7d24",
    leafB: "#58952e",
    leafBase: "#93b957",
    leafUnder: "#93b47c",
    seed: "#4a4741",
    seedSize: 0.055,
    seedRound: 0.45,
    height: 0.68,
    heightJitter: 0.11,
    stemWidth: 0.0095,
    shape: "long",
    leafLength: 0.2,
    leafWidth: 0.09,
    notch: 0,
    cup: 0.45,
    arch: 0.05,
    open: 0.32,
    density: 160,
    /* Thin and tall, so it is the tray that moves most (the owner, 1 Oct
       2026: "more wavy and bouncy"). */
    flex: 1.35,
    sway: 2,
    bounce: 0.22,
  },
  mustard: {
    // Mustard — short pale stems, small bright heart-shaped leaves with a
    // shallow notch; a round golden seed. Sown in the garden only; the home
    // page grows the other three (`HOME_ROW`).
    stemBase: "#f2f1df",
    stemTop: "#d6e3a6",
    leafA: "#5f9e2c",
    leafB: "#7cb43c",
    leafBase: "#b3d06f",
    leafUnder: "#a9c98a",
    seed: "#b5832f",
    seedSize: 0.024,
    seedRound: 0.95,
    height: 0.5,
    heightJitter: 0.09,
    stemWidth: 0.011,
    shape: "heart",
    leafLength: 0.1,
    leafWidth: 0.095,
    notch: 0.35,
    cup: 0.32,
    arch: 0.1,
    open: 0.25,
    density: 340,
    flex: 1,
    sway: 1.1,
    bounce: 0,
  },
};

/** Half-width of a leaf at `u` (0 at the stalk, 1 at the tip), as a share of
 *  its widest. Every outline narrows to a short stalk at the base. */
function leafProfile(shape: LeafShape, u: number) {
  const stalk = 0.3 + 0.7 * THREE.MathUtils.smoothstep(u, 0, 0.22);
  switch (shape) {
    case "round":
      return Math.sin(Math.PI * u) ** 0.55 * stalk;
    case "heart":
      /* Widest two-thirds of the way out and still broad at the tip, where
         the notch is cut — a radish cotyledon is wider than it is long. */
      return (
        (u < 0.65 ? Math.sin(((Math.PI / 2) * u) / 0.65) ** 0.7 : 1 - 0.32 * ((u - 0.65) / 0.35) ** 2) * stalk
      );
    case "long":
      return Math.sin(Math.PI * u) ** 0.8 * stalk;
  }
}

type Mesh = {
  pos: number[];
  nrm: number[];
  uv: number[];
  part: number[];
  idx: number[];
};

function addMesh(into: Mesh, from: THREE.BufferGeometry, part: number, mirror = false) {
  const base = into.pos.length / 3;
  const p = from.getAttribute("position");
  const n = from.getAttribute("normal");
  const uv = from.getAttribute("uv");
  for (let k = 0; k < p.count; k++) {
    into.pos.push(mirror ? -p.getX(k) : p.getX(k), p.getY(k), p.getZ(k));
    into.nrm.push(mirror ? -n.getX(k) : n.getX(k), n.getY(k), n.getZ(k));
    into.uv.push(uv.getX(k), uv.getY(k));
    into.part.push(part);
  }
  const index = from.getIndex()!;
  for (let k = 0; k < index.count; k += 3) {
    const a = index.getX(k);
    const b = index.getX(k + 1);
    const c = index.getX(k + 2);
    /* Mirroring flips the winding; flip it back so the top of the leaf
       stays the front face, which is how the shader tells top from under. */
    if (mirror) into.idx.push(base + a, base + c, base + b);
    else into.idx.push(base + a, base + b, base + c);
  }
}

/**
 * One cotyledon as a curved surface, pointing along +x from the stem's tip
 * with its top face up. A grid rather than a fan, so it can fold along the
 * midrib and arch along its length — a flat ellipse is what made the first
 * version read as confetti. `uv` is (along, across) with across in [−1, 1],
 * which the fragment shader paints the midrib and veins from.
 */
function leafGeometry(v: Variety) {
  const NU = 12;
  const NV = 5;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const half = v.leafWidth / 2;
  for (let i = 0; i <= NU; i++) {
    for (let j = -NV; j <= NV; j++) {
      const across = j / NV;
      /* The notch: the middle of the tip stops short of the edges. */
      const reach = 1 - v.notch * 0.17 * (1 - Math.abs(across)) ** 2;
      const u = (i / NU) * reach;
      const w = half * leafProfile(v.shape, u);
      const z = across * w;
      const y =
        v.cup * across * across * w +
        v.leafLength * v.arch * Math.sin(Math.PI * u) -
        v.leafLength * 0.08 * u * u;
      pos.push(u * v.leafLength, y, z);
      uv.push(u, across);
    }
  }
  const row = 2 * NV + 1;
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  /* Whatever the winding above produced, make the top the front. */
  const n = g.getAttribute("normal");
  let up = 0;
  for (let k = 0; k < n.count; k++) up += n.getY(k);
  if (up < 0) {
    const flipped: number[] = [];
    for (let k = 0; k < idx.length; k += 3) flipped.push(idx[k], idx[k + 2], idx[k + 1]);
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}

/**
 * The stem — the hypocotyl — as a smooth six-sided tube at unit height and
 * unit radius. Thickest a third of the way up and pinched just under the
 * leaves, which is the shape that stops it reading as a pipe; the shader
 * then bows each one by its own amount.
 */
function stemTube() {
  const SIDES = 6;
  const SEGMENTS = 10;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    const y = s / SEGMENTS;
    const r =
      (0.92 + 0.14 * Math.sin(Math.PI * Math.min(1, y * 1.4))) *
      (1 - 0.45 * THREE.MathUtils.smoothstep(y, 0.88, 1));
    for (let k = 0; k <= SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      nrm.push(Math.cos(a), 0, Math.sin(a));
      uv.push(y, k / SIDES);
    }
  }
  const row = SIDES + 1;
  for (let s = 0; s < SEGMENTS; s++) {
    for (let k = 0; k < SIDES; k++) {
      const a = s * row + k;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * One stem with its pair of seed leaves, merged into one mesh that every
 * instance shares. `aPart` tells the shader which is which: 0 stem, 1 leaf.
 * Stem vertices are at unit height and radius so each instance can be
 * sized; leaf vertices are in world units relative to the stem's tip, so a
 * tall stem does not get stretched leaves.
 */
function plantGeometry(v: Variety) {
  const m: Mesh = { pos: [], nrm: [], uv: [], part: [], idx: [] };
  const stem = stemTube();
  const leaf = leafGeometry(v);
  addMesh(m, stem, 0);
  addMesh(m, leaf, 1);
  addMesh(m, leaf, 1, true);
  stem.dispose();
  leaf.dispose();

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.nrm, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(m.uv, 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(m.part, 1));
  g.setIndex(m.idx);
  return g;
}

/* Shared by the plant and seed shaders: where an instance is in the mask. */
const MASK_LOOKUP = /* glsl */ `
  uniform sampler2D uField;
  uniform sampler2D uMask;
  uniform vec4 uFieldRect;
  uniform float uGrow;

  vec2 fieldUv(vec2 xz) {
    return (xz - uFieldRect.xy) / uFieldRect.zw;
  }

  /* When this stem starts: a share of the run spent waiting, so a tray comes
     up unevenly and the last stems are still pushing when the first stand. */
  float grown(float ph) {
    float lag = fract(ph * 7.93) * 0.3;
    return clamp((uGrow - lag) / (1.0 - lag), 0.0, 1.0);
  }
`;

const VERTEX = /* glsl */ `
  ${MASK_LOOKUP}
  uniform float uTime;
  uniform float uStemWidth;
  uniform float uOpen;
  uniform float uFlex;
  uniform float uSway;
  uniform float uBounce;
  uniform vec2 uHeights;  // shortest and tallest stem in this tray

  attribute vec2 aUv;
  attribute float aPart;
  attribute vec4 iData;   // x, z, height, leaf scale
  attribute vec3 iMore;   // yaw, phase, tint
  attribute vec2 iExtra;  // curve [-1, 1], how open [0, 1]

  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vCanopy;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    float ph = iMore.y;
    vec2 at = fieldUv(iData.xy);
    vec4 mask = texture2D(uMask, at);
    float g = grown(ph);
    /* Not sown here, or not up yet: no plant at all. Outside the clip box
       rather than a zero-size mesh, so it costs nothing to rasterise. */
    if (mask.r < 0.5 || g <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    bool cut = mask.g > 0.5;

    /* A sprout is mostly stem with its leaves still folded up together, and
       the leaves reach full size as the stem does. */
    float h = iData.z * g;
    float leafScale = iData.w * mix(0.45, 1.0, smoothstep(0.15, 0.8, g));
    if (cut) {
      /* A clean stub just above the peat, and no leaves. */
      h = min(h, 0.045 + 0.02 * fract(ph * 3.7));
      leafScale = 0.0;
    }
    float c = cos(iMore.x);
    float s = sin(iMore.x);
    mat2 yaw = mat2(c, -s, s, c);

    vec4 f = texture2D(uField, at);
    vec2 bend = (f.rg * 2.0 - 1.0) * uFlex;
    /* Air moving in the room, so a tray nobody touches is not a still. */
    bend += vec2(
      sin(uTime * 1.1 + iData.x * 0.9 + ph),
      cos(uTime * 0.8 + iData.y * 1.3 + ph * 1.7)
    ) * 0.02 * uSway;
    /* Bounce: while the patch moves (f.b), each stem jiggles on its own
       phase and pace, and stops when the field settles. */
    bend += vec2(
      sin(uTime * (6.0 + 2.0 * fract(ph * 3.3)) + ph * 3.0),
      cos(uTime * (5.5 + 2.0 * fract(ph * 4.1)) + ph * 2.0)
    ) * f.b * uBounce;
    /* Flex and bounce together could fold a stem flat; cap the lean. */
    float leanLen = length(bend);
    if (leanLen > 1.1) bend *= 1.1 / leanLen;
    /* No two stems grow quite plumb, which is what keeps the front row from
       reading as a picket fence. */
    bend += vec2(cos(ph * 3.1), sin(ph * 2.3)) * 0.14 * fract(ph * 5.7);
    if (cut) bend *= 0.0;

    vec3 p;
    vec3 n = normal;
    float t;
    if (aPart < 0.5) {
      float w = uStemWidth * (0.8 + 0.4 * fract(ph * 13.7));
      p = vec3(position.x * w, position.y * h, position.z * w);
      t = position.y;
    } else {
      vec3 l = position * leafScale;
      /* Open the pair about the hinge at the tip — mirrored, so work on the
         distance from the stem and put the side back after. A sprout's pair
         stand closed, pointing up, and open as the stem finishes. */
      float side = l.x < 0.0 ? -1.0 : 1.0;
      float a = mix(1.35, uOpen + (iExtra.y - 0.5) * 0.5, smoothstep(0.35, 0.85, g));
      float ca = cos(a);
      float sa = sin(a);
      vec2 r = vec2(abs(l.x), l.y);
      l.x = side * (r.x * ca - r.y * sa);
      l.y = r.x * sa + r.y * ca;
      vec2 rn = vec2(n.x * side, n.y);
      n.x = side * (rn.x * ca - rn.y * sa);
      n.y = rn.x * sa + rn.y * ca;
      /* Leaves flutter while the cell is moving, more at their tips. */
      l.y += sin(uTime * 15.0 + ph * 6.0) * f.b * 0.35 * length(l.xz);
      p = vec3(0.0, h, 0.0) + l;
      t = 1.0;
    }
    p.xz = yaw * p.xz;
    n.xz = yaw * n.xz;
    if (aPart > 0.5) {
      /* A bowed stem carries its leaves over with it. */
      p.y += dot(p.xz, bend) * 0.8;
    }

    /* Each stem's own curve — a gentle bow that is gone again at the tip,
       so the leaves still sit over the root. */
    vec2 curveDir = vec2(cos(ph * 1.7), sin(ph * 1.7));
    p.xz += curveDir * iExtra.x * h * 0.07 * sin(3.14159 * t);

    /* Bow: the lean grows with the square of the height up the stem, and
       the stem drops as it leans so it keeps roughly its length. */
    float lean = t * t;
    p.xz += bend * h * 0.85 * lean;
    p.y -= h * 0.42 * dot(bend, bend) * lean;
    n = normalize(n + vec3(bend.x, 0.0, bend.y) * 0.6 * t);

    vUv = aUv;
    vPart = aPart;
    vTint = iMore.z;
    vCanopy = clamp((h - uHeights.x) / max(uHeights.y - uHeights.x, 1e-3), 0.0, 1.0);
    vNormal = normalize(mat3(modelMatrix) * n);
    vec4 world = modelMatrix * vec4(p + vec3(iData.x, 0.0, iData.y), 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uStemBase;
  uniform vec3 uStemTop;
  uniform vec3 uLeafA;
  uniform vec3 uLeafB;
  uniform vec3 uLeafBase;
  uniform vec3 uLeafUnder;
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform float uGreen;
  uniform float uLight;

  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vCanopy;
  varying vec3 vNormal;
  varying vec3 vWorld;

  /* Etiolated: what a shoot grown in the dark looks like. */
  const vec3 PALE_LEAF = vec3(0.80, 0.70, 0.22);
  const vec3 PALE_STEM = vec3(0.92, 0.88, 0.70);

  void main() {
    vec3 n = normalize(vNormal);
    bool top = gl_FrontFacing;
    if (!top) n = -n;
    vec3 view = normalize(cameraPosition - vWorld);

    vec3 base;
    float ao = 1.0;
    float gloss;
    float spec;
    float through;
    float rim = 0.0;
    float shade = 1.0;

    if (vPart < 0.5) {
      /* Stem: pale and watery at the medium, coloured toward the leaves,
         with faint lengthwise streaks; glossy and lit through at the edges,
         because a microgreen stem is mostly water. */
      float t = vUv.x;
      base = mix(uStemBase, uStemTop, smoothstep(0.1, 0.9, t));
      base = mix(PALE_STEM, base, 0.35 + 0.65 * uGreen);
      base *= 0.9 + 0.2 * vTint;
      base *= 0.95 + 0.05 * sin(vUv.y * 37.7 + vTint * 40.0);
      /* The canopy shades its own floor. */
      ao = mix(0.3, 1.0, smoothstep(0.0, 0.85, t));
      gloss = 70.0;
      spec = 0.3;
      through = 0.35;
      rim = 0.35;
    } else {
      /* Leaf: paler at the stalk and along the midrib, faint side veins,
         a darker rim, and a lighter underside. */
      float u = vUv.x;
      float a = abs(vUv.y);
      base = mix(uLeafA, uLeafB, vTint);
      base = mix(uLeafBase, base, smoothstep(0.0, 0.3, u));
      float rib = 1.0 - smoothstep(0.0, 0.08, a);
      base = mix(base, uLeafBase, rib * 0.35 * (1.0 - 0.6 * u));
      float vein = abs(fract(u * 4.5 - a * 1.8) - 0.5);
      base *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.07, vein)) * step(0.12, a) * (1.0 - a);
      base *= 1.0 - 0.2 * smoothstep(0.7, 1.0, a);
      if (!top) base = mix(base, uLeafUnder, 0.7);
      /* A shoot colours up from its own stalk outward, a little behind the
         rest of the tray on some stems. */
      float green = clamp(uGreen * (1.3 + 0.3 * (1.0 - u)) - 0.3 * vTint, 0.0, 1.0);
      base = mix(PALE_LEAF * (0.85 + 0.3 * vTint), base, green);
      /* Leaves on shorter stems sit inside the canopy, in its shade, and
         any leaf may be under another's: a dense tray seen from above is
         dappled, not evenly lit, and without this every upturned leaf
         caught the same sun and the canopy went flat. */
      ao = mix(0.5, 1.0, vCanopy * vCanopy);
      shade = mix(0.35, 1.0, fract(vTint * 7.31));
      gloss = 30.0;
      spec = top ? 0.24 : 0.05;
      through = 0.55;
    }

    float ndl = dot(n, uSun);
    float wrap = pow(ndl * 0.5 + 0.5, 2.0);
    vec3 hemi = mix(uGround, uSky, n.y * 0.5 + 0.5);
    vec3 col = base * (hemi * 0.6 + uSunColor * wrap * 0.8 * shade) * ao;
    /* Light through the tissue from behind. */
    col += base * uSunColor * through * max(-ndl, 0.0) * ao;
    /* A wet stem glows along its edges. */
    float edge = pow(1.0 - max(dot(n, view), 0.0), 3.0);
    col += mix(base, vec3(1.0), 0.4) * rim * edge * ao;
    /* The waxy shine on a cotyledon, the wet one on a stem. */
    vec3 halfway = normalize(uSun + view);
    col += uSunColor * spec * pow(max(dot(n, halfway), 0.0), gloss) * ao * shade;

    gl_FragColor = vec4(col * uLight, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A 1 × 1 mask: sown everywhere, cut nowhere — the home page's trays. */
export function fullMask() {
  const t = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** Inputs the scene owns and every tray shares. */
export type Shared = {
  fieldTex: THREE.Texture;
  fieldRect: FieldRect;
  maskTex: THREE.Texture;
  time: { value: number };
  sun: THREE.Vector3;
  /** 0 → 1, see the file comment. Shared objects, so one write moves every
   *  tray drawn with them. */
  grow: { value: number };
  green: { value: number };
  /** A multiplier on all light on the greens — under a blackout cover it
   *  goes down, so a lifted cover reveals them. */
  light: { value: number };
};

export function sharedUniforms(
  fieldTex: THREE.Texture,
  fieldRect: FieldRect,
  maskTex: THREE.Texture,
  sun: THREE.Vector3,
): Shared {
  return {
    fieldTex,
    fieldRect,
    maskTex,
    sun,
    time: { value: 0 },
    grow: { value: 1 },
    green: { value: 1 },
    light: { value: 1 },
  };
}

/** Where one stem stands, for the seed that came before it. */
export type Stems = {
  /** x, z, height, leaf scale — four per stem. */
  data: Float32Array;
  /** yaw, phase, tint — three per stem. */
  more: Float32Array;
  count: number;
};

/**
 * Plants a rectangle of one variety on a jittered grid — even cover with no
 * rows showing. `cx` is the centre in x; the rectangle is centred on z = 0.
 * `thin` scales the density (a phone gets half).
 */
export function plantStems(
  v: Variety,
  cx: number,
  innerW: number,
  innerD: number,
  thin: number,
  rand: () => number,
) {
  const count = Math.round(innerW * innerD * v.density * thin);
  const cols = Math.round(Math.sqrt((count * innerW) / innerD));
  const rows = Math.ceil(count / cols);
  const data = new Float32Array(count * 4);
  const more = new Float32Array(count * 3);
  const extra = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) {
    const gx = (k % cols) + rand();
    const gz = Math.floor(k / cols) + rand();
    data[k * 4] = cx - innerW / 2 + (gx / cols) * innerW;
    data[k * 4 + 1] = -innerD / 2 + (gz / rows) * innerD;
    data[k * 4 + 2] = v.height + (rand() * 2 - 1) * v.heightJitter;
    data[k * 4 + 3] = 0.8 + rand() * 0.4;
    more[k * 3] = rand() * Math.PI * 2;
    more[k * 3 + 1] = rand() * Math.PI * 2;
    more[k * 3 + 2] = rand();
    extra[k * 2] = rand() * 2 - 1;
    extra[k * 2 + 1] = rand();
  }
  return { stems: { data, more, count } satisfies Stems, extra };
}

const linear = (hex: string) => new THREE.Color(hex);

/**
 * The instanced mesh for one tray of `v`, standing at `y`. The caller adds it
 * to the scene and disposes `mesh.geometry` and `mesh.material`.
 */
export function plantMesh(v: Variety, stems: Stems, extra: Float32Array, y: number, shared: Shared) {
  const geometry = plantGeometry(v);
  geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(stems.data, 4));
  geometry.setAttribute("iMore", new THREE.InstancedBufferAttribute(stems.more, 3));
  geometry.setAttribute("iExtra", new THREE.InstancedBufferAttribute(extra, 2));
  geometry.instanceCount = stems.count;

  const r = shared.fieldRect;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    uniforms: {
      uField: { value: shared.fieldTex },
      uMask: { value: shared.maskTex },
      uFieldRect: {
        value: new THREE.Vector4(r.minX, r.minZ, r.width, r.depth),
      },
      uTime: shared.time,
      uGrow: shared.grow,
      uGreen: shared.green,
      uLight: shared.light,
      uStemWidth: { value: v.stemWidth },
      uOpen: { value: v.open },
      uFlex: { value: v.flex },
      uSway: { value: v.sway },
      uBounce: { value: v.bounce },
      uHeights: {
        value: new THREE.Vector2(v.height - v.heightJitter, v.height + v.heightJitter),
      },
      uStemBase: { value: linear(v.stemBase) },
      uStemTop: { value: linear(v.stemTop) },
      uLeafA: { value: linear(v.leafA) },
      uLeafB: { value: linear(v.leafB) },
      uLeafBase: { value: linear(v.leafBase) },
      uLeafUnder: { value: linear(v.leafUnder) },
      uSun: { value: shared.sun },
      uSunColor: { value: linear("#fff3e0") },
      uSky: { value: linear("#fffaf0") },
      uGround: { value: linear("#6b5a46") },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  /* The stems move in the shader, so their bounds on the CPU are wrong. */
  mesh.frustumCulled = false;
  mesh.position.y = y;
  return mesh;
}

const SEED_VERTEX = /* glsl */ `
  ${MASK_LOOKUP}
  uniform float uSize;
  uniform float uRound;
  attribute vec4 iData;
  attribute vec3 iMore;
  varying vec3 vNormal;
  varying float vStripe;
  varying float vTint;

  void main() {
    float ph = iMore.y;
    vec4 mask = texture2D(uMask, fieldUv(iData.xy));
    /* A seed shows where it was sown and until its sprout has taken over —
       then the hull is under the canopy and the plant is what you see. */
    float g = grown(ph);
    if (mask.r < 0.5 || g > 0.55 || mask.g > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float c = cos(iMore.x);
    float s = sin(iMore.x);
    vec3 p = position * vec3(uSize, uSize * uRound * 0.7, uSize * uRound);
    /* Swollen and split as it germinates. */
    p *= 1.0 + g * 0.6;
    p.xz = mat2(c, -s, s, c) * p.xz;
    vec3 n = normal;
    n.xz = mat2(c, -s, s, c) * n.xz;
    /* Fell in a little late after the brush passed: each seed's own drop. */
    float fall = clamp(mask.b * 1.4 - fract(ph * 2.1) * 0.4, 0.0, 1.0);
    p.y += (1.0 - fall) * (1.0 - fall) * 0.6;
    vNormal = normalize(mat3(modelMatrix) * n);
    vStripe = position.z;
    vTint = iMore.z;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p + vec3(iData.x, uSize * 0.25, iData.y), 1.0);
  }
`;

const SEED_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSun;
  uniform float uStriped;
  uniform float uLight;
  varying vec3 vNormal;
  varying float vStripe;
  varying float vTint;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 base = uColor * (0.8 + 0.4 * vTint);
    /* A sunflower hull's pale stripes run its length. */
    base = mix(base, vec3(0.78, 0.76, 0.7), uStriped * step(0.75, fract(vStripe * 4.0 + 0.5)));
    float l = 0.45 + 0.75 * max(dot(n, uSun), 0.0);
    gl_FragColor = vec4(base * l * uLight, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * The seeds, one per stem and in the same place, so a seed sown is exactly
 * where its sprout comes up. Shown where the mask's red says sown; the mask's
 * blue says how far each patch's seeds have fallen, so sowing reads as seed
 * dropping from the hand rather than appearing.
 */
export function seedMesh(v: Variety, stems: Stems, y: number, shared: Shared) {
  const shape = new THREE.SphereGeometry(0.5, 8, 6);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = shape.index;
  geometry.setAttribute("position", shape.getAttribute("position"));
  geometry.setAttribute("normal", shape.getAttribute("normal"));
  geometry.setAttribute("iData", new THREE.InstancedBufferAttribute(stems.data, 4));
  geometry.setAttribute("iMore", new THREE.InstancedBufferAttribute(stems.more, 3));
  geometry.instanceCount = stems.count;
  const r = shared.fieldRect;
  const material = new THREE.ShaderMaterial({
    vertexShader: SEED_VERTEX,
    fragmentShader: SEED_FRAGMENT,
    uniforms: {
      uField: { value: shared.fieldTex },
      uMask: { value: shared.maskTex },
      uFieldRect: {
        value: new THREE.Vector4(r.minX, r.minZ, r.width, r.depth),
      },
      uGrow: shared.grow,
      uLight: shared.light,
      uSize: { value: v.seedSize },
      uRound: { value: v.seedRound },
      uColor: { value: linear(v.seed) },
      uStriped: { value: v.seedRound < 0.6 ? 1 : 0 },
      uSun: { value: shared.sun },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.position.y = y;
  return mesh;
}

/**
 * One cut stem with its leaves, as an ordinary mesh with its colours baked
 * in — for a heap of harvested greens in a bowl, where every sprig lies at
 * its own angle and the instanced shader above (which only turns a stem about
 * its own axis) cannot place it. `length` is how much stem was cut.
 */
export function sprigGeometry(v: Variety, length: number) {
  const m: Mesh = { pos: [], nrm: [], uv: [], part: [], idx: [] };
  const stem = stemTube();
  const leaf = leafGeometry(v);
  addMesh(m, stem, 0);
  addMesh(m, leaf, 1);
  addMesh(m, leaf, 1, true);
  stem.dispose();
  leaf.dispose();

  const stemTop = new THREE.Color(v.stemTop);
  const stemBase = new THREE.Color(v.stemBase);
  const leafColor = new THREE.Color(v.leafA).lerp(new THREE.Color(v.leafB), 0.5);
  const under = new THREE.Color(v.leafBase);
  const colors: number[] = [];
  const pos = m.pos;
  const open = v.open + 0.15;
  const ca = Math.cos(open);
  const sa = Math.sin(open);
  for (let k = 0; k < m.part.length; k++) {
    const x = pos[k * 3];
    const y = pos[k * 3 + 1];
    const z = pos[k * 3 + 2];
    if (m.part[k] < 0.5) {
      pos[k * 3] = x * v.stemWidth;
      pos[k * 3 + 1] = y * length;
      pos[k * 3 + 2] = z * v.stemWidth;
      const c = stemBase.clone().lerp(stemTop, y);
      colors.push(c.r, c.g, c.b);
    } else {
      const side = x < 0 ? -1 : 1;
      const r = Math.abs(x);
      pos[k * 3] = side * (r * ca - y * sa);
      pos[k * 3 + 1] = length + r * sa + y * ca;
      pos[k * 3 + 2] = z;
      const c = under.clone().lerp(leafColor, Math.min(1, (r / v.leafLength) * 6));
      colors.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  return g;
}

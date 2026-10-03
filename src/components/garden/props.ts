import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  TRAY_D,
  TRAY_H,
  TRAY_W,
  WATER_MARGIN,
  roundedRect,
  trayGeometry,
} from "@/components/tray-play/tray";

/**
 * Everything on the play garden's bench that is not the tray or the greens:
 * the bench itself, a spray bottle and a cloth, a basin with a coco peat
 * block, a watering can, a seed packet, a rack with a grow light, a cutter
 * and a bowl — plus the particles (mist, water, crumbs) they throw.
 *
 * Modelled from primitives and lathed profiles, painted with canvas textures,
 * so the whole garden is code: no model files to fetch, nothing to licence,
 * and every prop can be tuned in a diff. Sizes are stylised against the tray
 * (`tray.ts`, 2 units ≈ the tray's 30 cm width) — a true-scale 5 kg coir
 * block would fill the frame.
 *
 * Words painted onto a prop (the sanitiser label) arrive from the caller
 * already translated, with the page's font, so Kannada renders in Kannada.
 */

export type Disposable = { dispose: () => void };

/** Track everything a prop allocates, so the scene can free it in one go. */
export class Bin {
  private items: Disposable[] = [];
  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }
  /** Every geometry under `root` — materials are shared and added by hand. */
  geometries(root: THREE.Object3D) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points)
        this.items.push(o.geometry);
    });
    return root;
  }
  dispose() {
    for (const d of this.items) d.dispose();
    this.items = [];
  }
}

export function canvasTexture(
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ bench */

/** A pale oak worktop, the full width of the view, its back edge meeting the
 *  panel's sand like a wall. Grain runs left to right. */
export function bench(bin: Bin, rand: () => number) {
  const tex = bin.add(
    canvasTexture(1024, 512, (g) => {
      g.fillStyle = "#d2b48f";
      g.fillRect(0, 0, 1024, 512);
      for (let k = 0; k < 140; k++) {
        const y = rand() * 512;
        g.strokeStyle =
          rand() < 0.5 ? "rgba(120,80,45,0.14)" : "rgba(255,235,205,0.1)";
        g.lineWidth = 0.6 + rand() * 2.4;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 32) {
          g.lineTo(x, y + Math.sin(x * 0.006 + k) * 6 + (rand() - 0.5) * 1.5);
        }
        g.stroke();
      }
      /* Planks. */
      g.strokeStyle = "rgba(110,75,40,0.35)";
      g.lineWidth = 2;
      for (const y of [128, 256, 384]) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(1024, y);
        g.stroke();
      }
    }),
  );
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7.6, 2.9);
  tex.anisotropy = 8;
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      map: tex,
      color: "#c9bcae",
      roughness: 0.8,
      envMapIntensity: 0.15,
    }),
  );
  /* Deep toward the viewer, so a tall phone frame never sees its front edge;
     the back edge stays put, where it meets the panel like a wall. Wide
     enough for the dark step's walk left to the dark room's door and the
     rack beside it. */
  const top = new THREE.Mesh(
    bin.add(new RoundedBoxGeometry(76, 0.24, 12, 2, 0.06)),
    mat,
  );
  top.position.set(0, -0.12, 2.6);
  return top;
}

/** A soft round shadow, for a prop standing on the bench. */
export function blobShadowTexture(bin: Bin) {
  return bin.add(
    canvasTexture(128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, "rgba(70,45,20,0.5)");
      grad.addColorStop(1, "rgba(70,45,20,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }),
  );
}

export function blobShadow(bin: Bin, tex: THREE.Texture, w: number, d: number) {
  const mat = bin.add(
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  const m = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(w, d)), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  m.renderOrder = -1;
  return m;
}

/* ----------------------------------------------------------- spray bottle */

/** White HDPE trigger sprayer with a printed band. Its nozzle points along
 *  local +z, so `lookAt` aims it. Origin at the base. */
export function sprayBottle(bin: Bin, label: string, font: string) {
  const group = new THREE.Group();
  const plastic = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#f4f4ef",
      roughness: 0.35,
      envMapIntensity: 0.6,
    }),
  );
  /* A trigger sprayer's bottle: widest at the foot, tapering up into a
     rounded shoulder and a short neck. */
  const profile = [
    [0, 0],
    [0.2, 0],
    [0.215, 0.02],
    [0.215, 0.07],
    [0.205, 0.3],
    [0.188, 0.5],
    [0.165, 0.6],
    [0.13, 0.69],
    [0.09, 0.76],
    [0.08, 0.8],
    [0, 0.8],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  group.add(
    new THREE.Mesh(bin.add(new THREE.LatheGeometry(profile, 32)), plastic),
  );

  /* The words run along the bottle, not round it, because it lies on the
     bench label up (scene.ts) and that is when it is read. The band is
     0.5 tall and 2π·0.193 round; the canvas is 1024 × 512 over that, so a
     glyph drawn turned is squeezed by the ratio of the two to stay true. */
  const BAND_H = 0.4;
  const ROUND = 2 * Math.PI * 0.2;
  const labelTex = bin.add(
    canvasTexture(1024, 512, (g) => {
      g.fillStyle = "#033923";
      g.fillRect(0, 0, 1024, 512);
      g.save();
      g.translate(512, 256);
      g.rotate(-Math.PI / 2);
      g.scale(1, 1024 / ROUND / (512 / BAND_H));
      g.fillStyle = "#a8cf8e";
      g.fillRect(-236, -150, 472, 5);
      g.fillRect(-236, 145, 472, 5);
      g.fillStyle = "#fbf9f3";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const words = label.split(" ");
      const cut = Math.ceil(words.length / 2);
      const lines =
        words.length > 2
          ? [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]
          : [label];
      g.font = `700 ${lines.length > 1 ? 66 : 76}px ${font}`;
      lines.forEach((line, n) =>
        g.fillText(line, 0, (n - (lines.length - 1) / 2) * 92, 450),
      );
      g.restore();
    }),
  );
  const band = new THREE.Mesh(
    /* Following the taper, a hair proud of the body. */
    bin.add(new THREE.CylinderGeometry(0.195, 0.221, BAND_H, 40, 1, true)),
    bin.add(
      new THREE.MeshStandardMaterial({
        map: labelTex,
        roughness: 0.5,
        envMapIntensity: 0.3,
      }),
    ),
  );
  band.position.y = 0.3;
  /* The middle of the canvas wraps to −z; turn it to +x, a quarter turn
     from the nozzle (+z), so the bottle can lie with the label up and the
     spray head side on (scene.ts). */
  band.rotation.y = -Math.PI / 2;
  group.add(band);

  const headMat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#2f7d3b",
      roughness: 0.35,
      envMapIntensity: 0.5,
    }),
  );
  /* The foot ring, the ribbed collar, the trigger and the nozzle tip in the
     one accent, as on a real sprayer. */
  const accent = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#a8cf8e",
      roughness: 0.45,
      envMapIntensity: 0.4,
    }),
  );
  const foot = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.218, 0.218, 0.06, 40)),
    accent,
  );
  foot.position.y = 0.035;
  group.add(foot);

  const collar = new THREE.Group();
  collar.position.y = 0.84;
  collar.add(
    new THREE.Mesh(
      bin.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 24)),
      accent,
    ),
  );
  const rib = bin.add(new THREE.BoxGeometry(0.018, 0.09, 0.018));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = new THREE.Mesh(rib, accent);
    r.position.set(Math.sin(a) * 0.1, 0, Math.cos(a) * 0.1);
    r.rotation.y = a;
    collar.add(r);
  }
  group.add(collar);

  const stem = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 20)),
    headMat,
  );
  stem.position.y = 0.93;
  group.add(stem);

  /* A side profile, extruded across: drawn in (z, y) with the nozzle end
     forward (+z), then turned so the drawing's x runs along z. */
  const side = (points: [number, number][], width: number) => {
    const shape = new THREE.Shape(
      points.map(([z, y]) => new THREE.Vector2(z, y)),
    );
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 8,
    });
    g.translate(0, 0, -width / 2);
    g.rotateY(-Math.PI / 2);
    return bin.add(g);
  };
  /* The shroud: high at the back, sloping down to the nozzle. */
  const shroud = new THREE.Mesh(
    side(
      [
        [-0.13, 0.95],
        [-0.13, 1.03],
        [-0.06, 1.08],
        [0.12, 1.06],
        [0.28, 1.01],
        [0.3, 0.97],
        [0.28, 0.94],
        [0.06, 0.94],
        [-0.04, 0.92],
      ],
      0.12,
    ),
    headMat,
  );
  group.add(shroud);
  const tip = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.04, 0.045, 0.07, 16)),
    accent,
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.975, 0.33);
  group.add(tip);

  /* The trigger hangs from a pivot under the shroud, curving forward, so
     the scene can squeeze it by turning the pivot. */
  const trigger = new THREE.Group();
  trigger.position.set(0, 0.94, 0.16);
  trigger.rotation.x = 0.35;
  trigger.name = "trigger";
  trigger.add(
    new THREE.Mesh(
      side(
        [
          [-0.02, 0],
          [0.03, 0],
          [0.09, -0.08],
          [0.12, -0.2],
          [0.1, -0.24],
          [0.07, -0.21],
          [0.04, -0.1],
          [-0.02, -0.04],
        ],
        0.05,
      ),
      accent,
    ),
  );
  group.add(trigger);
  return group;
}

/** Where the bottle's mist leaves it, in its own space. */
export const NOZZLE = new THREE.Vector3(0, 0.975, 0.37);

/* ------------------------------------------------------------------ cloth */

/**
 * A folded cotton cloth: cream terry with a green stripe, soft-edged and
 * rumpled — a box with its top pushed about and its edges rolled, because a
 * flat slab read as a card.
 */
export function cloth(bin: Bin, rand: () => number) {
  const tex = bin.add(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = "#efe8d8";
      g.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 9000; k++) {
        g.fillStyle =
          rand() < 0.5 ? "rgba(255,255,255,0.55)" : "rgba(160,145,120,0.28)";
        g.beginPath();
        g.arc(rand() * 256, rand() * 256, 0.6 + rand() * 0.9, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(47,125,59,0.8)";
      g.fillRect(0, 176, 256, 16);
      g.fillRect(0, 200, 256, 6);
    }),
  );
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 1,
      envMapIntensity: 0.05,
    }),
  );
  const geo = bin.add(new THREE.BoxGeometry(0.64, 0.1, 0.48, 18, 3, 14));
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    let y = pos.getY(k);
    const z = pos.getZ(k);
    const ex = Math.abs(x) / 0.32;
    const ez = Math.abs(z) / 0.24;
    const edge = Math.max(ex, ez);
    /* Rolled edges: thinner toward the rim. */
    y *= 1 - (0.55 * Math.max(0, edge - 0.75)) / 0.25;
    if (y > 0)
      y += 0.012 * Math.sin(x * 23 + z * 9) + 0.008 * Math.sin(z * 31 - x * 5);
    pos.setXYZ(k, x * (1 + 0.03 * Math.sin(z * 12)), y + 0.05, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/* ------------------------------------------------------- basin and block */

export const BASIN_R = 0.72;
export const BASIN_H = 0.34;

/** A round grey tub for soaking the block. Origin at the base centre. */
export function basin(bin: Bin) {
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#c9cdc6",
      roughness: 0.5,
      envMapIntensity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  const profile = [
    [0, 0.02],
    [BASIN_R - 0.12, 0.02],
    [BASIN_R - 0.06, 0.04],
    [BASIN_R - 0.02, BASIN_H - 0.02],
    [BASIN_R + 0.03, BASIN_H],
    [BASIN_R + 0.05, BASIN_H - 0.03],
    [BASIN_R - 0.06, 0.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(profile, 48)), mat));
  return g;
}

/** The tray the grow tray is sanitised in: a wide, shallow blue tray with
 *  a handle at each short end, filled with a solution of water and
 *  food-grade hydrogen peroxide. The surface is a child named `water`. */
export const DIP = { w: 2.75, d: 3.25, h: 0.42, water: 0.34 };
/** Words printed on a prop: a transparent plane of cream type, `w` by `h`,
 *  squeezed to fit its width rather than wrapped or cut. */
function printed(bin: Bin, text: string, font: string, w: number, h: number) {
  return new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(w, h)),
    bin.add(
      new THREE.MeshStandardMaterial({
        map: bin.add(
          canvasTexture(2048, Math.round(2048 * (h / w)), (c) => {
            const { width, height } = c.canvas;
            c.fillStyle = "#fbf9f3";
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.font = `700 ${Math.round(height * 0.58)}px ${font}`;
            c.fillText(text, width / 2, height / 2, width * 0.96);
          }),
        ),
        transparent: true,
        roughness: 0.5,
        envMapIntensity: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    ),
  );
}

/** What a tray pair is made of, printed into the front wall of its water
 *  tray as a maker moulds it (the owner, 3 Oct 2026: "like it is embedded
 *  on the tray"), leaning with the wall like the tub's print. A child of
 *  the water tray, so it goes when that tray does. */
export function trayPrint(bin: Bin, text: string, font: string) {
  const print = printed(bin, text, font, TRAY_W * 0.85, 0.17);
  print.rotation.x = Math.atan2(0.04, TRAY_H);
  print.position.set(
    0,
    TRAY_H * 0.47,
    (TRAY_D + 2 * WATER_MARGIN) / 2 - 0.075 + 0.02 + 0.006,
  );
  return print;
}

export function dipTub(bin: Bin, label: string, font: string) {
  const g = new THREE.Group();
  const plastic = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#5b78d4",
      roughness: 0.4,
      envMapIntensity: 0.55,
    }),
  );
  g.add(new THREE.Mesh(bin.add(trayGeometry(DIP.w, DIP.d, DIP.h)), plastic));
  const floor = new THREE.Mesh(
    bin.add(roundedRect(DIP.w / 2 - 0.08, DIP.d / 2 - 0.08, 0.12)),
    bin.add(
      new THREE.MeshStandardMaterial({
        color: "#6f88d8",
        roughness: 0.6,
        envMapIntensity: 0.3,
      }),
    ),
  );
  floor.position.y = 0.012;
  g.add(floor);
  /* The solution: a finely divided sheet, bent each frame by
     `rippleWater`, so the light slides over slow, crossing waves. */
  const geo = new THREE.PlaneGeometry(DIP.w - 0.16, DIP.d - 0.16, 44, 52);
  geo.rotateX(-Math.PI / 2);
  geo.userData.rest = Float32Array.from(
    geo.getAttribute("position").array as Float32Array,
  );
  const waterMat = bin.add(
    new THREE.MeshPhysicalMaterial({
      color: "#6f93e3",
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  /* Soft bright bands drifting over the surface — light caught by the
     waves — added in the shader so they move with no texture to tile. */
  const uTime = { value: 0 };
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWaterXZ;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWaterXZ = position.xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vWaterXZ;\nuniform float uTime;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec2 q = vWaterXZ * 2.2;
        float w = sin(q.x * 1.7 + uTime * 0.9 + sin(q.y * 1.3 + uTime * 0.6) * 1.6)
                + sin(q.y * 2.1 - uTime * 0.7 + sin(q.x * 1.1 - uTime * 0.5) * 1.4);
        float band = smoothstep(1.1, 1.9, w);
        vec2 r = vWaterXZ * 7.0;
        float fine = sin(r.x + uTime * 1.6 + sin(r.y * 0.8 + uTime) * 2.0)
                   * sin(r.y * 1.2 - uTime * 1.3 + sin(r.x * 0.7) * 1.5);
        totalEmissiveRadiance += vec3(0.55, 0.66, 0.85)
          * (band * 0.4 + smoothstep(0.55, 0.95, fine) * 0.16);`,
      );
  };
  waterMat.userData.time = uTime;
  const water = new THREE.Mesh(bin.add(geo), waterMat);
  water.position.y = DIP.water;
  water.renderOrder = 2;
  water.name = "water";
  g.add(water);
  /* A loop handle on each short end. */
  const handle = bin.add(new THREE.TorusGeometry(0.22, 0.035, 10, 24, Math.PI));
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(handle, plastic);
    /* The half ring, turned to bulge outward from the end. */
    h.rotation.z = -side * (Math.PI / 2);
    h.position.set(side * (DIP.w / 2 - 0.02), DIP.h - 0.12, 0);
    g.add(h);
  }
  /* The solution's name, printed on the front wall facing the visitor, as
     a tub of it would be labelled. The wall leans out by the tray's flare
     (0.04 over its height), so the print leans with it, a hair proud. */
  const print = printed(bin, label, font, DIP.w - 0.5, 0.2);
  const lean = Math.atan2(0.04, DIP.h);
  print.rotation.x = lean;
  print.position.set(0, DIP.h * 0.47, DIP.d / 2 - 0.075 + 0.02 + 0.006);
  g.add(print);
  return g;
}

/** Move the solution's surface: a few slow sine waves crossing at angles,
 *  small enough to read as a liquid settling rather than a sea. `stir`
 *  (0–1) adds a ring spreading from the middle, for a tray dropped in. */
export function rippleWater(water: THREE.Mesh, time: number, stir = 0) {
  const geo = water.geometry as THREE.BufferGeometry;
  const rest = geo.userData.rest as Float32Array;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const a = pos.array as Float32Array;
  for (let k = 0; k < a.length; k += 3) {
    const x = rest[k];
    const z = rest[k + 2];
    let y =
      0.012 * Math.sin(x * 3.1 + time * 1.1) +
      0.009 * Math.sin(z * 2.6 - time * 0.8 + x * 1.3) +
      0.006 * Math.sin((x + z) * 5.2 + time * 1.7);
    if (stir > 0) {
      const r = Math.hypot(x, z);
      y += 0.05 * stir * Math.sin(r * 9 - time * 9) * Math.exp(-r * 0.8);
    }
    a[k + 1] = y;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const t = (water.material as THREE.Material).userData.time as
    { value: number } | undefined;
  if (t) t.value = time;
}

/** Inner radius of the basin at height `y`, for the water's surface. */
export function basinRadiusAt(y: number) {
  const t = THREE.MathUtils.clamp((y - 0.04) / (BASIN_H - 0.06), 0, 1);
  return BASIN_R - 0.06 + 0.04 * t;
}

/** Block half-extents when dry and pressed. */
export const BLOCK = { hx: 0.36, hy: 0.11, hz: 0.25 };

/**
 * The coco peat as one deformable mesh: a pressed brick that swells as it
 * drinks, then slumps into a loose mound as it is crumbled, then shrinks as
 * it is scooped out. `shapeBlock` moves its vertices; nothing is swapped, so
 * the change reads as the same stuff changing.
 */
export function peatBlock(bin: Bin, tex: THREE.Texture) {
  const geo = bin.add(
    new THREE.BoxGeometry(BLOCK.hx * 2, BLOCK.hy * 2, BLOCK.hz * 2, 14, 6, 10),
  );
  const rest = Float32Array.from(
    geo.getAttribute("position").array as Float32Array,
  );
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      map: tex,
      color: "#c7955f",
      roughness: 1,
      envMapIntensity: 0,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, rest, mat };
}

const DRY = new THREE.Color("#c7955f");
const WET = new THREE.Color("#5a3d29");

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Pose the block: `swell` 0 → 1 as it drinks, `crumble` 0 → 1 as it loosens,
 * `left` 1 → 0 as it is scooped out. Base sits at y = 0.
 */
export function shapeBlock(
  block: ReturnType<typeof peatBlock>,
  swell: number,
  crumble: number,
  left: number,
) {
  const pos = block.mesh.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const r = block.rest;
  /* Swollen: taller and a little wider, its faces bulging and fibrous. */
  const sx = 1 + 0.32 * swell;
  const sy = 1 + 1.25 * swell;
  const sz = 1 + 0.38 * swell;
  /* The mound it crumbles to, and how much of it is left. */
  const R = 0.62 * Math.sqrt(Math.max(left, 0.02));
  const H = 0.34 * Math.cbrt(Math.max(left, 0.02));
  for (let k = 0; k < pos.count; k++) {
    const x = r[k * 3];
    const y = r[k * 3 + 1];
    const z = r[k * 3 + 2];
    const n = hash3(x * 9, y * 9, z * 9);
    const bulge =
      1 + swell * (0.1 * (1 - Math.abs(y) / BLOCK.hy) + 0.05 * (n - 0.5));
    const bx = x * sx * bulge;
    const by = (y + BLOCK.hy) * sy;
    const bz = z * sz * bulge;
    /* Mound: the block's footprint spread out, its height a dome. */
    const rho = Math.min(
      1,
      Math.max(Math.abs(x) / BLOCK.hx, Math.abs(z) / BLOCK.hz),
    );
    const ang = Math.atan2(z / BLOCK.hz, x / BLOCK.hx);
    const top = (y + BLOCK.hy) / (2 * BLOCK.hy);
    const mr = R * (rho * 0.92 + 0.08 * n);
    const mx = Math.cos(ang) * mr;
    const mz = Math.sin(ang) * mr;
    const my =
      top * H * Math.pow(Math.max(0, 1 - rho * rho), 0.6) * (0.85 + 0.3 * n);
    pos.setXYZ(
      k,
      THREE.MathUtils.lerp(bx, mx, crumble),
      THREE.MathUtils.lerp(by, my, crumble),
      THREE.MathUtils.lerp(bz, mz, crumble),
    );
  }
  pos.needsUpdate = true;
  block.mesh.geometry.computeVertexNormals();
  block.mat.color.copy(DRY).lerp(WET, Math.min(1, swell * 1.2));
}

/* --------------------------------------------------------- watering can */

/** A green plastic can: a squarish body that narrows to its top, a darker
 *  band round the foot, a long thin spout curving up from low at the front
 *  and a loop handle over the back. Spout tip at `SPOUT` in its own space,
 *  pointing +x. */
export function wateringCan(bin: Bin, label: string, font: string) {
  const g = new THREE.Group();
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#4f9a3c",
      roughness: 0.35,
      envMapIntensity: 0.55,
    }),
  );
  const dark = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#3a7a2c",
      roughness: 0.4,
      envMapIntensity: 0.45,
    }),
  );
  const DEPTH = 0.3;
  /* A side profile in (x, y), extruded across z and centred. */
  const slab = (points: [number, number][], depth: number, bevel: number) => {
    const shape = new THREE.Shape(
      points.map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
    });
    geo.translate(0, 0, -depth / 2);
    return bin.add(geo);
  };
  /* The foot: chamfered in at the very bottom. */
  g.add(
    new THREE.Mesh(
      slab(
        [
          [-0.2, 0.02],
          [0.2, 0.02],
          [0.26, 0.09],
          [0.26, 0.15],
          [-0.26, 0.15],
          [-0.26, 0.09],
        ],
        DEPTH + 0.02,
        0.02,
      ),
      dark,
    ),
  );
  /* The body: sloping in to a flat top. */
  g.add(
    new THREE.Mesh(
      slab(
        [
          [-0.25, 0.15],
          [0.25, 0.15],
          [0.15, 0.5],
          [-0.13, 0.5],
        ],
        DEPTH - 0.04,
        0.03,
      ),
      mat,
    ),
  );
  const mouth = new THREE.Mesh(
    bin.add(new THREE.CircleGeometry(0.07, 20)),
    bin.add(
      new THREE.MeshStandardMaterial({ color: "#1d3a16", roughness: 0.9 }),
    ),
  );
  mouth.rotation.x = -Math.PI / 2;
  /* The filler sits forward on the top, toward the spout, so the
     handle's root at the back edge stands clear of it. */
  mouth.scale.set(0.95, 0.7, 1);
  mouth.position.set(0.065, 0.532, 0);
  g.add(mouth);

  const tube = (pts: [number, number][], r: number) =>
    bin.add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
        ),
        40,
        r,
        10,
        false,
      ),
    );
  g.add(
    new THREE.Mesh(
      tube(
        [
          [0.16, 0.2],
          [0.3, 0.22],
          [0.42, 0.32],
          [0.52, 0.48],
          [0.64, 0.6],
          [0.74, 0.64],
        ],
        0.028,
      ),
      mat,
    ),
  );
  /* A flattened lip at the tip. */
  const lip = new THREE.Mesh(
    bin.add(new THREE.CylinderGeometry(0.036, 0.028, 0.05, 12)),
    mat,
  );
  lip.rotation.z = -1.3;
  lip.position.set(0.76, 0.646, 0);
  g.add(lip);
  /* The loop: up from the back of the top, over and down to the back of
     the body near the foot. */
  g.add(
    new THREE.Mesh(
      tube(
        [
          [-0.095, 0.48],
          [-0.09, 0.68],
          [-0.2, 0.83],
          [-0.38, 0.8],
          [-0.5, 0.6],
          [-0.47, 0.38],
          [-0.34, 0.22],
          [-0.22, 0.2],
        ],
        0.032,
      ),
      mat,
    ),
  );
  /* What it holds, on both faces of the body, since it is turned either
     way on the bench and in the hand. Sized to the band where the body is
     still wide, low on its slope. */
  for (const side of [-1, 1]) {
    const words = printed(bin, label, font, 0.34, 0.075);
    words.position.set(0.005, 0.27, side * (DEPTH / 2 + 0.012));
    if (side < 0) words.rotation.y = Math.PI;
    g.add(words);
  }
  return g;
}

export const SPOUT = new THREE.Vector3(0.79, 0.655, 0);

/* ----------------------------------------------------------- seed packet */

/** A kraft paper packet with a band in the plant's own leaf colour, so
 *  three packets on the bench tell apart at a glance. */
/** The packet's size: a stand-up pouch, taller than wide. */
/** A third larger than first drawn, so the packet and its logo read on
 *  the bench (the owner, 3 Oct 2026). */
export const PACKET = { w: 0.8, h: 1.06, d: 0.14 };

/**
 * A Fewgrams seed pouch, as the packs are printed: white kraft-lined film,
 * a heat seal across the top, the logo, and a clear window onto the seeds
 * in their own colour. No words of ours are printed — the logo is the
 * brand's own artwork (`public/brand/fewgrams-logo.svg`), drawn in once it
 * loads; until then the pouch is plain white with its window.
 */
export function seedPacket(bin: Bin, rand: () => number, seed: string) {
  const W = 512;
  const H = Math.round((W * PACKET.h) / PACKET.w);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  /* The seeds behind the window, speckled once so a redraw keeps them. */
  const grains: [number, number, number, number, string][] = [];
  const base = new THREE.Color(seed);
  for (let k = 0; k < 900; k++) {
    const c = base.clone().offsetHSL(0, 0, (rand() - 0.4) * 0.22);
    grains.push([
      rand(),
      rand(),
      5 + rand() * 4,
      rand() * Math.PI,
      `#${c.getHexString()}`,
    ]);
  }
  let logo: HTMLCanvasElement | null = null;
  const paint = () => {
    g.fillStyle = "#fbfbf8";
    g.fillRect(0, 0, W, H);
    /* The heat seal and zip, faint lines across the top. */
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(0, H * 0.035, W, 3);
    g.fillRect(0, H * 0.075, W, 2);
    if (logo) {
      const lw = W * 0.7;
      const lh = (lw * 1788) / 2112;
      g.drawImage(logo, (W - lw) / 2, H * 0.1, lw, lh);
    }
    /* The window. */
    const wx = W * 0.12;
    const wy = H * 0.58;
    const ww = W * 0.76;
    const wh = H * 0.2;
    g.save();
    g.beginPath();
    g.roundRect(wx, wy, ww, wh, 8);
    g.clip();
    g.fillStyle = seed;
    g.fillRect(wx, wy, ww, wh);
    for (const [u, v, r, a, c] of grains) {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(wx + u * ww, wy + v * wh, r, r * 0.7, a, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = "rgba(0,0,0,0.12)";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(wx, wy, ww, wh, 8);
    g.stroke();
  };
  paint();
  const tex = bin.add(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    /* The brand's light green and tan wash out on white film under the
       room's light, so the logo is printed a shade deeper: drawn once,
       then tinted toward forest over its own shape (`source-atop`), which
       keeps its two colours apart. */
    const ink = document.createElement("canvas");
    ink.width = 1056;
    ink.height = 894;
    const c = ink.getContext("2d")!;
    c.drawImage(img, 0, 0, ink.width, ink.height);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(20, 52, 32, 0.38)";
    c.fillRect(0, 0, ink.width, ink.height);
    logo = ink;
    paint();
    tex.needsUpdate = true;
  };
  img.src = "/brand/fewgrams-logo.svg";
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      envMapIntensity: 0.35,
    }),
  );
  const m = new THREE.Mesh(
    bin.add(new RoundedBoxGeometry(PACKET.w, PACKET.h, PACKET.d, 3, 0.03)),
    mat,
  );
  const group = new THREE.Group();
  m.position.y = PACKET.h / 2;
  group.add(m);
  return group;
}

/* ------------------------------------------------------ rack and light */

/** The rack we sell (`/shop/racks`, SPEC §19), as the light step shows
 *  it: four orange slotted-angle legs, white plate shelves bolted to them,
 *  black feet, and a grow light under each plate but the lowest. Sized to
 *  the tray, a 4 ft rack of three 2 × 3 ft plates — as tall as the dark
 *  room's door beside it (`DOOR.h`), so the two read as one room. */
export const SHELF_RACK = {
  w: 4.8,
  d: 3.1,
  /** Each plate's top, from the floor. */
  shelves: [0.45, 2.8, 5.15],
  h: 5.25,
};

/**
 * `ours` is the shelf the visitor's tray goes on: the light over it
 * starts off (`diffuserMat`, `beamMat`) for the visitor to switch on, and
 * `batten` is what they click. Every other light is already on.
 */
/** The open sides of a wedge of light, `h` tall: a `tw` by `td`
 *  half-size rectangle at the top widening to `bw` by `bd` at the foot.
 *  Its texture runs bright at the top (v = 1) to nothing at the foot. */
function lightWedge(tw: number, td: number, bw: number, bd: number, h: number) {
  const top = h / 2;
  const foot = -h / 2;
  /* Each side: top left, top right, foot left, foot right. */
  const sides: [number, number, number][][] = [
    [
      [-tw, top, td],
      [tw, top, td],
      [-bw, foot, bd],
      [bw, foot, bd],
    ],
    [
      [tw, top, -td],
      [-tw, top, -td],
      [bw, foot, -bd],
      [-bw, foot, -bd],
    ],
    [
      [-tw, top, -td],
      [-tw, top, td],
      [-bw, foot, -bd],
      [-bw, foot, bd],
    ],
    [
      [tw, top, td],
      [tw, top, -td],
      [bw, foot, bd],
      [bw, foot, -bd],
    ],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  sides.forEach((q, k) => {
    for (const v of q) pos.push(...v);
    uv.push(0, 1, 1, 1, 0, 0, 1, 0);
    const o = k * 4;
    index.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

export function shelfRack(bin: Bin, ours: number) {
  const { w, d, shelves, h } = SHELF_RACK;
  const g = new THREE.Group();
  /* Slotted angle: orange, with its rows of slots. */
  const slots = bin.add(
    canvasTexture(64, 256, (c) => {
      c.fillStyle = "#e8692a";
      c.fillRect(0, 0, 64, 256);
      c.fillStyle = "#3b1a0c";
      for (let y = 10; y < 256; y += 64) {
        c.beginPath();
        c.roundRect(24, y, 16, 44, 8);
        c.fill();
      }
    }),
  );
  slots.wrapT = THREE.RepeatWrapping;
  slots.repeat.set(1, h / 0.55);
  const orange = bin.add(
    new THREE.MeshStandardMaterial({
      map: slots,
      roughness: 0.45,
      metalness: 0.2,
      envMapIntensity: 0.5,
    }),
  );
  const flange = bin.add(new THREE.BoxGeometry(0.22, h, 0.025));
  const flangeSide = bin.add(new THREE.BoxGeometry(0.025, h, 0.22));
  const rubber = bin.add(
    new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 }),
  );
  const foot = bin.add(new THREE.BoxGeometry(0.26, 0.08, 0.26));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = (sx * w) / 2;
      const z = (sz * d) / 2;
      /* An L in plan, its corner outward. */
      const a = new THREE.Mesh(flange, orange);
      a.position.set(x - sx * 0.1, h / 2, z);
      const b = new THREE.Mesh(flangeSide, orange);
      b.position.set(x, h / 2, z - sz * 0.1);
      const f = new THREE.Mesh(foot, rubber);
      f.position.set(x - sx * 0.08, 0.04, z - sz * 0.08);
      g.add(a, b, f);
    }
  }
  /* White plates with turned-down edges, a bolt at each corner. */
  const white = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#f2f2ef",
      roughness: 0.35,
      envMapIntensity: 0.6,
    }),
  );
  const steelBolt = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#c9cbc8",
      roughness: 0.3,
      metalness: 0.8,
    }),
  );
  const plate = bin.add(new THREE.BoxGeometry(w - 0.06, 0.04, d - 0.06));
  const lipX = bin.add(new THREE.BoxGeometry(w - 0.06, 0.16, 0.03));
  const lipZ = bin.add(new THREE.BoxGeometry(0.03, 0.16, d - 0.06));
  const bolt = bin.add(new THREE.SphereGeometry(0.045, 10, 8));
  for (const y of shelves) {
    const p = new THREE.Mesh(plate, white);
    p.position.y = y - 0.02;
    g.add(p);
    for (const s of [-1, 1]) {
      const lx = new THREE.Mesh(lipX, white);
      lx.position.set(0, y - 0.08, (s * (d - 0.06)) / 2);
      const lz = new THREE.Mesh(lipZ, white);
      lz.position.set((s * (w - 0.06)) / 2, y - 0.08, 0);
      g.add(lx, lz);
      for (const t of [-1, 1]) {
        const b = new THREE.Mesh(bolt, steelBolt);
        b.position.set((s * w) / 2 - s * 0.1, y - 0.07, (t * d) / 2 + t * 0.02);
        g.add(b);
      }
    }
  }

  /* A light under each plate above a shelf: a tube in a white housing and
     a soft additive wedge down to the shelf. */
  const beamTex = bin.add(
    canvasTexture(64, 256, (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(255,250,225,0.9)");
      grad.addColorStop(1, "rgba(255,250,225,0)");
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 256);
    }),
  );
  const beamOf = (opacity: number) =>
    bin.add(
      new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
  /* A tube light under each plate: a white tube in grey end caps, held up
     on two clips below the plate's turned-down edge so it is seen. */
  const capMat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#9a9d98",
      roughness: 0.4,
      metalness: 0.3,
    }),
  );
  const TUBE = w * 0.74;
  const tubeGeo = bin.add(new THREE.CylinderGeometry(0.06, 0.06, TUBE, 20));
  tubeGeo.rotateZ(Math.PI / 2);
  const capGeo = bin.add(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 20));
  capGeo.rotateZ(Math.PI / 2);
  const clipGeo = bin.add(new THREE.BoxGeometry(0.05, 0.2, 0.06));
  const litMat = bin.add(new THREE.MeshBasicMaterial({ color: "#fffbe9" }));
  const litBeam = beamOf(0.26);
  const diffuserMat = bin.add(
    new THREE.MeshBasicMaterial({ color: "#c9ccc6" }),
  );
  const beamMat = beamOf(0);
  let batten = new THREE.Group();
  for (let i = 0; i < shelves.length - 1; i++) {
    const mine = i === ours;
    const top = shelves[i + 1] - 0.36;
    const light = new THREE.Group();
    light.add(new THREE.Mesh(tubeGeo, mine ? diffuserMat : litMat));
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.x = (s * (TUBE + 0.1)) / 2;
      const clip = new THREE.Mesh(clipGeo, capMat);
      clip.position.set((s * (TUBE - 0.3)) / 2, 0.12, 0);
      light.add(cap, clip);
    }
    light.position.set(0, top, 0);
    g.add(light);
    const beamH = top - shelves[i] - 0.06;
    /* From the whole length of the tube, not a point under its middle
       (the owner, 3 Oct 2026), spreading to the shelf. */
    const beamGeo = bin.add(
      lightWedge(TUBE / 2, 0.06, w * 0.46, d * 0.4, beamH),
    );
    const beam = new THREE.Mesh(beamGeo, mine ? beamMat : litBeam);
    beam.position.y = top - 0.06 - beamH / 2;
    g.add(beam);
    if (mine) batten = light;
  }

  /* The switch for our shelf's light, on the front of the right front leg
     at hand height: a white plate with a rocker that tips when pressed, and
     an invisible pad round it so it is easy to hit. */
  const lightSwitch = new THREE.Group();
  const plateMat = bin.add(
    new THREE.MeshStandardMaterial({ color: "#f7f6f1", roughness: 0.4 }),
  );
  const rockerMat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#1f4a33",
      roughness: 0.35,
      emissive: "#8fe07a",
      emissiveIntensity: 0,
    }),
  );
  const swPlate = new THREE.Mesh(
    bin.add(new RoundedBoxGeometry(0.34, 0.5, 0.06, 2, 0.02)),
    plateMat,
  );
  const rocker = new THREE.Mesh(
    bin.add(new RoundedBoxGeometry(0.17, 0.27, 0.06, 2, 0.016)),
    rockerMat,
  );
  rocker.position.z = 0.04;
  /* Off: the bottom stands proud, to be pressed in for on (the owner,
     2 Oct 2026: down is on, up is off). */
  rocker.rotation.x = -0.22;
  const pad = new THREE.Mesh(
    bin.add(new THREE.BoxGeometry(0.6, 0.7, 0.2)),
    bin.add(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    ),
  );
  lightSwitch.add(swPlate, rocker, pad);
  lightSwitch.position.set(w / 2 - 0.1, shelves[ours] + 1.0, d / 2 + 0.06);
  g.add(lightSwitch);
  return {
    group: g,
    batten,
    diffuserMat,
    beamMat,
    shelves,
    lightSwitch,
    rocker,
    rockerMat,
  };
}

/* --------------------------------------------------------- cutter, bowl */

/** How far the cutter's blade reaches either side of its origin, in its own
 *  units: the origin is the middle of the exposed blade, so the strip a
 *  slice cuts is centred where it is held. */
export const CUTTER_BLADE = { from: -0.17, to: 0.17 };

/** A snap-off utility cutter lying flat (the owner, 2 Oct 2026: a cutter
 *  blade, not scissors — the harvest is a slice through the stems). The
 *  blade points −z with its edge on −x, the handle runs back toward +z, and
 *  the origin is the middle of the exposed blade. */
export function cutter(bin: Bin) {
  const g = new THREE.Group();
  const body = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#f2b31b",
      roughness: 0.45,
      envMapIntensity: 0.5,
    }),
  );
  const rubber = bin.add(
    new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.85 }),
  );
  const steel = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#e3e6e8",
      roughness: 0.18,
      metalness: 0.95,
      envMapIntensity: 1.1,
    }),
  );
  const score = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#8d9396",
      roughness: 0.4,
      metalness: 0.8,
    }),
  );
  /* A shape drawn in (x, z) seen from above, extruded `depth` up from y =
     0: the shape's y is the world's z. */
  const flat = (shape: THREE.Shape, depth: number, bevel = 0) => {
    const geo = bin.add(
      new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 12,
      }),
    );
    geo.rotateX(Math.PI / 2);
    geo.translate(0, depth + bevel, 0);
    return geo;
  };
  const rounded = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    r: number,
  ) => {
    const sh = new THREE.Shape();
    sh.moveTo(x0 + r, z0);
    sh.lineTo(x1 - r, z0);
    sh.quadraticCurveTo(x1, z0, x1, z0 + r);
    sh.lineTo(x1, z1 - r);
    sh.quadraticCurveTo(x1, z1, x1 - r, z1);
    sh.lineTo(x0 + r, z1);
    sh.quadraticCurveTo(x0, z1, x0, z1 - r);
    sh.lineTo(x0, z0 + r);
    sh.quadraticCurveTo(x0, z0, x0 + r, z0);
    return sh;
  };
  /* The blade, from inside the handle out to its angled tip; the back
     edge is on +x, so the point is on the cutting edge. */
  const W = 0.028;
  const blade = new THREE.Shape();
  blade.moveTo(-W, 0.3);
  blade.lineTo(W, 0.3);
  blade.lineTo(W, CUTTER_BLADE.from + 0.05);
  blade.lineTo(-W, CUTTER_BLADE.from);
  blade.lineTo(-W, 0.3);
  const bladeMesh = new THREE.Mesh(flat(blade, 0.004), steel);
  bladeMesh.position.y = 0.022;
  g.add(bladeMesh);
  /* Snap-off score lines, on the tip's angle. */
  const lineGeo = bin.add(new THREE.BoxGeometry(2 * W * 1.05, 0.001, 0.003));
  for (let k = 0; k < 3; k++) {
    const l = new THREE.Mesh(lineGeo, score);
    l.position.set(0, 0.0265, CUTTER_BLADE.from + 0.1 + k * 0.075);
    l.rotation.y = Math.atan2(0.05, 2 * W);
    g.add(l);
  }
  /* The metal nose the blade slides out of. */
  const nose = new THREE.Mesh(
    flat(
      rounded(-0.04, CUTTER_BLADE.to, 0.04, CUTTER_BLADE.to + 0.07, 0.012),
      0.032,
      0.004,
    ),
    steel,
  );
  nose.position.y = 0.006;
  g.add(nose);
  /* The handle, with a rubber grip down its length and the slider on
     top, near the front. */
  const handle = new THREE.Mesh(
    flat(
      rounded(-0.05, CUTTER_BLADE.to + 0.06, 0.05, CUTTER_BLADE.to + 0.5, 0.03),
      0.04,
      0.008,
    ),
    body,
  );
  g.add(handle);
  const gripPad = new THREE.Mesh(
    flat(
      rounded(
        -0.03,
        CUTTER_BLADE.to + 0.2,
        0.03,
        CUTTER_BLADE.to + 0.46,
        0.022,
      ),
      0.006,
      0.003,
    ),
    rubber,
  );
  gripPad.position.y = 0.05;
  g.add(gripPad);
  const slider = new THREE.Mesh(
    flat(
      rounded(
        -0.018,
        CUTTER_BLADE.to + 0.09,
        0.018,
        CUTTER_BLADE.to + 0.15,
        0.008,
      ),
      0.012,
      0.003,
    ),
    rubber,
  );
  slider.position.y = 0.05;
  g.add(slider);
  return g;
}

/** A white ceramic bowl for the harvest. Origin at the base. */
export function bowl(bin: Bin) {
  const mat = bin.add(
    new THREE.MeshStandardMaterial({
      color: "#f7f5ef",
      roughness: 0.18,
      envMapIntensity: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(
        0.16 + Math.sin(a) * 0.46,
        0.02 + (1 - Math.cos(a)) * 0.34,
      ),
    );
  }
  pts.unshift(new THREE.Vector2(0, 0.02));
  pts.push(new THREE.Vector2(0.64, 0.37), new THREE.Vector2(0.6, 0.35));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bin.add(new THREE.LatheGeometry(pts, 48)), mat));
  return g;
}

/* -------------------------------------------------------------- particles */

const PARTICLE_VERTEX = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSoft;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = vAlpha * (1.0 - smoothstep(1.0 - uSoft, 1.0, d));
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

/**
 * A pool of points that fly, fall and fade — mist, water and crumbs. Dead
 * particles are reused, so nothing is allocated while the scene runs.
 */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private span: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private next = 0;
  readonly uniforms: { uScale: { value: number } };

  constructor(
    bin: Bin,
    private max: number,
    color: string,
    private opts: {
      gravity: number;
      drag: number;
      soft: number;
      floor?: number;
      opacity: number;
    },
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.span = new Float32Array(max).fill(1);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    const geo = bin.add(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: 400 } };
    const mat = bin.add(
      new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...this.uniforms,
          uColor: { value: new THREE.Color(color) },
          uSoft: { value: opts.soft },
        },
      }),
    );
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = life;
    this.span[i] = life;
    this.size[i] = size;
  }

  /** True while anything is still alive. */
  update(dt: number) {
    const { gravity, drag, floor, opacity } = this.opts;
    let alive = false;
    const damp = Math.exp(-drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive = true;
      this.life[i] -= dt;
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - gravity * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (floor !== undefined && this.pos[i * 3 + 1] < floor) {
        this.pos[i * 3 + 1] = floor;
        this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
      }
      const t = Math.max(this.life[i], 0) / this.span[i];
      this.alpha[i] =
        opacity * Math.min(1, t * 3) * Math.min(1, (1 - t) * 12 + 0.2);
    }
    const geo = this.points.geometry;
    geo.getAttribute("position").needsUpdate = true;
    geo.getAttribute("aAlpha").needsUpdate = true;
    geo.getAttribute("aSize").needsUpdate = true;
    return alive;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.points.geometry.getAttribute("aAlpha").needsUpdate = true;
  }
}

/* ------------------------------------------------------- tray grime */

/**
 * Dust, smudges and old water marks on the grow tray's floor, as a canvas the
 * cloth erases from. `wet` is a second canvas of sanitiser droplets, drawn by
 * the spray and wiped away with the dirt.
 */
export function grime(rand: () => number) {
  const W = 256;
  const H = 320;
  const dirt = document.createElement("canvas");
  dirt.width = W;
  dirt.height = H;
  const g = dirt.getContext("2d")!;
  for (let k = 0; k < 26; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 20 + rand() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(150,138,115,0.38)");
    grad.addColorStop(1, "rgba(150,138,115,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = "rgba(170,160,140,0.28)";
    g.lineWidth = 1 + rand() * 1.5;
    g.beginPath();
    g.arc(rand() * W, rand() * H, 8 + rand() * 22, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 1800; k++) {
    g.fillStyle =
      rand() < 0.7 ? "rgba(150,135,110,0.55)" : "rgba(95,75,55,0.6)";
    const s = 0.6 + rand() * 1.4;
    g.fillRect(rand() * W, rand() * H, s, s);
  }
  const wet = document.createElement("canvas");
  wet.width = W;
  wet.height = H;
  return { dirt, wet, W, H };
}

/**
 * The physics behind the home page's tray — a grid of damped springs laid
 * over the trays, one cell per patch of greens.
 *
 * Each cell holds a **bend**: a 2D vector saying which way, and how far, the
 * stems standing on it lean (0 upright, 1 the most a stem will bow). A spring
 * pulls every bend back to zero and damping bleeds the wobble off, so a stem
 * that is pushed overshoots upright, sways back, and settles — which is what
 * makes it read as a living plant rather than a ripple shader.
 *
 * Neighbouring cells are coupled (a Laplacian term), so a hard swipe spreads
 * a little past the hand the way a real canopy jostles its neighbours.
 *
 * The stems themselves never see this module. The scene copies the grid into
 * a texture each frame and the vertex shader bends every stem by the cell it
 * stands in, so thousands of stems cost one small upload rather than
 * thousands of simulations.
 *
 * Pure numbers, no three.js, so it is unit-tested on its own.
 */

/** Natural frequency of a stem, in Hz. Two sways a second reads as a short,
 *  springy microgreen; lower turns it into tall grass. */
const FREQUENCY = 2.0;
/** Damping ratio. One small overshoot past upright, then still within about a
 *  second. At 0.16 a stem swung back two or three times and the tray read as
 *  bouncy rather than springy (the owner, 1 Oct 2026). */
const DAMPING_RATIO = 0.32;
/** How strongly a cell is pulled toward its neighbours' lean, per second². */
const COUPLING = 25;
/** A bend never exceeds this in length — a stem bows, it does not fold. */
const MAX_BEND = 1;

const STIFFNESS = (2 * Math.PI * FREQUENCY) ** 2;
const DAMPING = 2 * DAMPING_RATIO * 2 * Math.PI * FREQUENCY;

/** How far the hand reaches, in world units (a tray is about two across). */
export const BRUSH_RADIUS = 0.7;
/** How hard a moving hand drags stems along with it. Multiplied by speed
 *  squared, so a flick bends far more than a slow pass. */
const DRAG = 3.2;
/** Speed beyond which a swipe stops getting stronger, world units/s. */
const MAX_SPEED = 14;
/** A resting hand parts the stems under it: this is the outward push. */
const PUSH = 25;

/** Below this, in both bend and speed, a field counts as still — a lean of
 *  0.4% of a stem is under a pixel at any size the tray is drawn. */
const REST = 4e-3;

export type FieldRect = {
  minX: number;
  minZ: number;
  width: number;
  depth: number;
};

export type Field = {
  nx: number;
  nz: number;
  rect: FieldRect;
  /** Bend, interleaved x/z per cell. */
  bend: Float32Array;
  /** Bend velocity, interleaved x/z per cell. */
  vel: Float32Array;
};

export function createField(nx: number, nz: number, rect: FieldRect): Field {
  return {
    nx,
    nz,
    rect,
    bend: new Float32Array(nx * nz * 2),
    vel: new Float32Array(nx * nz * 2),
  };
}

/**
 * Advance the springs by `dt` seconds. Semi-implicit Euler — velocity first,
 * then position from the new velocity — which stays stable at these
 * stiffnesses for any step up to ~1/30 s. The scene steps at 1/120.
 */
export function stepField(field: Field, dt: number) {
  const { nx, nz, bend, vel } = field;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const c = (j * nx + i) * 2;
      /* Edge cells mirror themselves, so the trays' rims neither pull the
         canopy toward them nor push it away. */
      const l = (j * nx + (i > 0 ? i - 1 : i)) * 2;
      const r = (j * nx + (i < nx - 1 ? i + 1 : i)) * 2;
      const u = ((j > 0 ? j - 1 : j) * nx + i) * 2;
      const d = ((j < nz - 1 ? j + 1 : j) * nx + i) * 2;
      for (let k = 0; k < 2; k++) {
        const x = bend[c + k];
        const lap =
          bend[l + k] + bend[r + k] + bend[u + k] + bend[d + k] - 4 * x;
        vel[c + k] +=
          (-STIFFNESS * x - DAMPING * vel[c + k] + COUPLING * lap) * dt;
      }
    }
  }
  for (let c = 0; c < bend.length; c += 2) {
    let bx = bend[c] + vel[c] * dt;
    let bz = bend[c + 1] + vel[c + 1] * dt;
    const len = Math.hypot(bx, bz);
    if (len > MAX_BEND) {
      bx = (bx / len) * MAX_BEND;
      bz = (bz / len) * MAX_BEND;
      /* Hitting the limit is a stop, not a bounce: drop the outward part of
         the velocity so the stem does not keep pressing against it. */
      const out = (vel[c] * bx + vel[c + 1] * bz) / MAX_BEND;
      if (out > 0) {
        vel[c] -= (out * bx) / MAX_BEND;
        vel[c + 1] -= (out * bz) / MAX_BEND;
      }
    }
    bend[c] = bx;
    bend[c + 1] = bz;
  }
}

/**
 * The hand, for `dt` seconds at world point (`x`, `z`) moving at
 * (`vx`, `vz`) world units per second. Stems are dragged along the motion
 * and pushed outward from the centre; both fall off smoothly to nothing at
 * {@link BRUSH_RADIUS}.
 */
export function brush(
  field: Field,
  x: number,
  z: number,
  vx: number,
  vz: number,
  dt: number,
) {
  const { nx, nz, rect, vel } = field;
  const cellW = rect.width / nx;
  const cellD = rect.depth / nz;
  const i0 = Math.max(0, Math.floor((x - BRUSH_RADIUS - rect.minX) / cellW));
  const i1 = Math.min(
    nx - 1,
    Math.ceil((x + BRUSH_RADIUS - rect.minX) / cellW),
  );
  const j0 = Math.max(0, Math.floor((z - BRUSH_RADIUS - rect.minZ) / cellD));
  const j1 = Math.min(
    nz - 1,
    Math.ceil((z + BRUSH_RADIUS - rect.minZ) / cellD),
  );
  if (i0 > i1 || j0 > j1) return;

  const speed = Math.hypot(vx, vz);
  const drag = speed > 0 ? DRAG * Math.min(speed, MAX_SPEED) : 0;

  for (let j = j0; j <= j1; j++) {
    const cz = rect.minZ + (j + 0.5) * cellD;
    for (let i = i0; i <= i1; i++) {
      const cx = rect.minX + (i + 0.5) * cellW;
      const dx = cx - x;
      const dz = cz - z;
      const dist = Math.hypot(dx, dz);
      if (dist >= BRUSH_RADIUS) continue;
      /* The drag falls off steeply, so a swipe bends a narrow lane; the push
         falls off linearly, so a resting hand opens a soft, wide hollow. */
      const fall = 1 - dist / BRUSH_RADIUS;
      const pull = fall * fall * drag;
      const push = dist > 1e-6 ? (fall * PUSH) / dist : 0;
      const c = (j * nx + i) * 2;
      vel[c] += (pull * vx + push * dx) * dt;
      vel[c + 1] += (pull * vz + push * dz) * dt;
    }
  }
}

/** True once every stem is upright and still — the scene can stop uploading.
 *  Speed is divided by the angular frequency so both terms are in units of
 *  bend: a stem swinging at that speed would reach that far. */
export function isSettled(field: Field) {
  const { bend, vel } = field;
  const omega = 2 * Math.PI * FREQUENCY;
  for (let c = 0; c < bend.length; c++) {
    if (Math.abs(bend[c]) > REST || Math.abs(vel[c]) / omega > REST)
      return false;
  }
  return true;
}

/**
 * Pack the field into RGBA bytes for the shader: bend x and z mapped from
 * [-1, 1] to [0, 255], and in blue how fast the cell is moving — the leaves
 * flutter by that. Bytes rather than floats because float textures cannot be
 * linearly filtered on every phone, and 8 bits is far finer than a stem.
 */
export function packField(field: Field, out: Uint8Array) {
  const { bend, vel } = field;
  for (let c = 0, p = 0; c < bend.length; c += 2, p += 4) {
    out[p] = Math.round((bend[c] + 1) * 127.5);
    out[p + 1] = Math.round((bend[c + 1] + 1) * 127.5);
    out[p + 2] = Math.round(
      Math.min(1, Math.hypot(vel[c], vel[c + 1]) / 4) * 255,
    );
    out[p + 3] = 255;
  }
}

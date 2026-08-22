/**
 * Procedural fabric and thread surfaces, as pure maths.
 *
 * ThreadForm ships no fabric photographs or scans. Every surface in the
 * Studio is generated from the functions below, which means the assets are
 * original by construction, carry no licence question, add nothing to the
 * repository or the network payload, and can be unit-tested without a GPU —
 * the same split `frameGarment` and `artworkPlacement` already use.
 *
 * Each generator produces a **seamlessly tiling height field**: a square
 * `Float32Array` of surface heights in 0–1 which `heightFieldToNormalRgba`
 * converts into a tangent-space normal map. Height first, normals second, is
 * deliberate — a height field is something you can reason about ("a woven
 * thread is a rounded ridge that passes over and under its neighbour"),
 * whereas hand-authoring RGB normal values is not.
 *
 * There is no randomness here. Every value comes from the coordinate itself
 * or from a hash of it, so the same inputs always produce the same surface —
 * which is what lets the renderer cache textures by their parameters and
 * lets these tests assert on exact values.
 */

export type SurfaceKind = 'plain-weave' | 'knit-jersey' | 'embroidery-stitch';

export interface SurfaceDetail {
  /** Weight of the structural weave/knit/stitch itself. */
  fabric: number;
  /** Weight of a low-frequency undulation, the way real cloth never lies perfectly flat. */
  wrinkle: number;
  /** Weight of a fine fibre fuzz riding on top of the structure. */
  fiber: number;
}

const TAU = Math.PI * 2;

/**
 * Deterministic value hash in 0–1. Used instead of `Math.random` so a
 * surface is reproducible across sessions, machines and test runs.
 */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Bilinearly-interpolated value noise that wraps cleanly at `period`. */
function tileableNoise(u: number, v: number, period: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // Smoothstep the interpolant so the noise has no visible grid creases.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const wrap = (value: number) => ((value % period) + period) % period;
  const x1 = wrap(x0 + 1);
  const y1 = wrap(y0 + 1);
  const wx0 = wrap(x0);
  const wy0 = wrap(y0);

  const n00 = hash2(wx0, wy0);
  const n10 = hash2(x1, wy0);
  const n01 = hash2(wx0, y1);
  const n11 = hash2(x1, y1);

  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Plain weave — cotton.
 *
 * Warp threads run vertically, weft horizontally, and each passes over its
 * neighbour then under the next, giving the fine even chequer woven cotton
 * shows under raking light.
 *
 * The over/under weight is a cosine of `(u + v) * threads`, not a test of
 * whether the cell index is even. That matters: an index test is a *step*
 * function, so the surface jumped at every thread boundary rather than only
 * looking like it did. Baked into a normal map that reads as a hard grid
 * ruled across the whole garment — and it also broke tiling, because the
 * jump at the tile's edge was twice any step inside it. A real thread
 * physically rises and falls as it crosses its neighbours, so the continuous
 * form is both the correct model and the one that tiles.
 *
 * `threads` must be even, or the chequer would not line up with itself where
 * the tile repeats.
 */
function plainWeaveHeight(u: number, v: number, threads: number): number {
  // Each thread's cross-section is round: a half-sine across its own width,
  // reaching zero exactly where it meets its neighbour.
  const warpRidge = Math.sin(Math.PI * fract(u * threads));
  const weftRidge = Math.sin(Math.PI * fract(v * threads));

  // 1 where the warp is passing over, 0 where it is passing under, and
  // smoothly in between. Period two cells on both axes — the chequer.
  const warpOver = 0.5 + 0.5 * Math.cos(Math.PI * (u * threads + v * threads));

  // Whichever thread is underneath still shows, just lower.
  return warpRidge * (0.3 + 0.55 * warpOver) + weftRidge * (0.3 + 0.55 * (1 - warpOver));
}

/**
 * Knit jersey.
 *
 * A knit is built from columns of interlocking loops — wales running
 * vertically, courses stacked horizontally. The dominant read is therefore
 * *columnar*, which is exactly what separates it from a weave at a glance:
 * jersey has visible vertical ribbing where cotton has an even grid.
 */
function knitJerseyHeight(u: number, v: number, wales: number, courses: number): number {
  const walePhase = fract(u * wales);
  const coursePhase = fract(v * courses);

  // The ridge along a wale. Raised to a power below 1 so the top of the
  // loop is broad and its sides fall away quickly, like a real yarn column.
  const wale = Math.pow(Math.sin(Math.PI * walePhase), 0.75);

  // Loops in adjacent courses interlock, so the row boundary weaves left and
  // right across the wale rather than running straight.
  const chevron = 0.5 + 0.5 * Math.cos(TAU * (coursePhase + 0.22 * Math.sin(TAU * walePhase)));

  // The gap where one loop passes behind the next.
  const interlock = 0.72 + 0.28 * chevron;

  return wale * interlock;
}

/**
 * Satin stitch — embroidery.
 *
 * Satin stitching lays parallel threads side by side across a shape. Each
 * thread is a rounded ridge, and the slight twist along its length is what
 * makes embroidery glint differently as a garment turns. Generated running
 * along one axis; the renderer rotates the texture to the configured stitch
 * angle rather than baking a separate surface per angle.
 */
function embroideryStitchHeight(u: number, v: number, stitches: number): number {
  const stitchPhase = fract(u * stitches);
  const ridge = Math.pow(Math.sin(Math.PI * stitchPhase), 0.6);

  // Thread twist along the run of the stitch.
  const twist = 0.88 + 0.12 * Math.sin(TAU * v * stitches * 2 + stitchPhase * 3.1);

  return ridge * twist;
}

export interface HeightFieldSpec {
  kind: SurfaceKind;
  size: number;
  detail: SurfaceDetail;
}

/**
 * Builds one tile of a surface. `size` is the tile's resolution in pixels;
 * the tile is designed to be repeated many times across a garment, so it
 * does not need to be large — 256 carries the structure well and keeps both
 * generation time and GPU memory negligible.
 */
export function buildHeightField({ kind, size, detail }: HeightFieldSpec): Float32Array {
  const heights = new Float32Array(size * size);
  // `Math.max(0, NaN)` is NaN, so clamping alone does not make a weight safe.
  // A NaN weight would propagate into every height, then into every normal,
  // and render as a black garment.
  const weight = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
  const fabric = weight(detail.fabric);
  const wrinkle = weight(detail.wrinkle);
  const fiber = weight(detail.fiber);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;

      let structure: number;
      switch (kind) {
        case 'plain-weave':
          structure = plainWeaveHeight(u, v, 8);
          break;
        case 'knit-jersey':
          structure = knitJerseyHeight(u, v, 6, 5);
          break;
        case 'embroidery-stitch':
          structure = embroideryStitchHeight(u, v, 6);
          break;
      }

      // Cloth undulation, well below the structural frequency so it reads as
      // the fabric lying naturally rather than as noise.
      const undulation = tileableNoise(u, v, 2) - 0.5;
      // Fibre fuzz, well above it. Kept small: pushed further this stops
      // looking like cloth and starts looking like sandpaper.
      const fuzz = tileableNoise(u, v, size / 4) - 0.5;

      heights[y * size + x] =
        structure * fabric + undulation * wrinkle * 0.45 + fuzz * fiber * 0.12;
    }
  }

  return heights;
}

/**
 * Converts a height field into a tangent-space normal map, as RGBA bytes.
 *
 * Central differences give the surface slope at each texel; the normal is
 * the vector perpendicular to that slope. Neighbour lookups wrap, so the
 * result tiles as seamlessly as the height field it came from — without
 * that, every tile boundary would show as a hard line across the garment.
 */
export function heightFieldToNormalRgba(
  heights: Float32Array,
  size: number,
  strength = 1,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]!;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * size * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * size * 0.5;

      // The surface normal of a height field h(x, y) is (-dh/dx, -dh/dy, 1).
      let nx = -dx;
      let ny = -dy;
      const nz = 1;
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= length;
      ny /= length;
      const z = nz / length;

      const index = (y * size + x) * 4;
      rgba[index] = (nx * 0.5 + 0.5) * 255;
      rgba[index + 1] = (ny * 0.5 + 0.5) * 255;
      rgba[index + 2] = (z * 0.5 + 0.5) * 255;
      rgba[index + 3] = 255;
    }
  }

  return rgba;
}

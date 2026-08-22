import { describe, expect, it } from 'vitest';
import { buildHeightField, heightFieldToNormalRgba } from './surfaceHeightField';
import type { SurfaceDetail, SurfaceKind } from './surfaceHeightField';

const SIZE = 64;
const FULL: SurfaceDetail = { fabric: 1, wrinkle: 0.3, fiber: 0.4 };
const STRUCTURE_ONLY: SurfaceDetail = { fabric: 1, wrinkle: 0, fiber: 0 };

function field(kind: SurfaceKind, detail: SurfaceDetail = FULL, size = SIZE): Float32Array {
  return buildHeightField({ kind, size, detail });
}

function at(heights: Float32Array, size: number, x: number, y: number): number {
  return heights[y * size + x]!;
}

/** Mean absolute difference between a row/column and itself shifted by one. */
function variationAlong(
  heights: Float32Array,
  size: number,
  axis: 'x' | 'y',
  line: number,
): number {
  let total = 0;
  for (let i = 0; i < size; i += 1) {
    const a = axis === 'x' ? at(heights, size, i, line) : at(heights, size, line, i);
    const next =
      axis === 'x'
        ? at(heights, size, (i + 1) % size, line)
        : at(heights, size, line, (i + 1) % size);
    total += Math.abs(next - a);
  }
  return total / size;
}

describe('buildHeightField', () => {
  it('produces one height per texel', () => {
    expect(field('plain-weave')).toHaveLength(SIZE * SIZE);
  });

  // No `Math.random` anywhere: a surface has to be reproducible for the
  // renderer's texture cache to be safe to key on its parameters.
  it('is deterministic', () => {
    expect(Array.from(field('knit-jersey'))).toEqual(Array.from(field('knit-jersey')));
  });

  it('produces every kind with real structure rather than a flat sheet', () => {
    for (const kind of ['plain-weave', 'knit-jersey', 'embroidery-stitch'] as const) {
      const heights = field(kind);
      const min = Math.min(...heights);
      const max = Math.max(...heights);
      expect(max - min).toBeGreaterThan(0.2);
    }
  });

  // The two fabrics have to differ as *surfaces*, not just as labels.
  it('gives a weave and a knit different structure', () => {
    const weave = field('plain-weave', STRUCTURE_ONLY);
    const knit = field('knit-jersey', STRUCTURE_ONLY);
    expect(Array.from(weave)).not.toEqual(Array.from(knit));
  });

  // A plain weave is a grid: warp and weft alternate at the same rate, so it
  // varies about equally in both directions.
  it('varies comparably in both directions for a plain weave', () => {
    const heights = field('plain-weave', STRUCTURE_ONLY);
    const horizontal = variationAlong(heights, SIZE, 'x', 8);
    const vertical = variationAlong(heights, SIZE, 'y', 8);
    expect(horizontal).toBeGreaterThan(0);
    expect(vertical).toBeGreaterThan(0);
    expect(horizontal / vertical).toBeGreaterThan(0.4);
    expect(horizontal / vertical).toBeLessThan(2.5);
  });

  // A knit is columnar — its wales run vertically, which is what makes
  // jersey read as ribbed rather than as a grid.
  it('varies far more across a knit than along it', () => {
    const heights = field('knit-jersey', STRUCTURE_ONLY);
    let across = 0;
    let along = 0;
    for (let line = 0; line < SIZE; line += 4) {
      across += variationAlong(heights, SIZE, 'x', line);
      along += variationAlong(heights, SIZE, 'y', line);
    }
    expect(across).toBeGreaterThan(along * 1.5);
  });

  /**
   * A tile repeats dozens of times across a garment, so a jump at its edge
   * draws a visible grid over the whole shirt. The seam is compared against
   * the largest step *inside* the tile: crossing the seam is just another
   * one-texel step, so it must not be a bigger one than any other.
   */
  it('tiles seamlessly on both axes', () => {
    for (const kind of ['plain-weave', 'knit-jersey', 'embroidery-stitch'] as const) {
      const heights = field(kind, STRUCTURE_ONLY);
      let maxInteriorStep = 0;
      let maxSeamStep = 0;

      for (let a = 0; a < SIZE; a += 1) {
        for (let b = 0; b < SIZE - 1; b += 1) {
          maxInteriorStep = Math.max(
            maxInteriorStep,
            Math.abs(at(heights, SIZE, b + 1, a) - at(heights, SIZE, b, a)),
            Math.abs(at(heights, SIZE, a, b + 1) - at(heights, SIZE, a, b)),
          );
        }
        maxSeamStep = Math.max(
          maxSeamStep,
          Math.abs(at(heights, SIZE, SIZE - 1, a) - at(heights, SIZE, 0, a)),
          Math.abs(at(heights, SIZE, a, SIZE - 1) - at(heights, SIZE, a, 0)),
        );
      }

      expect(maxSeamStep, `${kind} seam`).toBeLessThanOrEqual(maxInteriorStep * 1.25);
    }
  });

  /**
   * Regression: the plain weave once chose which thread was on top with a
   * test of whether the cell index was even — a step function, so the
   * surface jumped at every thread boundary, not only at the tile's edge.
   * Baked into a normal map that reads as a hard grid ruled over the shirt.
   */
  it('has no internal discontinuity anywhere in a weave', () => {
    const heights = field('plain-weave', STRUCTURE_ONLY);
    const values = Array.from(heights);
    const range = Math.max(...values) - Math.min(...values);

    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const step = Math.abs(at(heights, SIZE, (x + 1) % SIZE, y) - at(heights, SIZE, x, y));
        // One texel of an 8-thread tile is a small fraction of a thread, so
        // no single step should cross a large part of the total range.
        expect(step).toBeLessThan(range * 0.35);
      }
    }
  });

  it('scales the structure by the fabric detail weight', () => {
    const strong = field('plain-weave', { fabric: 1, wrinkle: 0, fiber: 0 });
    const weak = field('plain-weave', { fabric: 0.2, wrinkle: 0, fiber: 0 });
    const range = (heights: Float32Array) => Math.max(...heights) - Math.min(...heights);
    expect(range(weak)).toBeLessThan(range(strong));
  });

  it('flattens completely when every detail weight is zero', () => {
    const heights = field('plain-weave', { fabric: 0, wrinkle: 0, fiber: 0 });
    expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(0);
  });

  it('clamps out-of-range detail weights instead of producing wild geometry', () => {
    const heights = field('plain-weave', { fabric: 40, wrinkle: -3, fiber: Number.NaN });
    for (const value of heights) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('heightFieldToNormalRgba', () => {
  it('produces four bytes per texel', () => {
    const rgba = heightFieldToNormalRgba(field('plain-weave'), SIZE, 0.06);
    expect(rgba).toHaveLength(SIZE * SIZE * 4);
  });

  it('encodes a flat surface as the straight-up normal', () => {
    const flat = new Float32Array(SIZE * SIZE);
    const rgba = heightFieldToNormalRgba(flat, SIZE, 0.06);
    // (0, 0, 1) encoded as (0.5, 0.5, 1) => (128, 128, 255).
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(255);
    expect(rgba[3]).toBe(255);
  });

  it('always writes a unit-length, opaque normal', () => {
    const rgba = heightFieldToNormalRgba(field('knit-jersey'), SIZE, 0.06);
    for (let i = 0; i < rgba.length; i += 4) {
      const x = rgba[i]! / 255 - 0.5;
      const y = rgba[i + 1]! / 255 - 0.5;
      const z = rgba[i + 2]! / 255 - 0.5;
      const length = Math.sqrt(x * x + y * y + z * z) * 2;
      expect(length).toBeGreaterThan(0.9);
      expect(length).toBeLessThan(1.1);
      // A normal map always points out of the surface, never into it.
      expect(rgba[i + 2]!).toBeGreaterThan(127);
      expect(rgba[i + 3]).toBe(255);
    }
  });

  it('tilts normals more as strength rises', () => {
    const heights = field('plain-weave', STRUCTURE_ONLY);
    const tilt = (strength: number) => {
      const rgba = heightFieldToNormalRgba(heights, SIZE, strength);
      let total = 0;
      for (let i = 0; i < rgba.length; i += 4) total += Math.abs(rgba[i]! - 128);
      return total;
    };
    expect(tilt(0.12)).toBeGreaterThan(tilt(0.03));
  });

  it('is deterministic', () => {
    const heights = field('embroidery-stitch');
    expect(Array.from(heightFieldToNormalRgba(heights, SIZE, 0.06))).toEqual(
      Array.from(heightFieldToNormalRgba(heights, SIZE, 0.06)),
    );
  });

  it('does not mutate the height field it reads', () => {
    const heights = field('plain-weave');
    const snapshot = Array.from(heights);
    heightFieldToNormalRgba(heights, SIZE, 0.06);
    expect(Array.from(heights)).toEqual(snapshot);
  });
});

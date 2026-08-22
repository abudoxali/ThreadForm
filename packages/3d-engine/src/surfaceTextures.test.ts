import { beforeEach, describe, expect, it } from 'vitest';
import { resolveMaterial } from '@threadform/material-engine';
import { resolveEffect } from '@threadform/effects-engine';
import type { EffectKind, MaterialId } from '@threadform/types';
import {
  cachedSurfaceCountForTests,
  clearSurfaceCacheForTests,
  getSurfaceNormalData,
  resolveOverlaySurface,
  SURFACE_TEXTURE_SIZE,
} from './surfaceTextures';

const TEE_MATERIALS: readonly MaterialId[] = ['cotton', 'jersey'];

function material(materialId: MaterialId) {
  return resolveMaterial({ materialId, propertyOverrides: {} }, TEE_MATERIALS);
}

function effect(kind: EffectKind, intensity = 0.6, parameters: Record<string, number> = {}) {
  return resolveEffect({ id: 'effect_1', kind, intensity, parameters });
}

beforeEach(() => {
  clearSurfaceCacheForTests();
});

describe('resolveOverlaySurface', () => {
  it('gives an untreated print no surface of its own', () => {
    expect(resolveOverlaySurface(null, material('cotton'))).toBeNull();
  });

  /**
   * Screen-printed ink has no structure of its own — it takes the shape of
   * the cloth underneath. That is why the same artwork looks different
   * screen-printed on cotton than on jersey, and it is the difference
   * between an implementation and a roughness value.
   */
  it('makes screen-printed ink borrow the fabric it sits on', () => {
    const onCotton = resolveOverlaySurface(effect('screen-print'), material('cotton'));
    const onJersey = resolveOverlaySurface(effect('screen-print'), material('jersey'));

    expect(onCotton?.kind).toBe('plain-weave');
    expect(onJersey?.kind).toBe('knit-jersey');
    expect(onCotton?.detail).toEqual(material('cotton').detail);
  });

  it('gives embroidery its own thread surface whatever the fabric', () => {
    const onCotton = resolveOverlaySurface(effect('embroidery'), material('cotton'));
    const onJersey = resolveOverlaySurface(effect('embroidery'), material('jersey'));

    expect(onCotton?.kind).toBe('embroidery-stitch');
    expect(onJersey?.kind).toBe('embroidery-stitch');
    expect(onCotton?.detail).toEqual(onJersey?.detail);
  });

  it('carries the effect surface response through unchanged', () => {
    const stitch = effect('embroidery', 0.9)!;
    const surface = resolveOverlaySurface(stitch, material('cotton'))!;
    expect(surface.roughness).toBe(stitch.roughness);
    expect(surface.normalScale).toBe(stitch.reliefScale);
    expect(surface.metalness).toBe(0);
  });

  it('runs embroidery stitches at the configured angle', () => {
    const straight = resolveOverlaySurface(
      effect('embroidery', 0.6, { stitchAngle: 0 }),
      material('cotton'),
    );
    const angled = resolveOverlaySurface(
      effect('embroidery', 0.6, { stitchAngle: 90 }),
      material('cotton'),
    );
    expect(straight?.rotation).toBe(0);
    expect(angled?.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('never rotates a screen print, which has no stitch direction', () => {
    expect(resolveOverlaySurface(effect('screen-print'), material('cotton'))?.rotation).toBe(0);
  });

  // The two treatments must reach the renderer as different surfaces.
  it('produces measurably different surfaces for the two processes', () => {
    const ink = resolveOverlaySurface(effect('screen-print'), material('cotton'))!;
    const thread = resolveOverlaySurface(effect('embroidery'), material('cotton'))!;
    expect(ink.kind).not.toBe(thread.kind);
    expect(thread.normalScale).toBeGreaterThan(ink.normalScale * 3);
    expect(thread.roughness).toBeLessThan(ink.roughness);
  });
});

describe('getSurfaceNormalData', () => {
  it('produces RGBA pixels for one tile', () => {
    const data = getSurfaceNormalData('plain-weave', { fabric: 1, wrinkle: 0.3, fiber: 0.4 });
    expect(data).toHaveLength(SURFACE_TEXTURE_SIZE * SURFACE_TEXTURE_SIZE * 4);
  });

  // Generating pixels is the expensive half; switching fabrics back and forth
  // must not pay for it repeatedly.
  it('returns the same pixels for the same surface instead of regenerating', () => {
    const detail = { fabric: 1, wrinkle: 0.3, fiber: 0.4 };
    const first = getSurfaceNormalData('plain-weave', detail);
    const second = getSurfaceNormalData('plain-weave', detail);
    expect(second).toBe(first);
    expect(cachedSurfaceCountForTests()).toBe(1);
  });

  it('generates separately for different surfaces', () => {
    const detail = { fabric: 1, wrinkle: 0.3, fiber: 0.4 };
    getSurfaceNormalData('plain-weave', detail);
    getSurfaceNormalData('knit-jersey', detail);
    getSurfaceNormalData('embroidery-stitch', detail);
    expect(cachedSurfaceCountForTests()).toBe(3);
  });

  // Floating-point noise in a persisted override must not fragment the cache
  // into an unbounded set of near-identical surfaces.
  it('treats imperceptibly different detail weights as the same surface', () => {
    const first = getSurfaceNormalData('plain-weave', { fabric: 0.85, wrinkle: 0.3, fiber: 0.55 });
    const second = getSurfaceNormalData('plain-weave', {
      fabric: 0.850001,
      wrinkle: 0.3,
      fiber: 0.55,
    });
    expect(second).toBe(first);
    expect(cachedSurfaceCountForTests()).toBe(1);
  });

  it('stops growing rather than caching every variant forever', () => {
    for (let index = 0; index < 40; index += 1) {
      getSurfaceNormalData('plain-weave', { fabric: index / 40, wrinkle: 0.3, fiber: 0.4 });
    }
    expect(cachedSurfaceCountForTests()).toBeLessThanOrEqual(12);
  });

  it('gives cotton and jersey visibly different pixels', () => {
    const detail = { fabric: 1, wrinkle: 0, fiber: 0 };
    const weave = getSurfaceNormalData('plain-weave', detail);
    const knit = getSurfaceNormalData('knit-jersey', detail);

    let differing = 0;
    for (let i = 0; i < weave.length; i += 4) {
      if (Math.abs(weave[i]! - knit[i]!) > 4 || Math.abs(weave[i + 1]! - knit[i + 1]!) > 4) {
        differing += 1;
      }
    }
    expect(differing / (weave.length / 4)).toBeGreaterThan(0.25);
  });
});

import { describe, expect, it } from 'vitest';
import type { MaterialConfiguration, MaterialId } from '@threadform/types';
import { availableMaterials, isMaterialAvailable, resolveMaterial } from './resolve';
import { MATERIAL_PRESETS } from './presets';

/** What the Essential Tee's manifest declares today. */
const TEE_MATERIALS: readonly MaterialId[] = ['cotton', 'jersey'];

function config(
  materialId: MaterialId,
  propertyOverrides: MaterialConfiguration['propertyOverrides'] = {},
): MaterialConfiguration {
  return { materialId, propertyOverrides };
}

describe('resolveMaterial — the implemented fabrics', () => {
  it('resolves cotton to a matte, densely-woven surface', () => {
    const resolved = resolveMaterial(config('cotton'), TEE_MATERIALS);
    expect(resolved.materialId).toBe('cotton');
    expect(resolved.label).toBe('Cotton');
    expect(resolved.weave).toBe('plain-weave');
    expect(resolved.substituted).toBe(false);
    expect(resolved.metalness).toBe(0);
  });

  it('resolves jersey to a knit surface', () => {
    const resolved = resolveMaterial(config('jersey'), TEE_MATERIALS);
    expect(resolved.materialId).toBe('jersey');
    expect(resolved.weave).toBe('knit-jersey');
    expect(resolved.substituted).toBe(false);
  });

  // The whole point of the milestone: these two must be different *surfaces*,
  // not two labels over one appearance. Asserted on the values the renderer
  // actually consumes.
  it('gives cotton and jersey materially different surfaces', () => {
    const cotton = resolveMaterial(config('cotton'), TEE_MATERIALS);
    const jersey = resolveMaterial(config('jersey'), TEE_MATERIALS);

    expect(cotton.weave).not.toBe(jersey.weave);
    // A knit face is smoother than a weave, and by a visible margin.
    expect(jersey.roughness).toBeLessThan(cotton.roughness - 0.1);
    // ...and more structurally pronounced. Expressed as a ratio, not an
    // absolute delta: the presets' absolute relief was reduced during M04
    // visual QA (both fabrics read as knitwear at the first values), and an
    // absolute threshold would have failed for a purely cosmetic tuning
    // change while saying nothing about whether the two still differ.
    expect(jersey.normalScale).toBeGreaterThan(cotton.normalScale * 1.25);
    expect(jersey.weaveRepeat).not.toEqual(cotton.weaveRepeat);
  });

  it('is deterministic', () => {
    expect(resolveMaterial(config('jersey'), TEE_MATERIALS)).toEqual(
      resolveMaterial(config('jersey'), TEE_MATERIALS),
    );
  });

  it('does not mutate its input', () => {
    const input = config('cotton', { roughness: 0.2 });
    const snapshot = structuredClone(input);
    resolveMaterial(input, TEE_MATERIALS);
    expect(input).toEqual(snapshot);
  });

  it('does not hand back a reference into the preset table', () => {
    const resolved = resolveMaterial(config('cotton'), TEE_MATERIALS);
    resolved.detail.fabric = 0;
    expect(MATERIAL_PRESETS.cotton?.properties.fabricDetail).not.toBe(0);
  });
});

describe('resolveMaterial — overrides', () => {
  it('merges an override over the preset default', () => {
    const preset = resolveMaterial(config('cotton'), TEE_MATERIALS);
    const overridden = resolveMaterial(config('cotton', { roughness: 0.4 }), TEE_MATERIALS);
    expect(overridden.roughness).toBeCloseTo(0.4);
    expect(overridden.roughness).not.toBeCloseTo(preset.roughness);
    // Everything not overridden keeps the preset's value.
    expect(overridden.weave).toBe(preset.weave);
    expect(overridden.detail).toEqual(preset.detail);
  });

  it('clamps an override into a renderable range instead of rejecting it', () => {
    const tooRough = resolveMaterial(config('cotton', { roughness: 9 }), TEE_MATERIALS);
    expect(tooRough.roughness).toBe(1);

    // A zero-roughness fabric is a mirror, which is not a fabric.
    const tooSmooth = resolveMaterial(config('cotton', { roughness: -4 }), TEE_MATERIALS);
    expect(tooSmooth.roughness).toBeGreaterThan(0);
    expect(tooSmooth.roughness).toBeLessThanOrEqual(1);
  });

  it('clamps every detail weight to 0-1', () => {
    const resolved = resolveMaterial(
      config('cotton', { fabricDetail: 40, wrinkleDetail: -2, fiberDetail: 1.5 }),
      TEE_MATERIALS,
    );
    expect(resolved.detail.fabric).toBe(1);
    expect(resolved.detail.wrinkle).toBe(0);
    expect(resolved.detail.fiber).toBe(1);
  });

  // These reach a `MeshStandardMaterial` without throwing and produce a black
  // or blank garment, which reads as a renderer bug rather than bad data.
  it('ignores non-finite overrides rather than propagating them', () => {
    const resolved = resolveMaterial(
      config('cotton', {
        roughness: Number.NaN,
        normalIntensity: Number.POSITIVE_INFINITY,
        fabricDetail: Number.NEGATIVE_INFINITY,
      }),
      TEE_MATERIALS,
    );
    const clean = resolveMaterial(config('cotton'), TEE_MATERIALS);

    expect(Number.isFinite(resolved.roughness)).toBe(true);
    expect(Number.isFinite(resolved.normalScale)).toBe(true);
    expect(Number.isFinite(resolved.detail.fabric)).toBe(true);
    // A NaN override means "no usable opinion", so the preset stands.
    expect(resolved.roughness).toBeCloseTo(clean.roughness);
  });

  it('never produces a negative or non-finite value from any input', () => {
    const hostile = resolveMaterial(
      config('jersey', {
        roughness: Number.NaN,
        normalIntensity: -1e12,
        fabricDetail: Number.NaN,
        wrinkleDetail: 1e30,
        fiberDetail: Number.NEGATIVE_INFINITY,
      }),
      TEE_MATERIALS,
    );
    for (const value of [
      hostile.roughness,
      hostile.metalness,
      hostile.normalScale,
      hostile.detail.fabric,
      hostile.detail.wrinkle,
      hostile.detail.fiber,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('resolveMaterial — capability enforcement', () => {
  // Hiding an option in the UI does nothing about a project that already
  // names a fabric the garment never offered.
  it('substitutes a material the garment does not support', () => {
    const resolved = resolveMaterial(config('denim'), TEE_MATERIALS);
    expect(resolved.substituted).toBe(true);
    expect(TEE_MATERIALS).toContain(resolved.materialId);
  });

  it('substitutes a material the build has no preset for', () => {
    // Declared by a manifest, but with no implementation behind it.
    const resolved = resolveMaterial(config('fleece'), ['fleece', 'cotton']);
    expect(resolved.substituted).toBe(true);
    expect(resolved.materialId).toBe('cotton');
  });

  it('prefers a fabric the garment lists over the global fallback', () => {
    const resolved = resolveMaterial(config('denim'), ['jersey']);
    expect(resolved.materialId).toBe('jersey');
    expect(resolved.substituted).toBe(true);
  });

  it('drops overrides when substituting, since they were authored for another fabric', () => {
    const resolved = resolveMaterial(config('denim', { roughness: 0.1 }), TEE_MATERIALS);
    const clean = resolveMaterial(config(resolved.materialId), TEE_MATERIALS);
    expect(resolved.roughness).toBeCloseTo(clean.roughness);
  });

  it('still returns something renderable for a garment that supports nothing implemented', () => {
    const resolved = resolveMaterial(config('cotton'), []);
    expect(resolved.substituted).toBe(true);
    expect(Number.isFinite(resolved.roughness)).toBe(true);
  });

  it('resolves an absent configuration to a usable substitute', () => {
    const resolved = resolveMaterial(undefined, TEE_MATERIALS);
    expect(resolved.substituted).toBe(true);
    expect(TEE_MATERIALS).toContain(resolved.materialId);
  });
});

describe('availableMaterials / isMaterialAvailable', () => {
  it('offers only fabrics the garment declares and the build implements', () => {
    expect(availableMaterials(TEE_MATERIALS).map((m) => m.id)).toEqual(['cotton', 'jersey']);
  });

  // `MaterialId` has nine members; a manifest listing an unimplemented one
  // must not turn it into a button.
  it('does not offer a declared but unimplemented fabric', () => {
    expect(availableMaterials(['cotton', 'fleece', 'denim']).map((m) => m.id)).toEqual(['cotton']);
  });

  it('offers nothing when the garment declares nothing implemented', () => {
    expect(availableMaterials(['fleece', 'nylon'])).toEqual([]);
  });

  it('answers both halves of the allow-list', () => {
    expect(isMaterialAvailable('cotton', TEE_MATERIALS)).toBe(true);
    expect(isMaterialAvailable('denim', TEE_MATERIALS)).toBe(false);
    expect(isMaterialAvailable('fleece', ['fleece'])).toBe(false);
  });
});

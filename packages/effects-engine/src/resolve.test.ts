import { describe, expect, it } from 'vitest';
import type { EffectConfiguration, EffectKind } from '@threadform/types';
import {
  availableEffects,
  defaultEffectIntensity,
  defaultEffectParameters,
  isEffectAvailable,
  resolveEffect,
} from './resolve';

/** What the Essential Tee's manifest declares today. */
const TEE_EFFECTS: readonly EffectKind[] = ['screen-print', 'embroidery'];

function effect(
  kind: EffectKind,
  intensity = 0.5,
  parameters: Record<string, number> = {},
): EffectConfiguration {
  return { id: 'effect_1', kind, intensity, parameters };
}

describe('resolveEffect — the implemented processes', () => {
  it('resolves screen print to flat ink that borrows the garment weave', () => {
    const resolved = resolveEffect(effect('screen-print'));
    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('screen-print');
    expect(resolved?.relief).toBe('garment-weave');
    expect(resolved?.metalness).toBe(0);
  });

  it('resolves embroidery to raised stitching of its own', () => {
    const resolved = resolveEffect(effect('embroidery'));
    expect(resolved?.relief).toBe('embroidery-stitch');
    expect(resolved?.metalness).toBe(0);
  });

  // The milestone's bar: two processes that map to the same surface would be
  // a dropdown, not an implementation.
  it('gives the two processes genuinely different surfaces', () => {
    const screen = resolveEffect(effect('screen-print', 0.6));
    const stitch = resolveEffect(effect('embroidery', 0.6));

    expect(screen?.relief).not.toBe(stitch?.relief);
    // Thread stands proud of the cloth; ink settles into it.
    expect(stitch!.reliefScale).toBeGreaterThan(screen!.reliefScale * 3);
    // Embroidery thread is markedly shinier than screen-printed ink.
    expect(stitch!.roughness).toBeLessThan(screen!.roughness);
  });

  it('raises embroidery relief with intensity and settles ink with it', () => {
    const softStitch = resolveEffect(effect('embroidery', 0));
    const hardStitch = resolveEffect(effect('embroidery', 1));
    expect(hardStitch!.reliefScale).toBeGreaterThan(softStitch!.reliefScale);
    expect(hardStitch!.roughness).toBeLessThan(softStitch!.roughness);

    // More ink means a thicker film that fills the weave in, so its relief
    // *falls* — the opposite direction, because it is a different process.
    const thinInk = resolveEffect(effect('screen-print', 0));
    const thickInk = resolveEffect(effect('screen-print', 1));
    expect(thickInk!.reliefScale).toBeLessThan(thinInk!.reliefScale);
    expect(thickInk!.roughness).toBeLessThan(thinInk!.roughness);
  });

  it('is deterministic', () => {
    expect(resolveEffect(effect('embroidery', 0.3, { stitchAngle: 90 }))).toEqual(
      resolveEffect(effect('embroidery', 0.3, { stitchAngle: 90 })),
    );
  });

  it('does not mutate its input', () => {
    const input = effect('embroidery', 0.4, { stitchAngle: 30, bogus: 5 });
    const snapshot = structuredClone(input);
    resolveEffect(input);
    expect(input).toEqual(snapshot);
  });
});

describe('resolveEffect — clamping', () => {
  it('clamps intensity into 0-1', () => {
    expect(resolveEffect(effect('embroidery', 40))!.intensity).toBe(1);
    expect(resolveEffect(effect('embroidery', -8))!.intensity).toBe(0);
  });

  it('falls back to the preset default for a non-finite intensity', () => {
    const resolved = resolveEffect(effect('embroidery', Number.NaN));
    expect(resolved!.intensity).toBe(defaultEffectIntensity('embroidery'));
    expect(Number.isFinite(resolved!.reliefScale)).toBe(true);
  });

  it('never produces a non-finite or negative renderer value', () => {
    const hostile = resolveEffect(
      effect('embroidery', Number.POSITIVE_INFINITY, {
        stitchAngle: Number.NaN,
      }),
    )!;
    for (const value of [
      hostile.intensity,
      hostile.roughness,
      hostile.metalness,
      hostile.reliefScale,
      hostile.reliefRepeat,
      hostile.reliefRotation,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(hostile.roughness).toBeGreaterThan(0);
  });
});

describe('resolveEffect — parameter allow-list', () => {
  it('clamps a declared parameter to its range', () => {
    expect(resolveEffect(effect('embroidery', 0.5, { stitchAngle: 900 }))!.parameters).toEqual({
      stitchAngle: 180,
    });
    expect(resolveEffect(effect('embroidery', 0.5, { stitchAngle: -50 }))!.parameters).toEqual({
      stitchAngle: 0,
    });
  });

  it('defaults a missing or unusable parameter deterministically', () => {
    expect(resolveEffect(effect('embroidery'))!.parameters.stitchAngle).toBe(
      defaultEffectParameters('embroidery').stitchAngle,
    );
    expect(
      resolveEffect(effect('embroidery', 0.5, { stitchAngle: Number.NaN }))!.parameters.stitchAngle,
    ).toBe(defaultEffectParameters('embroidery').stitchAngle);
  });

  // Persisted `parameters` is arbitrary attacker-controllable data. An
  // open-ended record reaching a renderer is how a shader parameter becomes
  // an injection surface.
  it('drops every key the effect does not declare', () => {
    const resolved = resolveEffect(
      effect('embroidery', 0.5, {
        stitchAngle: 60,
        __proto__: 1,
        constructor: 2,
        displacementScale: 9999,
        arbitraryShaderKnob: 42,
      }),
    );
    expect(Object.keys(resolved!.parameters)).toEqual(['stitchAngle']);
    expect(resolved!.parameters.stitchAngle).toBe(60);
  });

  it('gives an effect with no declared parameters an empty set', () => {
    const resolved = resolveEffect(effect('screen-print', 0.5, { stitchAngle: 90, hack: 1 }));
    expect(resolved!.parameters).toEqual({});
    expect(resolved!.reliefRotation).toBe(0);
  });

  it('turns the stitch angle into radians for the renderer', () => {
    expect(
      resolveEffect(effect('embroidery', 0.5, { stitchAngle: 90 }))!.reliefRotation,
    ).toBeCloseTo(Math.PI / 2);
  });
});

describe('resolveEffect — unsupported input', () => {
  it('resolves an absent effect to no treatment', () => {
    expect(resolveEffect(undefined)).toBeNull();
  });

  // A kind the vocabulary names but the build cannot render must fall back to
  // the plain print, never to an approximation of something else.
  it('resolves an unimplemented effect kind to no treatment', () => {
    expect(resolveEffect(effect('puff-print'))).toBeNull();
    expect(resolveEffect(effect('metallic'))).toBeNull();
  });
});

describe('availableEffects / isEffectAvailable', () => {
  it('offers only processes the garment declares and the build implements', () => {
    expect(availableEffects(TEE_EFFECTS).map((e) => e.kind)).toEqual([
      'screen-print',
      'embroidery',
    ]);
  });

  // `EffectKind` has sixteen members; a manifest listing an unimplemented one
  // must not turn it into a button.
  it('does not offer a declared but unimplemented process', () => {
    expect(availableEffects(['screen-print', 'puff-print', 'foil']).map((e) => e.kind)).toEqual([
      'screen-print',
    ]);
  });

  it('answers both halves of the allow-list', () => {
    expect(isEffectAvailable('embroidery', TEE_EFFECTS)).toBe(true);
    expect(isEffectAvailable('foil', TEE_EFFECTS)).toBe(false);
    expect(isEffectAvailable('puff-print', ['puff-print'])).toBe(false);
  });
});

describe('defaults', () => {
  it('are deterministic and inside their declared ranges', () => {
    expect(defaultEffectIntensity('screen-print')).toBe(defaultEffectIntensity('screen-print'));
    const parameters = defaultEffectParameters('embroidery');
    expect(parameters.stitchAngle).toBeGreaterThanOrEqual(0);
    expect(parameters.stitchAngle).toBeLessThanOrEqual(180);
  });

  it('return an empty set for an unimplemented kind rather than guessing', () => {
    expect(defaultEffectParameters('foil')).toEqual({});
  });
});

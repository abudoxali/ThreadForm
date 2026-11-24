import { describe, expect, it } from 'vitest';
import type { BackgroundConfiguration, HexColor } from '@threadform/types';
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_COLOR,
  IMPLEMENTED_BACKGROUND_KINDS,
  isBackgroundKindImplemented,
  matchBackgroundPreset,
  resolveBackground,
} from './background';

describe('resolveBackground — the implemented kinds', () => {
  it('resolves a solid colour', () => {
    const resolved = resolveBackground({ kind: 'solid-color', color: '#ff0055' as HexColor });
    expect(resolved).toEqual({ kind: 'solid-color', color: '#ff0055' });
  });

  it('resolves a gradient with its angle', () => {
    const resolved = resolveBackground({
      kind: 'gradient',
      from: '#ffffff' as HexColor,
      to: '#000000' as HexColor,
      angleDegrees: 90,
    });
    expect(resolved).toEqual({ kind: 'gradient', from: '#ffffff', to: '#000000', angleDegrees: 90 });
  });

  it('normalises an angle rather than rejecting it — an angle is cyclic', () => {
    const resolved = resolveBackground({
      kind: 'gradient',
      from: '#ffffff' as HexColor,
      to: '#000000' as HexColor,
      angleDegrees: 400,
    });
    expect(resolved.kind === 'gradient' && resolved.angleDegrees).toBe(40);

    const negative = resolveBackground({
      kind: 'gradient',
      from: '#ffffff' as HexColor,
      to: '#000000' as HexColor,
      angleDegrees: -90,
    });
    expect(negative.kind === 'gradient' && negative.angleDegrees).toBe(270);
  });
});

describe('resolveBackground — untrusted and unimplemented input', () => {
  const unimplemented: BackgroundConfiguration[] = [
    { kind: 'image', source: { blobId: 'whatever' } },
    { kind: 'studio-scene', sceneId: 'loft' },
    { kind: 'hdri-environment', environmentId: 'sunset' },
  ];

  it.each(unimplemented)('degrades $kind to the default studio backdrop', (configuration) => {
    expect(resolveBackground(configuration)).toEqual({
      kind: 'solid-color',
      color: DEFAULT_BACKGROUND_COLOR,
    });
  });

  it('replaces a malformed colour rather than handing it to the renderer', () => {
    const resolved = resolveBackground({
      kind: 'solid-color',
      color: 'rgb(255,0,0)' as HexColor,
    });
    expect(resolved).toEqual({ kind: 'solid-color', color: DEFAULT_BACKGROUND_COLOR });
  });

  it('replaces a non-finite gradient angle', () => {
    const resolved = resolveBackground({
      kind: 'gradient',
      from: '#ffffff' as HexColor,
      to: '#000000' as HexColor,
      angleDegrees: Number.NaN,
    });
    expect(resolved.kind === 'gradient' && Number.isFinite(resolved.angleDegrees)).toBe(true);
  });

  it('resolves an absent configuration', () => {
    expect(resolveBackground(undefined)).toEqual({
      kind: 'solid-color',
      color: DEFAULT_BACKGROUND_COLOR,
    });
  });
});

describe('capability', () => {
  it('implements exactly solid colour and gradient', () => {
    expect([...IMPLEMENTED_BACKGROUND_KINDS]).toEqual(['solid-color', 'gradient']);
    expect(isBackgroundKindImplemented('image')).toBe(false);
    expect(isBackgroundKindImplemented('studio-scene')).toBe(false);
    expect(isBackgroundKindImplemented('hdri-environment')).toBe(false);
  });

  it('offers only presets of an implemented kind', () => {
    for (const preset of BACKGROUND_PRESETS) {
      expect(isBackgroundKindImplemented(preset.configuration.kind)).toBe(true);
    }
  });
});

describe('matchBackgroundPreset', () => {
  it('recognises a stored background that is exactly a preset', () => {
    const preset = BACKGROUND_PRESETS[0]!;
    expect(matchBackgroundPreset(preset.configuration)).toBe(preset.id);
  });

  it('returns null for a hand-picked colour, rather than leaving a preset highlighted', () => {
    expect(matchBackgroundPreset({ kind: 'solid-color', color: '#123456' as HexColor })).toBeNull();
  });

  it('returns null for an unimplemented kind', () => {
    expect(matchBackgroundPreset({ kind: 'studio-scene', sceneId: 'loft' })).toBeNull();
  });
});

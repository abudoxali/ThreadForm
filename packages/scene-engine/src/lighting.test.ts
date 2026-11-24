import { describe, expect, it } from 'vitest';
import type { LightingConfiguration, LightingPresetId } from '@threadform/types';
import {
  IMPLEMENTED_LIGHTING_PRESET_IDS,
  availableLightingPresets,
  findLightingPreset,
  resolveLighting,
} from './lighting';

function config(presetId: LightingPresetId): LightingConfiguration {
  const preset = findLightingPreset(presetId);
  const sources = preset?.sources ?? {
    key: { intensity: 1, colorTemperatureKelvin: 5600 },
    fill: { intensity: 0.45, colorTemperatureKelvin: 5600 },
    rim: { intensity: 0.6, colorTemperatureKelvin: 6500 },
    environment: { intensity: 0.35, colorTemperatureKelvin: 6500 },
  };
  return { presetId, ...sources };
}

describe('resolveLighting — the implemented rigs', () => {
  it('resolves every implemented preset without substituting', () => {
    for (const id of IMPLEMENTED_LIGHTING_PRESET_IDS) {
      const resolved = resolveLighting(config(id));
      expect(resolved.presetId).toBe(id);
      expect(resolved.substituted).toBe(false);
    }
  });

  // The milestone's requirement in one assertion: choosing a preset has to
  // visibly change the render, not just the label.
  it('gives each preset a materially different rig', () => {
    const rigs = IMPLEMENTED_LIGHTING_PRESET_IDS.map((id) => resolveLighting(config(id)));
    const signatures = rigs.map(
      (rig) => `${rig.ambient.intensity}|${rig.key.intensity}|${rig.key.color}|${rig.fill.intensity}`,
    );
    expect(new Set(signatures).size).toBe(rigs.length);
  });

  it('makes contrast darker in the shadows than soft, not merely brighter overall', () => {
    const soft = resolveLighting(config('studio-soft'));
    const contrast = resolveLighting(config('studio-contrast'));
    expect(contrast.fill.intensity).toBeLessThan(soft.fill.intensity);
    expect(contrast.ambient.intensity).toBeLessThan(soft.ambient.intensity);
    expect(contrast.key.intensity).toBeGreaterThan(soft.key.intensity);
  });

  it('makes daylight cooler and more open than moody', () => {
    const daylight = resolveLighting(config('daylight'));
    const moody = resolveLighting(config('moody'));
    expect(daylight.ambient.intensity).toBeGreaterThan(moody.ambient.intensity);
    expect(daylight.hemisphere.intensity).toBeGreaterThan(moody.hemisphere.intensity);
    // A warm key is what makes "moody" read as warm rather than merely dim.
    expect(moody.key.color.toLowerCase()).not.toBe(daylight.key.color.toLowerCase());
  });

  /**
   * A dark garment against a dark backdrop has almost no diffuse response,
   * so the rim light is the only thing separating it from the background.
   * A preset that dimmed it along with everything else would lose the
   * garment entirely — which is a defect, not a mood.
   */
  it('never lets a rig drop its rim light below a usable level', () => {
    for (const id of IMPLEMENTED_LIGHTING_PRESET_IDS) {
      expect(resolveLighting(config(id)).rim.intensity).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps every intensity finite and non-negative', () => {
    for (const id of IMPLEMENTED_LIGHTING_PRESET_IDS) {
      const rig = resolveLighting(config(id));
      for (const value of [
        rig.ambient.intensity,
        rig.hemisphere.intensity,
        rig.key.intensity,
        rig.fill.intensity,
        rig.rim.intensity,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('resolveLighting — substitution', () => {
  it('substitutes the unimplemented custom preset rather than rendering something arbitrary', () => {
    const resolved = resolveLighting(config('custom'));
    expect(resolved.presetId).toBe('studio-soft');
    expect(resolved.substituted).toBe(true);
  });

  it('resolves an entirely absent configuration to the default rig', () => {
    const resolved = resolveLighting(undefined);
    expect(resolved.presetId).toBe('studio-soft');
    expect(resolved.substituted).toBe(true);
  });
});

describe('availableLightingPresets', () => {
  it('offers only rigs with an implementation behind them', () => {
    expect(availableLightingPresets().map((preset) => preset.id)).toEqual([
      'studio-soft',
      'studio-contrast',
      'daylight',
      'moody',
    ]);
  });

  // `custom` is modelled in the type union but has no per-light editor.
  it('does not offer custom', () => {
    expect(availableLightingPresets().some((preset) => preset.id === 'custom')).toBe(false);
  });
});

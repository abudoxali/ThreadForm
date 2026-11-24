import { describe, expect, it } from 'vitest';
import type {
  BackgroundConfiguration,
  GarmentReference,
  HexColor,
  LightingPresetId,
  Project,
} from '@threadform/types';
import { createProject } from './factory';
import { validateProject } from './validate';
import { setBackground, setBackgroundColor, setLightingPreset } from './scene';
import type { LightingSources } from './scene';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

const ALLOWED_LIGHTING: readonly LightingPresetId[] = [
  'studio-soft',
  'studio-contrast',
  'daylight',
  'moody',
];

const ALLOWED_BACKGROUNDS: readonly BackgroundConfiguration['kind'][] = ['solid-color', 'gradient'];

/** Stands in for what `scene-engine` resolves a preset to. This package never looks it up itself. */
const MOODY_SOURCES: LightingSources = {
  key: { intensity: 1.55, colorTemperatureKelvin: 3200 },
  fill: { intensity: 0.18, colorTemperatureKelvin: 8000 },
  rim: { intensity: 1.3, colorTemperatureKelvin: 7000 },
  environment: { intensity: 0.3, colorTemperatureKelvin: 3400 },
};

function base(): Project {
  return createProject(garment);
}

describe('setLightingPreset', () => {
  it('applies the preset and the source values it stands for', () => {
    const next = setLightingPreset(base(), 'moody', MOODY_SOURCES, ALLOWED_LIGHTING);
    expect(next.lighting.presetId).toBe('moody');
    expect(next.lighting.key).toEqual(MOODY_SOURCES.key);
    expect(next.lighting.rim).toEqual(MOODY_SOURCES.rim);
    expect(validateProject(next).success).toBe(true);
  });

  // `custom` is in the type union but has no per-light editor behind it.
  it('refuses a preset outside the allow-list', () => {
    const project = base();
    expect(setLightingPreset(project, 'custom', MOODY_SOURCES, ALLOWED_LIGHTING)).toBe(project);
  });

  it('is a no-op for the already-selected preset', () => {
    const project = base();
    expect(project.lighting.presetId).toBe('studio-soft');
    expect(setLightingPreset(project, 'studio-soft', MOODY_SOURCES, ALLOWED_LIGHTING)).toBe(
      project,
    );
  });

  // A document claiming `moody` while carrying `daylight`'s numbers is a lie
  // waiting for the first per-light editor to surface it.
  it('never leaves the stored sources describing the previous preset', () => {
    const first = setLightingPreset(base(), 'moody', MOODY_SOURCES, ALLOWED_LIGHTING);
    const daylight: LightingSources = {
      key: { intensity: 1.5, colorTemperatureKelvin: 6800 },
      fill: { intensity: 0.72, colorTemperatureKelvin: 7200 },
      rim: { intensity: 1.05, colorTemperatureKelvin: 6500 },
      environment: { intensity: 0.95, colorTemperatureKelvin: 7000 },
    };
    const second = setLightingPreset(first, 'daylight', daylight, ALLOWED_LIGHTING);
    expect(second.lighting.key).toEqual(daylight.key);
    expect(second.lighting.environment).toEqual(daylight.environment);
  });
});

describe('setBackground', () => {
  it('sets a solid colour', () => {
    const next = setBackgroundColor(base(), '#e8e4dc', ALLOWED_BACKGROUNDS);
    expect(next.background).toEqual({ kind: 'solid-color', color: '#e8e4dc' });
    expect(validateProject(next).success).toBe(true);
  });

  it('sets a gradient', () => {
    const gradient: BackgroundConfiguration = {
      kind: 'gradient',
      from: '#141417' as HexColor,
      to: '#0a0a0b' as HexColor,
      angleDegrees: 180,
    };
    const next = setBackground(base(), gradient, ALLOWED_BACKGROUNDS);
    expect(next.background).toEqual(gradient);
    expect(validateProject(next).success).toBe(true);
  });

  // Image, studio-scene and HDRI backgrounds are modelled but unimplemented.
  // Persisting one would leave the project storing something the Studio
  // cannot draw and offers no way to edit back.
  it('refuses a kind this build does not implement', () => {
    const project = base();
    expect(
      setBackground(project, { kind: 'image', source: { blobId: 'x' } }, ALLOWED_BACKGROUNDS),
    ).toBe(project);
    expect(setBackground(project, { kind: 'studio-scene', sceneId: 'loft' }, ALLOWED_BACKGROUNDS)).toBe(
      project,
    );
    expect(
      setBackground(project, { kind: 'hdri-environment', environmentId: 'sun' }, ALLOWED_BACKGROUNDS),
    ).toBe(project);
  });

  it('refuses a malformed colour', () => {
    const project = base();
    expect(setBackgroundColor(project, 'rebeccapurple', ALLOWED_BACKGROUNDS)).toBe(project);
    expect(
      setBackground(
        project,
        { kind: 'gradient', from: 'nope' as HexColor, to: '#000000' as HexColor, angleDegrees: 0 },
        ALLOWED_BACKGROUNDS,
      ),
    ).toBe(project);
  });

  it('refuses a non-finite gradient angle', () => {
    const project = base();
    expect(
      setBackground(
        project,
        {
          kind: 'gradient',
          from: '#ffffff' as HexColor,
          to: '#000000' as HexColor,
          angleDegrees: Number.NaN,
        },
        ALLOWED_BACKGROUNDS,
      ),
    ).toBe(project);
  });

  it('is a no-op when the background is already exactly that', () => {
    const project = setBackgroundColor(base(), '#e8e4dc', ALLOWED_BACKGROUNDS);
    expect(setBackgroundColor(project, '#E8E4DC', ALLOWED_BACKGROUNDS)).toBe(project);
  });
});

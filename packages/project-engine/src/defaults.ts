import type {
  AnimationConfiguration,
  BackgroundConfiguration,
  CameraConfiguration,
  ExportPreferences,
  LightingConfiguration,
  MaterialConfiguration,
} from '@threadform/types';

export function defaultCamera(): CameraConfiguration {
  return {
    presetId: 'three-quarter',
    target: { x: 0, y: 1, z: 0 },
    distance: 3,
    azimuthDegrees: 35,
    polarDegrees: 80,
    fieldOfViewDegrees: 35,
  };
}

export function defaultLighting(): LightingConfiguration {
  return {
    presetId: 'studio-soft',
    key: { intensity: 1, colorTemperatureKelvin: 5600 },
    fill: { intensity: 0.45, colorTemperatureKelvin: 5600 },
    rim: { intensity: 0.6, colorTemperatureKelvin: 6500 },
    environment: { intensity: 0.35, colorTemperatureKelvin: 6500 },
  };
}

export function defaultBackground(): BackgroundConfiguration {
  return { kind: 'solid-color', color: '#101012' };
}

export function defaultAnimation(): AnimationConfiguration {
  return {
    presetId: 'idle',
    durationMs: 4000,
    playbackSpeed: 1,
    loop: true,
    startAtMs: 0,
    endAtMs: 4000,
  };
}

export function defaultMaterial(): MaterialConfiguration {
  return {
    materialId: 'cotton',
    color: { hex: '#f5f5f0', label: 'Natural' },
    propertyOverrides: {},
  };
}

export function defaultExportPreferences(): ExportPreferences {
  return {
    target: 'custom',
    image: { format: 'png', resolution: '1080p' },
    video: { format: 'webm', resolution: '1080p', frameRate: 30 },
    aspectRatio: '1:1',
  };
}

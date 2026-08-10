export interface LightSource {
  intensity: number;
  colorTemperatureKelvin: number;
}

export type LightingPresetId = 'studio-soft' | 'studio-contrast' | 'daylight' | 'moody' | 'custom';

export interface LightingConfiguration {
  presetId: LightingPresetId;
  key: LightSource;
  fill: LightSource;
  rim: LightSource;
  environment: LightSource;
}

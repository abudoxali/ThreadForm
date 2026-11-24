export {
  LIGHTING_PRESETS,
  IMPLEMENTED_LIGHTING_PRESET_IDS,
  FALLBACK_LIGHTING_PRESET_ID,
  findLightingPreset,
  availableLightingPresets,
  resolveLighting,
} from './lighting';
export type { LightingPresetDefinition, ResolvedLight, ResolvedLighting } from './lighting';
export {
  IMPLEMENTED_BACKGROUND_KINDS,
  DEFAULT_BACKGROUND_COLOR,
  FALLBACK_BACKGROUND,
  BACKGROUND_PRESETS,
  resolveBackground,
  isBackgroundKindImplemented,
  matchBackgroundPreset,
} from './background';
export type {
  BackgroundKind,
  BackgroundPresetDefinition,
  ResolvedBackground,
} from './background';

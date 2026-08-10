export { GARMENT_CATALOG, findCatalogEntry } from './catalog';
export type { CatalogEntry } from './catalog';
export { loadManifest } from './manifest';
export type { ManifestLoadResult } from './manifest';
export { resolveGarmentReference } from './resolve';
export { CAMERA_PRESETS, getCameraPreset } from './cameraPresets';
export { garmentManifestSchema } from './schema';
export type {
  GarmentManifest,
  GarmentModelReference,
  GarmentMeshNaming,
  GarmentProvenance,
  GarmentCatalogEntry,
  GarmentResolution,
  CameraPresetDefinition,
} from './types';

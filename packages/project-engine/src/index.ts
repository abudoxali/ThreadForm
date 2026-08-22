export { createProject } from './factory';
export type { CreateProjectOptions } from './factory';
export {
  addArtworkLayer,
  removeArtworkLayer,
  duplicateArtworkLayer,
  reorderArtworkLayer,
  centerArtworkLayer,
} from './layers';
export {
  MIN_ARTWORK_SCALE,
  DEFAULT_ARTWORK_ZONE_COVERAGE,
  normalizeRotationDegrees,
  artworkHeightFraction,
  fitArtworkScale,
  rotatedHalfExtent,
  clampArtworkTransform,
  defaultArtworkTransform,
  setArtworkTransform,
  setArtworkOpacity,
  setArtworkVisibility,
  renameArtworkLayer,
  moveArtworkLayerToZone,
  replaceArtworkSource,
  artworkLayersInZone,
} from './artwork';
export type { ArtworkTransformPatch } from './artwork';
export { setGarmentColor, setCameraPreset } from './garment';
export { setGarmentMaterial, reconcileGarmentMaterial } from './material';
export {
  findArtworkEffect,
  pruneOrphanEffects,
  applyArtworkEffect,
  clearArtworkEffect,
  setArtworkEffectIntensity,
  setArtworkEffectParameter,
} from './effects';
export type { ArtworkEffectDefaults } from './effects';
export { validateProject } from './validate';
export type { ProjectValidationResult } from './validate';
export { migrateProject, UnknownSchemaVersionError } from './migrate';
export { projectSchema } from './schema';
export { createId } from './id';
export {
  defaultCamera,
  defaultLighting,
  defaultBackground,
  defaultAnimation,
  defaultMaterial,
  defaultExportPreferences,
} from './defaults';

export { createProject } from './factory';
export type { CreateProjectOptions } from './factory';
export {
  addArtworkLayer,
  removeArtworkLayer,
  duplicateArtworkLayer,
  reorderArtworkLayer,
  centerArtworkLayer,
} from './layers';
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

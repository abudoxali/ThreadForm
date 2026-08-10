import type { ProjectSchemaVersion } from './schema-version';
import type { GarmentReference, GarmentColor, PrintZoneState } from './garment';
import type { MaterialConfiguration } from './material';
import type { ArtworkLayer } from './artwork';
import type { EffectConfiguration } from './effects';
import type { AnimationConfiguration } from './animation';
import type { CameraConfiguration } from './camera';
import type { LightingConfiguration } from './lighting';
import type { BackgroundConfiguration } from './background';
import type { ExportPreferences } from './export';

export type StudioMode = '2d' | '3d';

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  studioMode: StudioMode;
}

/**
 * Canonical ThreadForm project domain model. Persisted through
 * `@threadform/local-storage` (guest projects) or the future cloud-projects
 * service — see `docs/PROJECT_SCHEMA.md`. Never bind this directly to React
 * state; the Studio's UI state is derived from a `Project`, not the reverse.
 */
export interface Project {
  schemaVersion: ProjectSchemaVersion;
  metadata: ProjectMetadata;
  garment: GarmentReference;
  garmentColor: GarmentColor;
  material: MaterialConfiguration;
  artworks: ArtworkLayer[];
  printZones: PrintZoneState[];
  effects: EffectConfiguration[];
  animation: AnimationConfiguration;
  camera: CameraConfiguration;
  lighting: LightingConfiguration;
  background: BackgroundConfiguration;
  exportPreferences: ExportPreferences;
}

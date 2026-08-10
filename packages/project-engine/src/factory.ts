import { CURRENT_PROJECT_SCHEMA_VERSION } from '@threadform/types';
import type { GarmentColor, GarmentReference, Project, StudioMode } from '@threadform/types';
import {
  defaultAnimation,
  defaultBackground,
  defaultCamera,
  defaultExportPreferences,
  defaultLighting,
  defaultMaterial,
} from './defaults';
import { createId } from './id';

export interface CreateProjectOptions {
  name?: string;
  studioMode?: StudioMode;
  /** Defaults to natural off-white if the garment's own manifest doesn't specify a default color. */
  garmentColor?: GarmentColor;
}

/** Builds a new project in its default state for a freshly chosen garment. */
export function createProject(
  garment: GarmentReference,
  options: CreateProjectOptions = {},
): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    metadata: {
      id: createId('project'),
      name: options.name ?? 'Untitled Project',
      createdAt: now,
      updatedAt: now,
      studioMode: options.studioMode ?? '3d',
    },
    garment,
    garmentColor: options.garmentColor ?? { hex: '#f5f5f0', label: 'Natural' },
    material: defaultMaterial(),
    artworks: [],
    printZones: [],
    effects: [],
    animation: defaultAnimation(),
    camera: defaultCamera(),
    lighting: defaultLighting(),
    background: defaultBackground(),
    exportPreferences: defaultExportPreferences(),
  };
}

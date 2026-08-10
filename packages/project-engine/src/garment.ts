import type { CameraPresetId, HexColor, Project } from '@threadform/types';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

/**
 * Sets the garment's base color. A no-op (returns `project` unchanged) if
 * `hex` isn't a valid hex color — never persists a value the 3D engine or
 * the color input itself couldn't do anything useful with.
 */
export function setGarmentColor(project: Project, hex: string): Project {
  if (!HEX_COLOR_PATTERN.test(hex)) return project;
  return {
    ...project,
    garmentColor: { ...project.garmentColor, hex: hex as HexColor },
    metadata: { ...project.metadata, ...touch() },
  };
}

/**
 * Applies a camera preset's framing angles to the project. The caller
 * resolves `presetId` to its angle/distance definition (that table lives in
 * `@threadform/garment-runtime`, which this package does not depend on) and
 * passes the plain values through.
 */
export function setCameraPreset(
  project: Project,
  presetId: CameraPresetId,
  preset: { azimuthDegrees: number; polarDegrees: number; distance: number },
): Project {
  return {
    ...project,
    camera: {
      ...project.camera,
      presetId,
      azimuthDegrees: preset.azimuthDegrees,
      polarDegrees: preset.polarDegrees,
      distance: preset.distance,
    },
    metadata: { ...project.metadata, ...touch() },
  };
}

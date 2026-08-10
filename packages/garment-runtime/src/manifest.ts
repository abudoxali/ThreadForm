import { garmentManifestSchema } from './schema';
import type { GarmentManifest } from './types';
import { findCatalogEntry } from './catalog';

export type ManifestLoadResult =
  { success: true; manifest: GarmentManifest } | { success: false; error: string };

/**
 * Fetches and validates a garment manifest from the app's static root
 * (`/garments/<id>/manifest.json`). This is a disk/network boundary — the
 * payload is untrusted until it passes `garmentManifestSchema`, exactly
 * like a persisted `Project` at the `local-storage` boundary.
 */
export async function loadManifest(garmentId: string): Promise<ManifestLoadResult> {
  const entry = findCatalogEntry(garmentId);
  if (!entry) {
    return { success: false, error: `Unknown garment id "${garmentId}".` };
  }

  let response: Response;
  try {
    response = await fetch(`/garments/${garmentId}/manifest.json`);
  } catch {
    return { success: false, error: `Could not reach the manifest for "${garmentId}".` };
  }

  if (!response.ok) {
    return {
      success: false,
      error: `Manifest for "${garmentId}" responded with HTTP ${response.status}.`,
    };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { success: false, error: `Manifest for "${garmentId}" was not valid JSON.` };
  }

  const result = garmentManifestSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((issue) => issue.message).join('; '),
    };
  }

  if (result.data.garmentId !== garmentId) {
    return {
      success: false,
      error: `Manifest garmentId "${result.data.garmentId}" does not match requested "${garmentId}".`,
    };
  }

  return { success: true, manifest: result.data };
}

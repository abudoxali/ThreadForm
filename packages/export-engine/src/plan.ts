import type { ExportImageFormat, ExportPreferences, Project } from '@threadform/types';
import { resolveExportDimensions } from './dimensions';
import type { ExportDimensions } from './dimensions';
import { imageFormat } from './formats';
import { exportFilename } from './filename';

/**
 * Everything an export needs, decided before anything is rendered.
 *
 * Planning is separated from rendering so that every question with a right
 * answer — how many pixels, which encoder, whether there is a background,
 * what the file is called — is settled by a pure function with tests, and
 * the renderer is left with nothing to decide. It also means the Studio can
 * show the exact output size *before* the user commits to a 4K render.
 */

export interface ExportPlan {
  width: number;
  height: number;
  /** What the encoder is asked for — `image/png`, `image/jpeg`, `image/webp`. */
  mimeType: string;
  /** Encoder quality for lossy formats; `undefined` for lossless ones. */
  quality: number | undefined;
  /** True only for `png-transparent`: render with no backdrop and keep alpha. */
  transparent: boolean;
  filename: string;
  format: ExportImageFormat;
}

export type ExportPlanResult = { ok: true; plan: ExportPlan } | { ok: false; error: string };

/**
 * Builds an export plan from a project and its preferences.
 *
 * Takes only the two things it needs from the project — the name, for the
 * filename — so it never becomes a reason for this package to know about
 * garments, artwork or storage.
 */
export function planImageExport(
  project: Pick<Project, 'metadata'>,
  preferences: ExportPreferences,
): ExportPlanResult {
  const dimensions = resolveExportDimensions(preferences);
  if (!dimensions.ok) return { ok: false, error: dimensions.error };

  const format = imageFormat(preferences.image.format);
  if (!format) {
    return { ok: false, error: 'That image format is not supported.' };
  }

  return {
    ok: true,
    plan: {
      width: dimensions.dimensions.width,
      height: dimensions.dimensions.height,
      mimeType: format.mimeType,
      quality: format.quality,
      transparent: format.transparent,
      format: format.id,
      filename: exportFilename({
        projectName: project.metadata.name,
        width: dimensions.dimensions.width,
        height: dimensions.dimensions.height,
        extension: format.extension,
      }),
    },
  };
}

/**
 * The states an export job passes through, for the Studio to communicate.
 *
 * Held as application state, never inside a `Project`: "currently exporting"
 * is a fact about this tab in this moment, and persisting it would mean a
 * project could be reopened tomorrow claiming to be mid-export.
 */
export type ExportJobState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'rendering'; dimensions: ExportDimensions }
  | { status: 'encoding'; dimensions: ExportDimensions }
  | { status: 'completed'; filename: string; dimensions: ExportDimensions; byteSize: number }
  | { status: 'failed'; error: string };

/**
 * Why an export could not run. Each maps to a specific, actionable message
 * rather than a generic failure — an export that quietly produces nothing,
 * or produces a file missing content the user could see on screen, is worse
 * than one that refuses and says why.
 */
export type ExportBlockReason =
  | { kind: 'no-project' }
  | { kind: 'garment-not-ready' }
  | { kind: 'artwork-not-ready'; layerNames: string[] }
  | { kind: 'artwork-failed'; layerNames: string[] }
  | { kind: 'format-unsupported'; format: ExportImageFormat }
  | { kind: 'invalid-settings'; error: string };

export function describeExportBlock(reason: ExportBlockReason): string {
  switch (reason.kind) {
    case 'no-project':
      return 'Open or create a project before exporting.';
    case 'garment-not-ready':
      return 'The garment is still loading. Try again in a moment.';
    case 'artwork-not-ready':
      return `Still loading artwork: ${reason.layerNames.join(', ')}. Try again in a moment.`;
    case 'artwork-failed':
      // Deliberately a refusal rather than a partial export. An interactive
      // canvas can show a broken layer as broken and stay editable; a file
      // presented as finished output cannot silently omit artwork the user
      // placed and can see listed.
      return `Can't export — this artwork couldn't be loaded: ${reason.layerNames.join(', ')}. Replace or remove it, then export again.`;
    case 'format-unsupported':
      return `This browser can't encode ${imageFormat(reason.format).label}. Choose another format.`;
    case 'invalid-settings':
      return reason.error;
  }
}

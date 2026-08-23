import type {
  ExportAspectRatio,
  ExportImageFormat,
  ExportResolution,
  ExportTargetPreset,
  Project,
} from '@threadform/types';

/**
 * Export preferences as pure `Project` transformations.
 *
 * `Project.exportPreferences` has existed since M00 and was inert until M05.
 * Making it real means going through this module rather than letting the
 * export panel hand-edit the project: the same rule the rest of the Studio
 * follows, and the reason export settings autosave and survive a reload
 * without any code in the panel knowing that IndexedDB exists.
 *
 * Like every other mutator here, these know nothing about which values are
 * *implemented* — that is a renderer and manifest question. Callers pass the
 * allow-list they are working with, exactly as `setGarmentMaterial` does.
 */

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

/**
 * Selecting a target sets the ordinary ratio and resolution fields it stands
 * for, rather than becoming a mode of its own. The caller resolves the
 * target's meaning (that table lives in `@threadform/export-engine`, which
 * this package does not depend on) and passes the plain values through — the
 * same shape as `setCameraPreset`.
 *
 * `settings` is `null` for `custom`, which means "leave the ratio and
 * resolution as the user set them".
 */
export function setExportTarget(
  project: Project,
  target: ExportTargetPreset,
  settings: { aspectRatio: ExportAspectRatio; resolution: ExportResolution } | null,
): Project {
  const current = project.exportPreferences;
  const nextAspect = settings?.aspectRatio ?? current.aspectRatio;
  const nextResolution = settings?.resolution ?? current.image.resolution;

  if (
    current.target === target &&
    current.aspectRatio === nextAspect &&
    current.image.resolution === nextResolution
  ) {
    return project;
  }

  return {
    ...project,
    exportPreferences: {
      ...current,
      target,
      aspectRatio: nextAspect,
      image: { ...current.image, resolution: nextResolution },
    },
    metadata: { ...project.metadata, ...touch() },
  };
}

export function setExportImageFormat(project: Project, format: ExportImageFormat): Project {
  const current = project.exportPreferences;
  if (current.image.format === format) return project;
  return {
    ...project,
    exportPreferences: { ...current, image: { ...current.image, format } },
    metadata: { ...project.metadata, ...touch() },
  };
}

/**
 * The resolution tier. Changing it by hand means the current target may no
 * longer describe the settings, so the caller re-derives the target — see
 * `matchTarget` in `export-engine`. Passing it here keeps the two fields
 * from disagreeing in the persisted document.
 */
export function setExportResolution(
  project: Project,
  resolution: ExportResolution,
  target: ExportTargetPreset,
): Project {
  const current = project.exportPreferences;
  if (current.image.resolution === resolution && current.target === target) return project;
  return {
    ...project,
    exportPreferences: {
      ...current,
      target,
      image: { ...current.image, resolution },
    },
    metadata: { ...project.metadata, ...touch() },
  };
}

export function setExportAspectRatio(
  project: Project,
  aspectRatio: ExportAspectRatio,
  target: ExportTargetPreset,
): Project {
  const current = project.exportPreferences;
  if (current.aspectRatio === aspectRatio && current.target === target) return project;
  return {
    ...project,
    exportPreferences: { ...current, target, aspectRatio },
    metadata: { ...project.metadata, ...touch() },
  };
}

/**
 * Custom output dimensions.
 *
 * Stored as given — including values that are out of range — and validated
 * at the point of use by `export-engine`, for the same reason artwork
 * transforms are: what counts as too large is a renderer and browser
 * question this package cannot see, and refusing to persist a half-typed
 * number would mean the field fights the user as they type "1" on the way
 * to "1080". The export itself refuses, with a specific message.
 *
 * Non-finite values are the exception: they are rejected outright, since
 * they can never become valid by typing more digits and would poison the
 * document.
 */
export function setExportCustomDimensions(
  project: Project,
  width: number,
  height: number,
): Project {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return project;

  const current = project.exportPreferences;
  const rounded = { width: Math.round(width), height: Math.round(height) };
  if (
    current.customAspectRatio?.width === rounded.width &&
    current.customAspectRatio?.height === rounded.height
  ) {
    return project;
  }

  return {
    ...project,
    exportPreferences: { ...current, customAspectRatio: rounded },
    metadata: { ...project.metadata, ...touch() },
  };
}

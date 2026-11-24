import type {
  BackgroundConfiguration,
  HexColor,
  LightingConfiguration,
  LightingPresetId,
  LightSource,
  Project,
} from '@threadform/types';

/**
 * Scene direction — lighting and background — as pure `Project`
 * transformations.
 *
 * `Project.lighting` and `Project.background` were modelled in M00 and inert
 * until M06. As with every other part of the document, the panels that edit
 * them go through here rather than reconstructing a `Project` inline, which
 * is what makes both of them autosave and survive a reload for free.
 *
 * A lighting preset's meaning — its intensities and colour temperatures —
 * lives in `@threadform/scene-engine`, which this package deliberately does
 * not depend on. The caller resolves the preset and passes the plain source
 * values through, exactly as it already does for a camera preset.
 */

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

export interface LightingSources {
  key: LightSource;
  fill: LightSource;
  rim: LightSource;
  environment: LightSource;
}

/**
 * Applies a lighting preset.
 *
 * The per-source values are written alongside the id rather than left as
 * whatever the previously-selected preset stored. Nothing reads them back
 * today — `resolveLighting` treats the preset as authoritative — but a
 * document that describes `moody` while carrying `daylight`'s numbers is a
 * lie waiting for the first per-light editor to surface it.
 */
export function setLightingPreset(
  project: Project,
  presetId: LightingPresetId,
  sources: LightingSources,
  allowedPresetIds: readonly LightingPresetId[],
): Project {
  if (!allowedPresetIds.includes(presetId)) return project;
  if (project.lighting.presetId === presetId) return project;

  const lighting: LightingConfiguration = { presetId, ...sources };
  return { ...project, lighting, metadata: { ...project.metadata, ...touch() } };
}

function sameBackground(a: BackgroundConfiguration, b: BackgroundConfiguration): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'solid-color' && b.kind === 'solid-color') {
    return a.color.toLowerCase() === b.color.toLowerCase();
  }
  if (a.kind === 'gradient' && b.kind === 'gradient') {
    return (
      a.from.toLowerCase() === b.from.toLowerCase() &&
      a.to.toLowerCase() === b.to.toLowerCase() &&
      a.angleDegrees === b.angleDegrees
    );
  }
  return false;
}

/**
 * Sets the scene background.
 *
 * `allowedKinds` is the set of background kinds this build can actually
 * render, passed in for the same reason material and animation allow-lists
 * are: which kinds exist is a type-level fact and which are implemented is a
 * renderer fact, and `project-engine` depends on neither. A project is never
 * left storing a background the Studio has no way to draw or to edit back.
 */
export function setBackground(
  project: Project,
  background: BackgroundConfiguration,
  allowedKinds: readonly BackgroundConfiguration['kind'][],
): Project {
  if (!allowedKinds.includes(background.kind)) return project;

  if (background.kind === 'solid-color') {
    if (!HEX_COLOR_PATTERN.test(background.color)) return project;
  } else if (background.kind === 'gradient') {
    if (!HEX_COLOR_PATTERN.test(background.from) || !HEX_COLOR_PATTERN.test(background.to)) {
      return project;
    }
    if (!Number.isFinite(background.angleDegrees)) return project;
  }

  if (sameBackground(project.background, background)) return project;
  return { ...project, background, metadata: { ...project.metadata, ...touch() } };
}

/**
 * Sets a solid background colour without the caller having to build the
 * discriminated union by hand — the shape a colour input naturally produces.
 */
export function setBackgroundColor(
  project: Project,
  hex: string,
  allowedKinds: readonly BackgroundConfiguration['kind'][],
): Project {
  if (!HEX_COLOR_PATTERN.test(hex)) return project;
  return setBackground(project, { kind: 'solid-color', color: hex as HexColor }, allowedKinds);
}

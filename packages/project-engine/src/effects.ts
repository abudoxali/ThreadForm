import type { ArtworkLayer, EffectConfiguration, EffectKind, Project } from '@threadform/types';
import { createId } from './id';

/**
 * The artwork-to-effect relationship, as pure `Project` transformations.
 *
 * `Project.effects` owns the configurations and `ArtworkLayer.effectId`
 * points into it. Each layer gets its own configuration, so adjusting one
 * print's stitch relief never reaches through a shared record and changes
 * another's. The alternative — one configuration referenced by several
 * layers — reads as a saving until the first time a user adjusts one layer
 * and watches a different one move.
 *
 * Nothing here knows what an effect *does*: which kinds exist, what they
 * default to and what parameters they accept all live in
 * `@threadform/effects-engine`. Callers resolve those and pass plain values
 * in, exactly as `setCameraPreset` does for camera presets, so that two
 * sibling domain engines stay independent.
 */

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

/** The effect configuration a layer points at, if it still exists. */
export function findArtworkEffect(
  project: Project,
  layer: Pick<ArtworkLayer, 'effectId'>,
): EffectConfiguration | undefined {
  if (!layer.effectId) return undefined;
  return project.effects.find((effect) => effect.id === layer.effectId);
}

/**
 * Drops effect configurations no layer references any more.
 *
 * Called after every unlink rather than left to accumulate: an orphaned
 * configuration is invisible in the UI but real in the persisted document,
 * so without this a project would grow a little every time an effect was
 * changed and never shrink.
 */
export function pruneOrphans(
  effects: EffectConfiguration[],
  artworks: ArtworkLayer[],
): EffectConfiguration[] {
  const referenced = new Set(
    artworks.map((layer) => layer.effectId).filter((id): id is string => Boolean(id)),
  );
  return effects.filter((effect) => referenced.has(effect.id));
}

/** Test/maintenance helper: removes any effect configuration nothing points at. */
export function pruneOrphanEffects(project: Project): Project {
  const effects = pruneOrphans(project.effects, project.artworks);
  if (effects.length === project.effects.length) return project;
  return { ...project, effects, metadata: { ...project.metadata, ...touch() } };
}

export interface ArtworkEffectDefaults {
  intensity: number;
  parameters: Record<string, number>;
}

/**
 * Applies a print effect to one artwork layer, replacing whatever it had.
 *
 * `allowedKinds` is the intersection of what the garment's manifest declares
 * and what the build actually implements; a kind outside it is refused here,
 * not merely hidden in the UI.
 */
export function applyArtworkEffect(
  project: Project,
  layerId: string,
  kind: EffectKind,
  allowedKinds: readonly EffectKind[],
  defaults: ArtworkEffectDefaults,
): Project {
  if (!allowedKinds.includes(kind)) return project;
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  if (!layer) return project;

  const existing = findArtworkEffect(project, layer);
  // Re-selecting the effect a layer already has must not reset the intensity
  // the user tuned, or the control would fight them every time they clicked.
  if (existing?.kind === kind) return project;

  const effect: EffectConfiguration = {
    id: createId('effect'),
    kind,
    intensity: defaults.intensity,
    parameters: { ...defaults.parameters },
  };

  const artworks = project.artworks.map((candidate) =>
    candidate.id === layerId ? { ...candidate, effectId: effect.id } : candidate,
  );

  return {
    ...project,
    artworks,
    effects: [...pruneOrphans(project.effects, artworks), effect],
    metadata: { ...project.metadata, ...touch() },
  };
}

/** Removes a layer's effect, returning it to the plain untreated print. */
export function clearArtworkEffect(project: Project, layerId: string): Project {
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  if (!layer?.effectId) return project;

  const artworks = project.artworks.map((candidate) => {
    if (candidate.id !== layerId) return candidate;
    const { effectId: _dropped, ...rest } = candidate;
    return rest;
  });

  return {
    ...project,
    artworks,
    effects: pruneOrphans(project.effects, artworks),
    metadata: { ...project.metadata, ...touch() },
  };
}

function updateEffect(
  project: Project,
  layerId: string,
  update: (effect: EffectConfiguration) => EffectConfiguration,
): Project {
  const layer = project.artworks.find((candidate) => candidate.id === layerId);
  const existing = layer ? findArtworkEffect(project, layer) : undefined;
  if (!existing) return project;

  const next = update(existing);
  if (
    next.intensity === existing.intensity &&
    next.kind === existing.kind &&
    JSON.stringify(next.parameters) === JSON.stringify(existing.parameters)
  ) {
    return project;
  }

  return {
    ...project,
    effects: project.effects.map((effect) => (effect.id === existing.id ? next : effect)),
    metadata: { ...project.metadata, ...touch() },
  };
}

/** Sets a layer's effect intensity, clamped to 0–1. A no-op if the layer has no effect. */
export function setArtworkEffectIntensity(
  project: Project,
  layerId: string,
  intensity: number,
): Project {
  const clamped = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return updateEffect(project, layerId, (effect) => ({ ...effect, intensity: clamped }));
}

/**
 * Sets one effect parameter. The caller supplies the range because what a
 * parameter means belongs to its effect kind, not to the project document;
 * a value outside it is clamped rather than rejected, matching how every
 * other placement control in this package behaves.
 */
export function setArtworkEffectParameter(
  project: Project,
  layerId: string,
  key: string,
  value: number,
  range: { min: number; max: number },
): Project {
  if (!key) return project;
  const clamped = Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, value))
    : range.min;
  return updateEffect(project, layerId, (effect) => ({
    ...effect,
    parameters: { ...effect.parameters, [key]: clamped },
  }));
}

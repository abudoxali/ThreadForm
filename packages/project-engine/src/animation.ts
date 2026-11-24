import type { AnimationConfiguration, AnimationPresetId, Project } from '@threadform/types';

/**
 * Animation as pure `Project` transformations.
 *
 * `Project.animation` has existed since M00 and was inert until M06. Making
 * it real means going through this module rather than letting a motion panel
 * hand-edit the project: the same rule the rest of the Studio follows, and
 * the reason animation settings autosave and survive a reload without any
 * code in the panel knowing that IndexedDB exists.
 *
 * Like every other mutator here, these know nothing about which presets are
 * *implemented* — that is a renderer and manifest question. Callers pass the
 * allow-list they are working with, exactly as `setGarmentMaterial` does.
 *
 * Numbers are clamped here as well as in `@threadform/animation-engine`.
 * That is not redundancy for its own sake: the engine clamps what reaches
 * the renderer, and this clamps what reaches *storage*, so a project is
 * never persisted describing a clip nobody can play.
 */

/** Bounds a stored clip is held within. Mirrors `animation-engine`, which clamps again at the point of use. */
export const MIN_ANIMATION_DURATION_MS = 1000;
export const MAX_ANIMATION_DURATION_MS = 12_000;
export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;

function touch(): Pick<Project['metadata'], 'updatedAt'> {
  return { updatedAt: new Date().toISOString() };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function withAnimation(project: Project, animation: AnimationConfiguration): Project {
  const current = project.animation;
  if (
    current.presetId === animation.presetId &&
    current.durationMs === animation.durationMs &&
    current.playbackSpeed === animation.playbackSpeed &&
    current.loop === animation.loop &&
    current.startAtMs === animation.startAtMs &&
    current.endAtMs === animation.endAtMs
  ) {
    return project;
  }
  return { ...project, animation, metadata: { ...project.metadata, ...touch() } };
}

/**
 * Selects an animation preset. A no-op when the preset is already selected
 * or is not one the caller says is allowed — never persists a choice the
 * renderer would then have to substitute away.
 */
export function setAnimationPreset(
  project: Project,
  presetId: AnimationPresetId,
  allowedPresetIds: readonly AnimationPresetId[],
): Project {
  if (!allowedPresetIds.includes(presetId)) return project;
  if (project.animation.presetId === presetId) return project;
  return withAnimation(project, { ...project.animation, presetId });
}

/**
 * Sets the clip's length.
 *
 * The play range moves with it, because a range is expressed in absolute
 * milliseconds: shortening a six-second clip to two would otherwise leave
 * `endAtMs` pointing past the end of the clip it belongs to. Rejects
 * non-finite values outright — unlike a half-typed export dimension, this is
 * chosen from a fixed set of buttons, so there is no partially-entered state
 * to protect.
 */
export function setAnimationDuration(project: Project, durationMs: number): Project {
  if (!Number.isFinite(durationMs)) return project;
  const duration = Math.round(clamp(durationMs, MIN_ANIMATION_DURATION_MS, MAX_ANIMATION_DURATION_MS));
  const startAtMs = Math.min(project.animation.startAtMs, duration);
  return withAnimation(project, {
    ...project.animation,
    durationMs: duration,
    startAtMs,
    // A range that covered the whole clip keeps covering the whole clip.
    endAtMs: project.animation.endAtMs >= project.animation.durationMs
      ? duration
      : Math.min(Math.max(project.animation.endAtMs, startAtMs), duration),
  });
}

/** Playback speed. Zero and negative values are clamped, not stored — a clip that never advances is not a speed. */
export function setAnimationPlaybackSpeed(project: Project, playbackSpeed: number): Project {
  if (!Number.isFinite(playbackSpeed)) return project;
  return withAnimation(project, {
    ...project.animation,
    playbackSpeed: clamp(playbackSpeed, MIN_PLAYBACK_SPEED, MAX_PLAYBACK_SPEED),
  });
}

export function setAnimationLoop(project: Project, loop: boolean): Project {
  if (project.animation.loop === loop) return project;
  return withAnimation(project, { ...project.animation, loop });
}

/**
 * The portion of the clip that plays and exports.
 *
 * Clamped into `[0, durationMs]` and ordered, so an inverted or out-of-range
 * pair becomes a usable range rather than a project that cannot be played.
 */
export function setAnimationRange(project: Project, startAtMs: number, endAtMs: number): Project {
  if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs)) return project;
  const duration = project.animation.durationMs;
  const first = clamp(startAtMs, 0, duration);
  const second = clamp(endAtMs, 0, duration);
  return withAnimation(project, {
    ...project.animation,
    startAtMs: Math.min(first, second),
    endAtMs: Math.max(first, second),
  });
}

/**
 * Brings a project's animation into a state the given garment can play,
 * used when opening a project whose stored preset the garment no longer
 * offers. Returns the project unchanged when nothing needs correcting, so
 * merely opening a valid project never marks it dirty.
 */
export function reconcileAnimation(
  project: Project,
  allowedPresetIds: readonly AnimationPresetId[],
): Project {
  const current = project.animation;
  const presetId = allowedPresetIds.includes(current.presetId)
    ? current.presetId
    : allowedPresetIds[0];
  if (presetId === undefined) return project;

  const durationMs = Number.isFinite(current.durationMs)
    ? Math.round(clamp(current.durationMs, MIN_ANIMATION_DURATION_MS, MAX_ANIMATION_DURATION_MS))
    : MIN_ANIMATION_DURATION_MS * 4;
  const playbackSpeed = Number.isFinite(current.playbackSpeed)
    ? clamp(current.playbackSpeed, MIN_PLAYBACK_SPEED, MAX_PLAYBACK_SPEED)
    : 1;
  const rawStart = Number.isFinite(current.startAtMs) ? clamp(current.startAtMs, 0, durationMs) : 0;
  const rawEnd = Number.isFinite(current.endAtMs)
    ? clamp(current.endAtMs, 0, durationMs)
    : durationMs;

  return withAnimation(project, {
    presetId,
    durationMs,
    playbackSpeed,
    loop: current.loop,
    startAtMs: Math.min(rawStart, rawEnd),
    endAtMs: Math.max(rawStart, rawEnd),
  });
}

import type { AnimationConfiguration, AnimationPresetId } from '@threadform/types';
import {
  ANIMATION_PRESETS,
  FALLBACK_ANIMATION_ID,
  IMPLEMENTED_ANIMATION_IDS,
  findAnimationPreset,
} from './presets';
import type { AnimationMotionKind, AnimationPresetDefinition } from './presets';

/**
 * Turns an `AnimationConfiguration` plus a garment's declared capabilities
 * into renderer-ready, clamped motion parameters.
 *
 * This is the single clamp on the path to the renderer and to the video
 * encoder. Everything upstream — a persisted project, a hand-edited
 * IndexedDB record, a future import format — is untrusted, and a NaN
 * duration does not throw anywhere useful: it reaches the exporter as a
 * frame count of `NaN`, which is a loop that never terminates, and reaches
 * the renderer as a rotation of `NaN`, which silently blanks the garment.
 *
 * Resolution therefore never fails and never throws; it degrades to
 * something playable and says so in the result, so the UI can explain rather
 * than the canvas going wrong.
 */

/** Bounds every resolved value is held within. */
export const MIN_ANIMATION_DURATION_MS = 1000;
/**
 * Twelve seconds. Video export renders and records in real time, so the
 * ceiling is also the longest a user can be asked to wait for a clip — and
 * short-form product video is the use this milestone is for. Not a
 * limitation of the timeline itself.
 */
export const MAX_ANIMATION_DURATION_MS = 12_000;
export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;

export interface ResolvedAnimation {
  presetId: AnimationPresetId;
  label: string;
  description: string;
  motion: AnimationMotionKind;
  /** The clip's full length on the timeline, clamped. */
  durationMs: number;
  /** Where the clip starts and ends within `durationMs`, clamped and ordered. */
  startAtMs: number;
  endAtMs: number;
  /** `endAtMs - startAtMs`. Always at least 1 ms, so nothing downstream divides by zero. */
  timelineMs: number;
  playbackSpeed: number;
  loop: boolean;
  /**
   * How long one pass actually takes in real time — `timelineMs` divided by
   * the playback speed. This is what a video's duration is derived from,
   * and what the Studio counts down.
   */
  realDurationMs: number;
  /** Milliseconds one full revolution takes, or `null` for a preset that does not spin. */
  revolutionMs: number | null;
  /** False for `idle`: nothing moves, so nothing should drive a render loop. */
  animated: boolean;
  /** True when framing must fit the garment's swept volume rather than its rest silhouette. */
  sweepsYaw: boolean;
  /** True when the requested preset could not be used and this is a substitute. */
  substituted: boolean;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function build(
  preset: AnimationPresetDefinition,
  configuration: AnimationConfiguration | undefined,
  substituted: boolean,
): ResolvedAnimation {
  const durationMs = clamp(
    configuration?.durationMs,
    MIN_ANIMATION_DURATION_MS,
    MAX_ANIMATION_DURATION_MS,
    preset.defaultDurationMs,
  );

  // Start and end are clamped into the duration and then ordered, rather
  // than rejected: a stored range that a later duration change left inverted
  // (end before start) is a recoverable inconsistency, not a reason to
  // refuse to open a project.
  const rawStart = clamp(configuration?.startAtMs, 0, durationMs, 0);
  const rawEnd = clamp(configuration?.endAtMs, 0, durationMs, durationMs);
  const startAtMs = Math.min(rawStart, rawEnd);
  const endAtMs = Math.max(rawStart, rawEnd);
  // A zero-length range would make every downstream ratio a division by
  // zero — progress, frame count, loop wrap. One millisecond is the
  // smallest thing that keeps all of them finite.
  const timelineMs = Math.max(1, endAtMs - startAtMs);

  const playbackSpeed = clamp(
    configuration?.playbackSpeed,
    MIN_PLAYBACK_SPEED,
    MAX_PLAYBACK_SPEED,
    1,
  );

  return {
    presetId: preset.id,
    label: preset.label,
    description: preset.description,
    motion: preset.motion,
    durationMs,
    startAtMs,
    endAtMs: startAtMs + timelineMs,
    timelineMs,
    playbackSpeed,
    loop: typeof configuration?.loop === 'boolean' ? configuration.loop : true,
    realDurationMs: timelineMs / playbackSpeed,
    revolutionMs: preset.revolutionMs,
    animated: preset.motion !== 'static',
    sweepsYaw: preset.sweepsYaw,
    substituted,
  };
}

/**
 * Resolves a project's animation against what the garment declares and what
 * this build implements.
 *
 * `supportedAnimationIds` comes from the garment's manifest. Passing it in
 * rather than looking it up keeps this package free of any garment
 * knowledge, exactly as `resolveMaterial` does — and means the allow-list
 * enforced is always the *resolved* garment's, not a guess.
 */
export function resolveAnimation(
  configuration: AnimationConfiguration | undefined,
  supportedAnimationIds: readonly AnimationPresetId[],
): ResolvedAnimation {
  const requested = configuration?.presetId;
  const preset = requested ? findAnimationPreset(requested) : undefined;

  if (preset && supportedAnimationIds.includes(preset.id)) {
    return build(preset, configuration, false);
  }

  // Either the build has no implementation for the stored preset, or this
  // garment does not declare it. Fall back to the first thing both sides
  // agree on, preferring the neutral one.
  const substituteId =
    (supportedAnimationIds.includes(FALLBACK_ANIMATION_ID) &&
    findAnimationPreset(FALLBACK_ANIMATION_ID)
      ? FALLBACK_ANIMATION_ID
      : undefined) ??
    IMPLEMENTED_ANIMATION_IDS.find((id) => supportedAnimationIds.includes(id)) ??
    FALLBACK_ANIMATION_ID;

  const substitute = findAnimationPreset(substituteId);
  if (!substitute) {
    // Unreachable while `idle` has an entry, but a resolver that can throw
    // is a resolver that can blank the Studio.
    return {
      presetId: FALLBACK_ANIMATION_ID,
      label: 'Idle',
      description: 'The garment holds still.',
      motion: 'static',
      durationMs: 4000,
      startAtMs: 0,
      endAtMs: 4000,
      timelineMs: 4000,
      playbackSpeed: 1,
      loop: true,
      realDurationMs: 4000,
      revolutionMs: null,
      animated: false,
      sweepsYaw: false,
      substituted: true,
    };
  }

  // The substitute's own defaults are used for anything preset-shaped; the
  // user's duration/speed/loop are kept, since those describe the clip
  // rather than the motion.
  return build(substitute, configuration, true);
}

/**
 * The animations a garment can actually offer: declared by its manifest
 * *and* implemented in this build. Used to populate the Studio's control, so
 * an option can never appear without something real behind it.
 */
export function availableAnimations(
  supportedAnimationIds: readonly AnimationPresetId[],
): AnimationPresetDefinition[] {
  return IMPLEMENTED_ANIMATION_IDS.filter((id) => supportedAnimationIds.includes(id))
    .map((id) => ANIMATION_PRESETS[id])
    .filter((preset): preset is AnimationPresetDefinition => preset !== undefined);
}

/** Whether a garment can use an animation — both sides of the allow-list in one call. */
export function isAnimationAvailable(
  presetId: AnimationPresetId,
  supportedAnimationIds: readonly AnimationPresetId[],
): boolean {
  return supportedAnimationIds.includes(presetId) && findAnimationPreset(presetId) !== undefined;
}

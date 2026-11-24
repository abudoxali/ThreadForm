import type { AnimationPresetId } from '@threadform/types';

/**
 * What an animation actually is, as far as a renderer is concerned.
 *
 * Three.js is deliberately not the source of truth for any of this, for the
 * same reason `material-engine` keeps fabrics out of the renderer: a preset
 * is plain data with no GPU dependency, so motion can be authored, diffed
 * and tested without a WebGL context — and so adding an animation later
 * means adding a row here rather than another conditional inside a
 * component.
 *
 * The motion itself is expressed as a **function of timeline time**, never
 * of wall-clock deltas. That is not a stylistic preference: video export
 * renders frame `i` at exactly `i / frameRate` seconds, and a motion driven
 * by accumulated `requestAnimationFrame` deltas would produce a different
 * result on a fast machine than on a slow one — which is to say, an export
 * that does not match its own preview.
 */

/**
 * How a preset moves the garment.
 *
 * Only two kinds exist today, and that is the honest state of the product:
 * the Essential Tee is a rigid mesh with no skeleton and no cloth
 * simulation, so a walking or wind preset would have nothing real to drive.
 * `AnimationPresetId` names thirteen presets because the vocabulary was
 * modelled up front (M00); the ones with no entry in `ANIMATION_PRESETS`
 * are never offered, never resolvable, and never silently substituted for
 * something that merely looks busy.
 */
export type AnimationMotionKind = 'static' | 'yaw-spin';

export interface AnimationPresetDefinition {
  id: AnimationPresetId;
  label: string;
  /** Short, factual description shown beside the control. Not marketing copy. */
  description: string;
  motion: AnimationMotionKind;
  /**
   * Milliseconds one full revolution takes, for a `yaw-spin`.
   *
   * `null` means "one revolution per timeline", i.e. the period is the
   * clip's own duration — which is what makes a turntable close cleanly at
   * `t = duration` whatever length the user picks. A fixed number instead
   * means a constant angular rate, so a longer clip shows more of the turn
   * rather than turning faster.
   */
  revolutionMs: number | null;
  /**
   * Whether the motion carries the garment through every yaw angle.
   *
   * Framing reads this: a garment framed for its rest silhouette clips its
   * own sleeves partway through a turn, because an axis-aligned box is
   * widest at roughly 23° for these proportions, not at 0°. When this is
   * true the camera fits the *swept* volume instead, which both prevents the
   * clipping and keeps the garment at a constant size for the whole clip.
   */
  sweepsYaw: boolean;
  /** Milliseconds a new project gets for this preset. */
  defaultDurationMs: number;
  /** Whether a duration control means anything for this preset. */
  durationAdjustable: boolean;
}

/**
 * The animations ThreadForm can actually render today.
 *
 * A garment's manifest declares `compatibleAnimations`; this table declares
 * what the build implements. The Studio offers the intersection, exactly as
 * it does for fabrics and print effects — so a manifest listing `wind` does
 * not turn into a button with nothing behind it.
 */
export const ANIMATION_PRESETS: Partial<Record<AnimationPresetId, AnimationPresetDefinition>> = {
  idle: {
    id: 'idle',
    label: 'Idle',
    description: 'The garment holds still. Nothing animates, and nothing renders while it waits.',
    motion: 'static',
    revolutionMs: null,
    sweepsYaw: false,
    defaultDurationMs: 4000,
    // A still frame has no length worth choosing. The duration field still
    // exists on the project (video export needs one) but the control for it
    // would be a knob with no visible effect on the preview.
    durationAdjustable: false,
  },
  'slow-rotate': {
    id: 'slow-rotate',
    label: 'Slow rotate',
    description: 'A gentle, continuous turn at a fixed rate — one revolution every 12 seconds.',
    motion: 'yaw-spin',
    // A constant rate rather than one turn per clip: this preset is the
    // "let it turn while I look at it" one, and speeding the rotation up
    // because the clip is short would defeat the point of calling it slow.
    revolutionMs: 12_000,
    sweepsYaw: true,
    defaultDurationMs: 6000,
    durationAdjustable: true,
  },
  'turntable-360': {
    id: 'turntable-360',
    label: 'Turntable 360°',
    description: 'Exactly one full revolution over the clip, so the loop closes without a jump.',
    motion: 'yaw-spin',
    revolutionMs: null,
    sweepsYaw: true,
    defaultDurationMs: 6000,
    durationAdjustable: true,
  },
};

/** The animations with a real implementation, in the order they should be offered. */
export const IMPLEMENTED_ANIMATION_IDS: readonly AnimationPresetId[] = [
  'idle',
  'slow-rotate',
  'turntable-360',
];

export function findAnimationPreset(
  presetId: AnimationPresetId,
): AnimationPresetDefinition | undefined {
  return ANIMATION_PRESETS[presetId];
}

/**
 * What a project falls back to when its own animation is unusable — because
 * a persisted project names a preset this build cannot render, or one the
 * garment does not declare. `idle` is the only preset that can never look
 * wrong on any garment, so falling back to it changes the render as little
 * as possible.
 */
export const FALLBACK_ANIMATION_ID: AnimationPresetId = 'idle';

/** Durations offered in the Studio. Short-form product clips, not film. */
export const ANIMATION_DURATION_CHOICES: readonly number[] = [2000, 4000, 6000, 8000];

/** Playback speeds offered in the Studio. */
export const PLAYBACK_SPEED_CHOICES: readonly number[] = [0.5, 1, 2];

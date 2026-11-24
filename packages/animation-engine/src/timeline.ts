import type { ResolvedAnimation } from './resolve';

/**
 * The timeline, as a set of pure functions.
 *
 * Everything that decides *what the garment looks like at a given moment*
 * lives here, and takes a time in milliseconds. Nothing in this file reads a
 * clock. That is the whole design constraint of M06's animation work: the
 * Studio's preview is driven by `requestAnimationFrame` and the video export
 * is driven by a frame index, and the only way those two can agree is if
 * both of them are just different ways of choosing a number to pass to
 * `garmentMotionAt`.
 *
 * A motion accumulated from frame deltas would look identical in a demo and
 * be wrong in exactly the case that matters — an export on a machine whose
 * frame rate is not the one the preview happened to run at.
 */

/** Where the garment is at a moment in the timeline. */
export interface GarmentMotion {
  /** Rotation about the garment's own vertical axis, in radians. */
  yawRadians: number;
}

const TWO_PI = Math.PI * 2;

/**
 * Fraction of the clip elapsed at `timelineMs`, in `[0, 1)`.
 *
 * Half-open on purpose: `progress(endAtMs)` is `0`, not `1`, because the end
 * of a loop *is* its beginning. A closed range would render a duplicate
 * frame at every loop boundary — visible as a one-frame stall in a
 * turntable.
 */
export function animationProgress(animation: ResolvedAnimation, timelineMs: number): number {
  if (!Number.isFinite(timelineMs)) return 0;
  const offset = timelineMs - animation.startAtMs;
  const wrapped = ((offset % animation.timelineMs) + animation.timelineMs) % animation.timelineMs;
  return wrapped / animation.timelineMs;
}

/**
 * The garment's pose at a moment in the timeline. Deterministic: the same
 * animation and the same time always produce the same pose, on any machine,
 * whether the caller is a preview frame or export frame 137.
 */
export function garmentMotionAt(animation: ResolvedAnimation, timelineMs: number): GarmentMotion {
  if (animation.motion === 'static') return { yawRadians: 0 };

  if (animation.revolutionMs === null) {
    // One revolution per clip. `progress` is half-open, so progress(end) is
    // 0 — the turn closes exactly, with no duplicated frame and no jump.
    return { yawRadians: animationProgress(animation, timelineMs) * TWO_PI };
  }

  // A constant angular rate. The clip's length decides how much of the turn
  // is seen, not how fast it turns.
  const elapsed = timelineMs - animation.startAtMs;
  if (!Number.isFinite(elapsed)) return { yawRadians: 0 };
  return { yawRadians: (elapsed / animation.revolutionMs) * TWO_PI };
}

export interface PlaybackAdvance {
  /** Where the playhead now sits on the timeline. */
  timelineMs: number;
  /** True when a non-looping clip has just reached its end and playback should stop. */
  finished: boolean;
}

/**
 * Moves the playhead forward by `realDeltaMs` of wall-clock time.
 *
 * The renderer calls this with the frame delta it was given, so the preview
 * runs at the right *speed* on any refresh rate — but the pose it then draws
 * comes from `garmentMotionAt(position)`, never from the delta itself. The
 * delta chooses which moment to draw; it never accumulates into the drawing.
 */
export function advancePlayback(
  animation: ResolvedAnimation,
  timelineMs: number,
  realDeltaMs: number,
): PlaybackAdvance {
  const delta = Number.isFinite(realDeltaMs) ? Math.max(0, realDeltaMs) : 0;
  const next = timelineMs + delta * animation.playbackSpeed;

  if (next < animation.endAtMs) return { timelineMs: next, finished: false };

  if (!animation.loop) return { timelineMs: animation.endAtMs, finished: true };

  const overshoot = (next - animation.startAtMs) % animation.timelineMs;
  return { timelineMs: animation.startAtMs + overshoot, finished: false };
}

/**
 * How many frames a video of this clip contains at `frameRate`.
 *
 * The end of the clip is deliberately **not** rendered: for a turntable it is
 * the same pose as the start, so including it would make the exported loop
 * stutter for one frame every time it repeats. At least one frame always
 * comes back, so a very short clip still produces a file rather than an
 * empty recording.
 */
export function videoFrameCount(animation: ResolvedAnimation, frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) return 1;
  return Math.max(1, Math.round((animation.realDurationMs / 1000) * frameRate));
}

/**
 * The timeline position export frame `index` renders.
 *
 * Frames are spread across the clip by index rather than by elapsed
 * recording time, which is what makes an exported animation independent of
 * how fast the machine managed to render it.
 */
export function frameTimelineMs(
  animation: ResolvedAnimation,
  frameRate: number,
  index: number,
): number {
  const frames = videoFrameCount(animation, frameRate);
  const clampedIndex = Math.min(Math.max(0, Math.trunc(index)), frames - 1);
  return animation.startAtMs + (clampedIndex / frames) * animation.timelineMs;
}

/**
 * `6.0s` — a clip length, for the Studio's read-out.
 *
 * Seconds with one decimal rather than `m:ss`: these clips are bounded at
 * twelve seconds, and a colon-separated time reads as a video timeline the
 * Studio does not have.
 */
export function formatClipLength(milliseconds: number): string {
  const seconds = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000;
  return `${seconds.toFixed(1)}s`;
}

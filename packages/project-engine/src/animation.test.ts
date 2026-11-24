import { describe, expect, it } from 'vitest';
import type { AnimationPresetId, GarmentReference, Project } from '@threadform/types';
import { createProject } from './factory';
import { validateProject } from './validate';
import {
  MAX_ANIMATION_DURATION_MS,
  MAX_PLAYBACK_SPEED,
  MIN_ANIMATION_DURATION_MS,
  MIN_PLAYBACK_SPEED,
  reconcileAnimation,
  setAnimationDuration,
  setAnimationLoop,
  setAnimationPlaybackSpeed,
  setAnimationPreset,
  setAnimationRange,
} from './animation';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

/** What the Essential Tee's manifest declares today. */
const ALLOWED: readonly AnimationPresetId[] = ['idle', 'slow-rotate', 'turntable-360'];

function base(): Project {
  return createProject(garment);
}

describe('setAnimationPreset', () => {
  it('applies a preset the garment allows', () => {
    const next = setAnimationPreset(base(), 'turntable-360', ALLOWED);
    expect(next.animation.presetId).toBe('turntable-360');
  });

  // Hiding an option in a component does nothing about a persisted project
  // that names a preset the garment never offered — enforced here too.
  it('refuses a preset outside the allow-list', () => {
    const project = base();
    expect(setAnimationPreset(project, 'wind', ALLOWED)).toBe(project);
  });

  it('is a no-op for the already-selected preset', () => {
    const project = setAnimationPreset(base(), 'slow-rotate', ALLOWED);
    expect(setAnimationPreset(project, 'slow-rotate', ALLOWED)).toBe(project);
  });

  it('touches updatedAt only when something changed', () => {
    const project = base();
    const next = setAnimationPreset(project, 'turntable-360', ALLOWED);
    expect(next.metadata.updatedAt >= project.metadata.updatedAt).toBe(true);
    expect(next).not.toBe(project);
  });
});

describe('setAnimationDuration', () => {
  it('sets a duration within range', () => {
    expect(setAnimationDuration(base(), 8000).animation.durationMs).toBe(8000);
  });

  it('clamps below and above the supported range', () => {
    expect(setAnimationDuration(base(), 10).animation.durationMs).toBe(MIN_ANIMATION_DURATION_MS);
    expect(setAnimationDuration(base(), 10 ** 6).animation.durationMs).toBe(
      MAX_ANIMATION_DURATION_MS,
    );
  });

  it('rejects NaN and Infinity rather than poisoning the document', () => {
    const project = base();
    expect(setAnimationDuration(project, Number.NaN)).toBe(project);
    expect(setAnimationDuration(project, Number.POSITIVE_INFINITY)).toBe(project);
    expect(setAnimationDuration(project, Number.NEGATIVE_INFINITY)).toBe(project);
  });

  // A range is stored in absolute milliseconds, so shortening the clip has
  // to bring it along or the project describes a clip that ends after it
  // finishes.
  it('carries a full-clip range down with the duration', () => {
    const next = setAnimationDuration(base(), 2000);
    expect(next.animation.startAtMs).toBe(0);
    expect(next.animation.endAtMs).toBe(2000);
  });

  it('never leaves the range pointing past the end of the clip', () => {
    const trimmed = setAnimationRange(setAnimationDuration(base(), 8000), 1000, 5000);
    const shortened = setAnimationDuration(trimmed, 2000);
    expect(shortened.animation.endAtMs).toBeLessThanOrEqual(2000);
    expect(shortened.animation.startAtMs).toBeLessThanOrEqual(shortened.animation.endAtMs);
  });

  it('keeps the project valid', () => {
    expect(validateProject(setAnimationDuration(base(), 2000)).success).toBe(true);
  });
});

describe('setAnimationPlaybackSpeed', () => {
  it('sets a speed within range', () => {
    expect(setAnimationPlaybackSpeed(base(), 2).animation.playbackSpeed).toBe(2);
  });

  // A stored zero would be a clip that never advances, and the schema
  // requires a positive number — clamping keeps both true.
  it('clamps zero and negative speeds', () => {
    expect(setAnimationPlaybackSpeed(base(), 0).animation.playbackSpeed).toBe(MIN_PLAYBACK_SPEED);
    expect(setAnimationPlaybackSpeed(base(), -4).animation.playbackSpeed).toBe(MIN_PLAYBACK_SPEED);
    expect(validateProject(setAnimationPlaybackSpeed(base(), 0)).success).toBe(true);
  });

  it('clamps an absurd speed', () => {
    expect(setAnimationPlaybackSpeed(base(), 500).animation.playbackSpeed).toBe(MAX_PLAYBACK_SPEED);
  });

  it('rejects non-finite speeds', () => {
    const project = base();
    expect(setAnimationPlaybackSpeed(project, Number.NaN)).toBe(project);
  });
});

describe('setAnimationLoop', () => {
  it('toggles looping', () => {
    const off = setAnimationLoop(base(), false);
    expect(off.animation.loop).toBe(false);
    expect(setAnimationLoop(off, true).animation.loop).toBe(true);
  });

  it('is a no-op when unchanged', () => {
    const project = base();
    expect(setAnimationLoop(project, project.animation.loop)).toBe(project);
  });
});

describe('setAnimationRange', () => {
  it('sets a range inside the clip', () => {
    const next = setAnimationRange(base(), 500, 3000);
    expect(next.animation.startAtMs).toBe(500);
    expect(next.animation.endAtMs).toBe(3000);
  });

  it('orders an inverted pair rather than storing it backwards', () => {
    const next = setAnimationRange(base(), 3000, 500);
    expect(next.animation.startAtMs).toBe(500);
    expect(next.animation.endAtMs).toBe(3000);
  });

  it('clamps a range beyond the clip', () => {
    const next = setAnimationRange(base(), -1000, 99_000);
    expect(next.animation.startAtMs).toBe(0);
    expect(next.animation.endAtMs).toBe(next.animation.durationMs);
  });

  it('rejects non-finite bounds', () => {
    const project = base();
    expect(setAnimationRange(project, Number.NaN, 1000)).toBe(project);
    expect(setAnimationRange(project, 0, Number.POSITIVE_INFINITY)).toBe(project);
  });
});

describe('reconcileAnimation', () => {
  it('leaves a valid project untouched, so opening it does not mark it dirty', () => {
    const project = setAnimationPreset(base(), 'turntable-360', ALLOWED);
    expect(reconcileAnimation(project, ALLOWED)).toBe(project);
  });

  it('replaces a preset the garment no longer offers', () => {
    const project = setAnimationPreset(base(), 'turntable-360', ALLOWED);
    const reconciled = reconcileAnimation(project, ['idle']);
    expect(reconciled.animation.presetId).toBe('idle');
  });

  // Everything below is what a hand-edited or hand-written record can carry.
  it('repairs a poisoned duration, speed and range', () => {
    const project = base();
    const broken: Project = {
      ...project,
      animation: {
        presetId: 'turntable-360',
        durationMs: Number.NaN,
        playbackSpeed: Number.POSITIVE_INFINITY,
        loop: true,
        startAtMs: 99_000,
        endAtMs: -5,
      },
    };
    const reconciled = reconcileAnimation(broken, ALLOWED);
    expect(Number.isFinite(reconciled.animation.durationMs)).toBe(true);
    expect(Number.isFinite(reconciled.animation.playbackSpeed)).toBe(true);
    expect(reconciled.animation.startAtMs).toBeLessThanOrEqual(reconciled.animation.endAtMs);
    expect(reconciled.animation.endAtMs).toBeLessThanOrEqual(reconciled.animation.durationMs);
    expect(validateProject(reconciled).success).toBe(true);
  });

  it('does nothing when the garment declares no animations at all', () => {
    const project = base();
    expect(reconcileAnimation(project, [])).toBe(project);
  });
});

describe('backward compatibility', () => {
  // Every project written before M06 carries `defaultAnimation()`, which is
  // idle / 4000ms / speed 1 / looping / the full range. Nothing about M06
  // changed the persisted shape, so those documents must reconcile to
  // themselves.
  it('a pre-M06 project reconciles to itself', () => {
    const project = base();
    expect(project.animation).toEqual({
      presetId: 'idle',
      durationMs: 4000,
      playbackSpeed: 1,
      loop: true,
      startAtMs: 0,
      endAtMs: 4000,
    });
    expect(reconcileAnimation(project, ALLOWED)).toBe(project);
  });
});

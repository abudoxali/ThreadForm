import { describe, expect, it } from 'vitest';
import type { AnimationConfiguration, AnimationPresetId } from '@threadform/types';
import {
  MAX_ANIMATION_DURATION_MS,
  MAX_PLAYBACK_SPEED,
  MIN_ANIMATION_DURATION_MS,
  MIN_PLAYBACK_SPEED,
  availableAnimations,
  isAnimationAvailable,
  resolveAnimation,
} from './resolve';

/** What the Essential Tee's manifest declares today. */
const TEE_ANIMATIONS: readonly AnimationPresetId[] = ['idle', 'slow-rotate', 'turntable-360'];

function config(overrides: Partial<AnimationConfiguration> = {}): AnimationConfiguration {
  return {
    presetId: 'turntable-360',
    durationMs: 6000,
    playbackSpeed: 1,
    loop: true,
    startAtMs: 0,
    endAtMs: 6000,
    ...overrides,
  };
}

describe('resolveAnimation — the implemented presets', () => {
  it('resolves idle to a motion that never animates', () => {
    const resolved = resolveAnimation(config({ presetId: 'idle' }), TEE_ANIMATIONS);
    expect(resolved.presetId).toBe('idle');
    expect(resolved.animated).toBe(false);
    expect(resolved.sweepsYaw).toBe(false);
    expect(resolved.substituted).toBe(false);
  });

  it('resolves slow rotate to a fixed-rate spin', () => {
    const resolved = resolveAnimation(config({ presetId: 'slow-rotate' }), TEE_ANIMATIONS);
    expect(resolved.motion).toBe('yaw-spin');
    // A rate, not one turn per clip — that is what distinguishes it from
    // the turntable.
    expect(resolved.revolutionMs).toBe(12_000);
    expect(resolved.animated).toBe(true);
    expect(resolved.sweepsYaw).toBe(true);
  });

  it('resolves turntable to one revolution per clip', () => {
    const resolved = resolveAnimation(config({ presetId: 'turntable-360' }), TEE_ANIMATIONS);
    expect(resolved.motion).toBe('yaw-spin');
    expect(resolved.revolutionMs).toBeNull();
    expect(resolved.animated).toBe(true);
    expect(resolved.sweepsYaw).toBe(true);
  });

  it('gives slow rotate and turntable materially different motion, not two labels', () => {
    const slow = resolveAnimation(config({ presetId: 'slow-rotate' }), TEE_ANIMATIONS);
    const turntable = resolveAnimation(config({ presetId: 'turntable-360' }), TEE_ANIMATIONS);
    expect(slow.revolutionMs).not.toBe(turntable.revolutionMs);
  });
});

describe('resolveAnimation — clamping untrusted values', () => {
  it('rejects NaN and Infinity rather than passing them to a renderer', () => {
    const resolved = resolveAnimation(
      config({ durationMs: Number.NaN, playbackSpeed: Number.POSITIVE_INFINITY }),
      TEE_ANIMATIONS,
    );
    expect(Number.isFinite(resolved.durationMs)).toBe(true);
    expect(Number.isFinite(resolved.playbackSpeed)).toBe(true);
    expect(Number.isFinite(resolved.realDurationMs)).toBe(true);
    // NaN falls back to the preset default; Infinity clamps to the ceiling.
    expect(resolved.durationMs).toBe(6000);
    expect(resolved.playbackSpeed).toBe(MAX_PLAYBACK_SPEED);
  });

  it('clamps a duration below and above the supported range', () => {
    expect(resolveAnimation(config({ durationMs: 5 }), TEE_ANIMATIONS).durationMs).toBe(
      MIN_ANIMATION_DURATION_MS,
    );
    expect(resolveAnimation(config({ durationMs: 10 ** 9 }), TEE_ANIMATIONS).durationMs).toBe(
      MAX_ANIMATION_DURATION_MS,
    );
  });

  it('clamps playback speed, including a stored zero that would freeze the clip', () => {
    expect(resolveAnimation(config({ playbackSpeed: 0 }), TEE_ANIMATIONS).playbackSpeed).toBe(
      MIN_PLAYBACK_SPEED,
    );
    expect(resolveAnimation(config({ playbackSpeed: -3 }), TEE_ANIMATIONS).playbackSpeed).toBe(
      MIN_PLAYBACK_SPEED,
    );
  });

  it('orders an inverted range rather than refusing the project', () => {
    const resolved = resolveAnimation(
      config({ durationMs: 6000, startAtMs: 5000, endAtMs: 1000 }),
      TEE_ANIMATIONS,
    );
    expect(resolved.startAtMs).toBe(1000);
    expect(resolved.endAtMs).toBe(5000);
    expect(resolved.timelineMs).toBe(4000);
  });

  it('never produces a zero-length timeline, so nothing downstream divides by zero', () => {
    const resolved = resolveAnimation(
      config({ startAtMs: 2000, endAtMs: 2000 }),
      TEE_ANIMATIONS,
    );
    expect(resolved.timelineMs).toBe(1);
    expect(Number.isFinite(resolved.realDurationMs)).toBe(true);
  });

  it('pulls a range that outlived a duration change back inside the clip', () => {
    const resolved = resolveAnimation(
      config({ durationMs: 2000, startAtMs: 0, endAtMs: 9000 }),
      TEE_ANIMATIONS,
    );
    expect(resolved.endAtMs).toBeLessThanOrEqual(2000);
  });

  it('derives real duration from the timeline and the speed', () => {
    const resolved = resolveAnimation(
      config({ durationMs: 6000, endAtMs: 6000, playbackSpeed: 2 }),
      TEE_ANIMATIONS,
    );
    expect(resolved.realDurationMs).toBe(3000);
  });

  it('resolves an entirely absent configuration', () => {
    const resolved = resolveAnimation(undefined, TEE_ANIMATIONS);
    expect(resolved.presetId).toBe('idle');
    expect(resolved.substituted).toBe(true);
  });
});

describe('resolveAnimation — capability substitution', () => {
  // `AnimationPresetId` has thirteen members; a stored project naming one
  // with no implementation must not reach the renderer.
  it('substitutes a preset this build does not implement', () => {
    const resolved = resolveAnimation(config({ presetId: 'wind' }), TEE_ANIMATIONS);
    expect(resolved.presetId).toBe('idle');
    expect(resolved.substituted).toBe(true);
  });

  it('substitutes a preset the garment does not declare', () => {
    const resolved = resolveAnimation(config({ presetId: 'turntable-360' }), ['idle']);
    expect(resolved.presetId).toBe('idle');
    expect(resolved.substituted).toBe(true);
  });

  it('keeps the clip settings when substituting the motion', () => {
    const resolved = resolveAnimation(
      config({ presetId: 'knitting-reveal', durationMs: 8000, loop: false }),
      TEE_ANIMATIONS,
    );
    expect(resolved.durationMs).toBe(8000);
    expect(resolved.loop).toBe(false);
  });

  it('falls back to something implemented even when the garment declares nothing usable', () => {
    const resolved = resolveAnimation(config({ presetId: 'walking' }), ['walking', 'wave']);
    expect(resolved.presetId).toBe('idle');
    expect(resolved.animated).toBe(false);
  });
});

describe('availableAnimations / isAnimationAvailable', () => {
  it('offers only presets the garment declares and the build implements', () => {
    expect(availableAnimations(TEE_ANIMATIONS).map((preset) => preset.id)).toEqual([
      'idle',
      'slow-rotate',
      'turntable-360',
    ]);
  });

  it('does not offer a declared but unimplemented preset', () => {
    expect(availableAnimations(['idle', 'wind', 'fold-unfold']).map((p) => p.id)).toEqual(['idle']);
  });

  it('offers nothing when the garment declares nothing implemented', () => {
    expect(availableAnimations(['wind', 'wave'])).toEqual([]);
  });

  it('answers both halves of the allow-list', () => {
    expect(isAnimationAvailable('turntable-360', TEE_ANIMATIONS)).toBe(true);
    expect(isAnimationAvailable('wind', TEE_ANIMATIONS)).toBe(false);
    expect(isAnimationAvailable('wind', ['wind'])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { AnimationConfiguration, AnimationPresetId } from '@threadform/types';
import { resolveAnimation } from './resolve';
import {
  advancePlayback,
  animationProgress,
  formatClipLength,
  frameTimelineMs,
  garmentMotionAt,
  videoFrameCount,
} from './timeline';

const TEE_ANIMATIONS: readonly AnimationPresetId[] = ['idle', 'slow-rotate', 'turntable-360'];
const TWO_PI = Math.PI * 2;

function animation(overrides: Partial<AnimationConfiguration> = {}) {
  return resolveAnimation(
    {
      presetId: 'turntable-360',
      durationMs: 6000,
      playbackSpeed: 1,
      loop: true,
      startAtMs: 0,
      endAtMs: 6000,
      ...overrides,
    },
    TEE_ANIMATIONS,
  );
}

describe('animationProgress', () => {
  it('runs from 0 towards 1 across the clip', () => {
    const clip = animation();
    expect(animationProgress(clip, 0)).toBe(0);
    expect(animationProgress(clip, 3000)).toBeCloseTo(0.5, 10);
  });

  // Half-open on purpose: the end of a loop *is* its beginning, and a closed
  // range would render a duplicate frame at every boundary.
  it('treats the end of the clip as the start, so a loop has no duplicate frame', () => {
    const clip = animation();
    expect(animationProgress(clip, 6000)).toBe(0);
    expect(animationProgress(clip, 6001)).toBeCloseTo(1 / 6000, 10);
  });

  it('wraps a position beyond the clip, and one before it', () => {
    const clip = animation();
    expect(animationProgress(clip, 15_000)).toBeCloseTo(0.5, 10);
    expect(animationProgress(clip, -1500)).toBeCloseTo(0.75, 10);
  });

  it('is offset by a clip that does not start at zero', () => {
    const clip = animation({ startAtMs: 2000, endAtMs: 6000 });
    expect(animationProgress(clip, 2000)).toBe(0);
    expect(animationProgress(clip, 4000)).toBeCloseTo(0.5, 10);
  });
});

describe('garmentMotionAt — idle', () => {
  it('never moves', () => {
    const clip = animation({ presetId: 'idle' });
    for (const t of [0, 500, 3000, 12_345]) {
      expect(garmentMotionAt(clip, t).yawRadians).toBe(0);
    }
  });
});

describe('garmentMotionAt — turntable 360', () => {
  it('completes exactly one revolution over the clip', () => {
    const clip = animation();
    expect(garmentMotionAt(clip, 0).yawRadians).toBe(0);
    expect(garmentMotionAt(clip, 1500).yawRadians).toBeCloseTo(TWO_PI * 0.25, 10);
    expect(garmentMotionAt(clip, 3000).yawRadians).toBeCloseTo(Math.PI, 10);
  });

  // The requirement the milestone states in as many words: at t = 0 and at
  // t = duration the visual orientation must close cleanly.
  it('closes the loop with no visible jump at the boundary', () => {
    const clip = animation();
    const start = garmentMotionAt(clip, 0).yawRadians;
    const end = garmentMotionAt(clip, clip.endAtMs).yawRadians;
    expect(end).toBe(start);

    // ...and approaches it continuously from below, rather than snapping.
    const justBefore = garmentMotionAt(clip, clip.endAtMs - 1).yawRadians;
    expect(TWO_PI - justBefore).toBeLessThan(0.002);
  });

  it('turns faster on a shorter clip, since the revolution is the clip', () => {
    const short = animation({ durationMs: 2000, endAtMs: 2000 });
    const long = animation({ durationMs: 8000, endAtMs: 8000 });
    expect(garmentMotionAt(short, 1000).yawRadians).toBeGreaterThan(
      garmentMotionAt(long, 1000).yawRadians,
    );
  });

  it('is deterministic — the same time always gives the same pose', () => {
    const clip = animation();
    const first = garmentMotionAt(clip, 2137).yawRadians;
    const second = garmentMotionAt(animation(), 2137).yawRadians;
    expect(second).toBe(first);
  });
});

describe('garmentMotionAt — slow rotate', () => {
  it('turns at a fixed rate regardless of clip length', () => {
    const short = animation({ presetId: 'slow-rotate', durationMs: 2000, endAtMs: 2000 });
    const long = animation({ presetId: 'slow-rotate', durationMs: 8000, endAtMs: 8000 });
    expect(garmentMotionAt(short, 1000).yawRadians).toBeCloseTo(
      garmentMotionAt(long, 1000).yawRadians,
      10,
    );
  });

  it('completes one revolution every twelve seconds', () => {
    const clip = animation({ presetId: 'slow-rotate', durationMs: 12_000, endAtMs: 12_000 });
    expect(garmentMotionAt(clip, 12_000).yawRadians).toBeCloseTo(TWO_PI, 10);
    expect(garmentMotionAt(clip, 6000).yawRadians).toBeCloseTo(Math.PI, 10);
  });

  // No wobble and no reversal: yaw is monotonic in time, sampled densely.
  it('rotates smoothly in one direction', () => {
    const clip = animation({ presetId: 'slow-rotate', durationMs: 8000, endAtMs: 8000 });
    let previous = -1;
    for (let t = 0; t <= 8000; t += 25) {
      const yaw = garmentMotionAt(clip, t).yawRadians;
      expect(yaw).toBeGreaterThan(previous);
      previous = yaw;
    }
  });
});

describe('advancePlayback', () => {
  it('moves the playhead by real time scaled by the playback speed', () => {
    const clip = animation({ playbackSpeed: 2 });
    expect(advancePlayback(clip, 0, 100).timelineMs).toBe(200);
  });

  it('wraps a looping clip back into range without losing the overshoot', () => {
    const clip = animation();
    const advanced = advancePlayback(clip, 5950, 100);
    expect(advanced.finished).toBe(false);
    expect(advanced.timelineMs).toBeCloseTo(50, 10);
  });

  it('stops a non-looping clip exactly at its end', () => {
    const clip = animation({ loop: false });
    const advanced = advancePlayback(clip, 5950, 500);
    expect(advanced.finished).toBe(true);
    expect(advanced.timelineMs).toBe(clip.endAtMs);
  });

  it('ignores a non-finite or negative delta rather than corrupting the playhead', () => {
    const clip = animation();
    expect(advancePlayback(clip, 1000, Number.NaN).timelineMs).toBe(1000);
    expect(advancePlayback(clip, 1000, -500).timelineMs).toBe(1000);
  });
});

describe('videoFrameCount / frameTimelineMs', () => {
  it('derives the frame count from the clip and the frame rate', () => {
    expect(videoFrameCount(animation(), 30)).toBe(180);
    expect(videoFrameCount(animation(), 24)).toBe(144);
    expect(videoFrameCount(animation({ playbackSpeed: 2 }), 30)).toBe(90);
  });

  it('always produces at least one frame', () => {
    expect(videoFrameCount(animation({ startAtMs: 0, endAtMs: 0 }), 30)).toBe(1);
    expect(videoFrameCount(animation(), 0)).toBe(1);
  });

  it('spreads frames evenly and excludes the closing duplicate', () => {
    const clip = animation();
    expect(frameTimelineMs(clip, 30, 0)).toBe(0);
    expect(frameTimelineMs(clip, 30, 90)).toBeCloseTo(3000, 10);
    // Frame 180 would be the same pose as frame 0, so the last rendered
    // frame is 179 and it stops one step short of the loop point.
    expect(frameTimelineMs(clip, 30, 179)).toBeCloseTo(6000 - 6000 / 180, 10);
  });

  it('clamps an out-of-range frame index instead of producing a stray pose', () => {
    const clip = animation();
    expect(frameTimelineMs(clip, 30, -5)).toBe(0);
    expect(frameTimelineMs(clip, 30, 9999)).toBe(frameTimelineMs(clip, 30, 179));
  });

  // The whole reason the timeline is a pure function of an index: an export
  // must not depend on how fast the machine managed to render.
  it('produces a full, evenly-spaced turn at any frame rate', () => {
    const clip = animation();
    for (const fps of [24, 30]) {
      const frames = videoFrameCount(clip, fps);
      const yaws = Array.from(
        { length: frames },
        (_, index) => garmentMotionAt(clip, frameTimelineMs(clip, fps, index)).yawRadians,
      );
      expect(yaws[0]).toBe(0);
      expect(yaws[frames - 1]).toBeLessThan(TWO_PI);
      expect(yaws[frames - 1]).toBeGreaterThan(TWO_PI * 0.98);
      const step = TWO_PI / frames;
      for (let index = 1; index < frames; index += 1) {
        expect(yaws[index]! - yaws[index - 1]!).toBeCloseTo(step, 10);
      }
    }
  });
});

describe('formatClipLength', () => {
  it('formats seconds with one decimal', () => {
    expect(formatClipLength(6000)).toBe('6.0s');
    expect(formatClipLength(2500)).toBe('2.5s');
  });

  it('never renders a negative or non-finite length', () => {
    expect(formatClipLength(-100)).toBe('0.0s');
    expect(formatClipLength(Number.NaN)).toBe('0.0s');
  });
});

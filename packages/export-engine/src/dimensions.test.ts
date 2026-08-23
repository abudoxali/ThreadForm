import { describe, expect, it } from 'vitest';
import type { ExportAspectRatio, ExportPreferences, ExportResolution } from '@threadform/types';
import {
  MAX_EXPORT_DIMENSION_PX,
  MIN_EXPORT_DIMENSION_PX,
  formatDimensions,
  resolveExportDimensions,
} from './dimensions';

function preferences(
  aspectRatio: ExportAspectRatio,
  resolution: ExportResolution = '1080p',
  customAspectRatio?: { width: number; height: number },
): ExportPreferences {
  return {
    target: 'custom',
    image: { format: 'png', resolution },
    video: { format: 'webm', resolution: '1080p', frameRate: 30 },
    aspectRatio,
    ...(customAspectRatio ? { customAspectRatio } : {}),
  };
}

function dims(
  aspectRatio: ExportAspectRatio,
  resolution: ExportResolution = '1080p',
  custom?: { width: number; height: number },
) {
  const result = resolveExportDimensions(preferences(aspectRatio, resolution, custom));
  if (!result.ok) throw new Error(`expected dimensions, got: ${result.error}`);
  return result.dimensions;
}

/**
 * The resolution tier names the image's **short edge**. `EXPORT_SPEC.md`
 * named the tiers without defining them off 16:9, so these tests are where
 * that rule actually lives — a height-based reading would make every
 * portrait export quietly lower-resolution than its label.
 */
describe('resolveExportDimensions — the short-edge rule', () => {
  it('gives a square the tier on both sides', () => {
    expect(dims('1:1', '720p')).toEqual({ width: 720, height: 720 });
    expect(dims('1:1', '1080p')).toEqual({ width: 1080, height: 1080 });
    expect(dims('1:1', '1440p')).toEqual({ width: 1440, height: 1440 });
    expect(dims('1:1', '4k')).toEqual({ width: 2160, height: 2160 });
  });

  it('puts the tier on the width for portrait ratios', () => {
    expect(dims('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(dims('4:5', '1080p')).toEqual({ width: 1080, height: 1350 });
    expect(dims('9:16', '720p')).toEqual({ width: 720, height: 1280 });
    expect(dims('4:5', '1440p')).toEqual({ width: 1440, height: 1800 });
  });

  it('puts the tier on the height for landscape ratios', () => {
    expect(dims('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(dims('16:9', '720p')).toEqual({ width: 1280, height: 720 });
    expect(dims('16:9', '1440p')).toEqual({ width: 2560, height: 1440 });
  });

  // The two orientations of the largest tier, spelled out because "4K" is
  // the one whose name refers to a long edge in the broadcast convention.
  it('resolves 4K to 3840×2160 landscape and 2160×3840 portrait', () => {
    expect(dims('16:9', '4k')).toEqual({ width: 3840, height: 2160 });
    expect(dims('9:16', '4k')).toEqual({ width: 2160, height: 3840 });
  });

  it('is deterministic', () => {
    expect(dims('9:16', '1440p')).toEqual(dims('9:16', '1440p'));
  });

  it('never rounds below the tier the user asked for', () => {
    for (const ratio of ['1:1', '4:5', '9:16', '16:9'] as const) {
      for (const tier of ['720p', '1080p', '1440p', '4k'] as const) {
        const { width, height } = dims(ratio, tier);
        expect(Number.isInteger(width)).toBe(true);
        expect(Number.isInteger(height)).toBe(true);
        expect(Math.min(width, height)).toBeGreaterThanOrEqual(
          { '720p': 720, '1080p': 1080, '1440p': 1440, '4k': 2160 }[tier],
        );
      }
    }
  });

  it('does not mutate the preferences it reads', () => {
    const input = preferences('9:16', '1080p');
    const snapshot = structuredClone(input);
    resolveExportDimensions(input);
    expect(input).toEqual(snapshot);
  });
});

describe('resolveExportDimensions — custom sizes', () => {
  // `custom` carries explicit final dimensions, so the tier is deliberately
  // not consulted — otherwise the two settings would contradict each other.
  it('uses the given width and height exactly, ignoring the tier', () => {
    expect(dims('custom', '4k', { width: 1234, height: 567 })).toEqual({
      width: 1234,
      height: 567,
    });
    expect(dims('custom', '720p', { width: 1234, height: 567 })).toEqual({
      width: 1234,
      height: 567,
    });
  });

  it('refuses when custom is selected but no size was entered', () => {
    const result = resolveExportDimensions(preferences('custom'));
    expect(result.ok).toBe(false);
  });

  it('refuses zero and negative sizes', () => {
    for (const custom of [
      { width: 0, height: 1080 },
      { width: 1080, height: 0 },
      { width: -1080, height: 1080 },
    ]) {
      expect(resolveExportDimensions(preferences('custom', '1080p', custom)).ok).toBe(false);
    }
  });

  // These reach a WebGL render target without throwing and produce either a
  // driver-clamped size or a lost context — neither of which is a usable
  // export, and both of which look like the app broke.
  it('refuses non-finite sizes', () => {
    for (const custom of [
      { width: Number.NaN, height: 1080 },
      { width: 1080, height: Number.POSITIVE_INFINITY },
      { width: Number.NEGATIVE_INFINITY, height: Number.NaN },
    ]) {
      expect(resolveExportDimensions(preferences('custom', '1080p', custom)).ok).toBe(false);
    }
  });

  it('refuses fractional sizes rather than silently rounding', () => {
    expect(
      resolveExportDimensions(preferences('custom', '1080p', { width: 1080.5, height: 1080 })).ok,
    ).toBe(false);
  });

  it('refuses a side over the maximum', () => {
    const result = resolveExportDimensions(
      preferences('custom', '1080p', { width: MAX_EXPORT_DIMENSION_PX + 1, height: 100 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_EXPORT_DIMENSION_PX));
  });

  it('accepts exactly the maximum side', () => {
    expect(dims('custom', '1080p', { width: MAX_EXPORT_DIMENSION_PX, height: 100 })).toEqual({
      width: MAX_EXPORT_DIMENSION_PX,
      height: 100,
    });
  });

  it('refuses a side below the minimum', () => {
    expect(
      resolveExportDimensions(
        preferences('custom', '1080p', { width: MIN_EXPORT_DIMENSION_PX - 1, height: 100 }),
      ).ok,
    ).toBe(false);
  });

  // Both sides can be individually legal while the total is not — 3840×3840
  // is over twice the pixels of the largest preset.
  it('refuses a total pixel count over the budget even when both sides are legal', () => {
    const result = resolveExportDimensions(
      preferences('custom', '1080p', { width: 3840, height: 3840 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/pixels/i);
  });

  it('accepts the largest preset size as a custom size', () => {
    expect(dims('custom', '1080p', { width: 3840, height: 2160 })).toEqual({
      width: 3840,
      height: 2160,
    });
  });
});

describe('formatDimensions', () => {
  it('reads as a size, not a file estimate', () => {
    expect(formatDimensions({ width: 1080, height: 1920 })).toBe('1080 × 1920 px');
  });
});

import { describe, expect, it } from 'vitest';
import type { GarmentReference, Project } from '@threadform/types';
import { createProject } from './factory';
import { validateProject } from './validate';
import {
  setExportAspectRatio,
  setExportCustomDimensions,
  setExportImageFormat,
  setExportResolution,
  setExportTarget,
} from './exportPreferences';

const garment: GarmentReference = {
  garmentId: 'threadform-essential-tee',
  garmentVersion: '1.1.0',
  category: 't-shirt',
};

function base(): Project {
  return createProject(garment);
}

describe('setExportTarget', () => {
  // A target is not a mode: it sets the ordinary ratio and tier fields, so
  // downstream nothing can tell it apart from the user setting both.
  it('applies the ratio and resolution the target stands for', () => {
    const next = setExportTarget(base(), 'instagram-story', {
      aspectRatio: '9:16',
      resolution: '1080p',
    });
    expect(next.exportPreferences.target).toBe('instagram-story');
    expect(next.exportPreferences.aspectRatio).toBe('9:16');
    expect(next.exportPreferences.image.resolution).toBe('1080p');
  });

  it('leaves the ratio and resolution alone for custom', () => {
    const project = setExportAspectRatio(base(), '16:9', 'custom');
    const next = setExportTarget(project, 'custom', null);
    expect(next.exportPreferences.aspectRatio).toBe('16:9');
  });

  it('is a no-op when nothing would change', () => {
    const project = setExportTarget(base(), 'instagram-story', {
      aspectRatio: '9:16',
      resolution: '1080p',
    });
    expect(
      setExportTarget(project, 'instagram-story', { aspectRatio: '9:16', resolution: '1080p' }),
    ).toBe(project);
  });

  it('touches updatedAt on a real change', () => {
    const before = base();
    const after = setExportTarget(before, 'tiktok', { aspectRatio: '9:16', resolution: '1080p' });
    expect(after).not.toBe(before);
    expect(after.metadata.updatedAt >= before.metadata.updatedAt).toBe(true);
  });

  it('does not mutate the project it was given', () => {
    const project = base();
    const snapshot = structuredClone(project);
    setExportTarget(project, 'shopify', { aspectRatio: '1:1', resolution: '1440p' });
    expect(project).toEqual(snapshot);
  });
});

describe('setExportImageFormat', () => {
  it('sets the format', () => {
    expect(setExportImageFormat(base(), 'jpg').exportPreferences.image.format).toBe('jpg');
    expect(setExportImageFormat(base(), 'png-transparent').exportPreferences.image.format).toBe(
      'png-transparent',
    );
  });

  it('is a no-op for the format already selected', () => {
    const project = base();
    expect(setExportImageFormat(project, project.exportPreferences.image.format)).toBe(project);
  });

  it('leaves the video preferences untouched', () => {
    const before = base();
    const after = setExportImageFormat(before, 'webp');
    expect(after.exportPreferences.video).toEqual(before.exportPreferences.video);
  });
});

describe('setExportResolution / setExportAspectRatio', () => {
  it('sets the resolution and the caller-derived target together', () => {
    const next = setExportResolution(base(), '4k', 'custom');
    expect(next.exportPreferences.image.resolution).toBe('4k');
    expect(next.exportPreferences.target).toBe('custom');
  });

  it('sets the aspect ratio and the caller-derived target together', () => {
    const next = setExportAspectRatio(base(), '4:5', 'instagram-feed');
    expect(next.exportPreferences.aspectRatio).toBe('4:5');
    expect(next.exportPreferences.target).toBe('instagram-feed');
  });

  // The target is re-derived by the caller and written here so the stored
  // document can never claim a preset that no longer matches its settings.
  it('re-points the target when a manual edit no longer matches a preset', () => {
    const preset = setExportTarget(base(), 'instagram-story', {
      aspectRatio: '9:16',
      resolution: '1080p',
    });
    const edited = setExportResolution(preset, '720p', 'custom');
    expect(edited.exportPreferences.target).toBe('custom');
    expect(edited.exportPreferences.aspectRatio).toBe('9:16');
  });

  it('is a no-op when neither the value nor the target changes', () => {
    const project = setExportResolution(base(), '4k', 'custom');
    expect(setExportResolution(project, '4k', 'custom')).toBe(project);
    const withRatio = setExportAspectRatio(project, '16:9', 'custom');
    expect(setExportAspectRatio(withRatio, '16:9', 'custom')).toBe(withRatio);
  });
});

describe('setExportCustomDimensions', () => {
  it('stores whole-pixel dimensions', () => {
    const next = setExportCustomDimensions(base(), 1234, 567);
    expect(next.exportPreferences.customAspectRatio).toEqual({ width: 1234, height: 567 });
  });

  it('rounds fractional input rather than storing a sub-pixel size', () => {
    const next = setExportCustomDimensions(base(), 1080.6, 1919.2);
    expect(next.exportPreferences.customAspectRatio).toEqual({ width: 1081, height: 1919 });
  });

  /**
   * Deliberately permissive. These are two numbers a user is typing: on the
   * way to "1080" the field holds "1", and clearing it holds "0". Refusing
   * to store those would make the input fight the user mid-keystroke. The
   * *export* refuses, with a specific message, and the project stays intact.
   */
  it('stores an out-of-range size, leaving the refusal to the export itself', () => {
    expect(setExportCustomDimensions(base(), 0, 1080).exportPreferences.customAspectRatio).toEqual({
      width: 0,
      height: 1080,
    });
    expect(
      setExportCustomDimensions(base(), 99999, 99999).exportPreferences.customAspectRatio,
    ).toEqual({ width: 99999, height: 99999 });
  });

  // The exception: these can never become valid by typing more digits, and
  // would poison the document.
  it('refuses non-finite input outright', () => {
    const project = base();
    expect(setExportCustomDimensions(project, Number.NaN, 1080)).toBe(project);
    expect(setExportCustomDimensions(project, 1080, Number.POSITIVE_INFINITY)).toBe(project);
    expect(setExportCustomDimensions(project, Number.NEGATIVE_INFINITY, Number.NaN)).toBe(project);
  });

  it('is a no-op when the size is unchanged', () => {
    const project = setExportCustomDimensions(base(), 800, 600);
    expect(setExportCustomDimensions(project, 800, 600)).toBe(project);
  });
});

/**
 * M05 made `exportPreferences` real and widened `customAspectRatio` from
 * `.positive()` to `.finite()`. A widening, so every document valid before
 * M05 is still valid — this is where that is actually checked.
 */
describe('validation — projects saved before M05', () => {
  it('opens a project whose export preferences were never touched', () => {
    const result = validateProject(base());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.project.exportPreferences.image.format).toBe('png');
    expect(result.project.exportPreferences.aspectRatio).toBe('1:1');
  });

  it('opens a project carrying a mid-typing custom size instead of refusing it', () => {
    const project = setExportCustomDimensions(base(), 0, 1080) as unknown as Record<
      string,
      unknown
    >;
    expect(validateProject(project).success).toBe(true);
  });

  it('still rejects a non-finite custom size', () => {
    const project = base() as unknown as Record<string, unknown>;
    const preferences = structuredClone(base().exportPreferences) as unknown as Record<
      string,
      unknown
    >;
    preferences.customAspectRatio = { width: Number.POSITIVE_INFINITY, height: 100 };
    expect(validateProject({ ...project, exportPreferences: preferences }).success).toBe(false);
  });

  it('keeps the modeled video preferences intact through an image-only edit', () => {
    const next = setExportTarget(base(), 'etsy', { aspectRatio: '16:9', resolution: '1440p' });
    const result = validateProject(next);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Video is modeled but unimplemented; M05 must leave it compatible.
    expect(result.project.exportPreferences.video).toEqual({
      format: 'webm',
      resolution: '1080p',
      frameRate: 30,
    });
  });
});

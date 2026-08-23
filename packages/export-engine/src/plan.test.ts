import { describe, expect, it } from 'vitest';
import type { ExportImageFormat, ExportPreferences, Project } from '@threadform/types';
import { describeExportBlock, planImageExport } from './plan';
import { IMAGE_FORMATS, imageFormat } from './formats';
import { EXPORT_TARGETS, findExportTarget, matchTarget, targetSettings } from './targets';
import { exportFilename, slugifyProjectName } from './filename';

function project(name = 'My Project'): Pick<Project, 'metadata'> {
  return {
    metadata: {
      id: 'project_1',
      name,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      studioMode: '3d',
    },
  };
}

function preferences(overrides: Partial<ExportPreferences> = {}): ExportPreferences {
  return {
    target: 'custom',
    image: { format: 'png', resolution: '1080p' },
    video: { format: 'webm', resolution: '1080p', frameRate: 30 },
    aspectRatio: '1:1',
    ...overrides,
  };
}

describe('planImageExport', () => {
  it('resolves dimensions, encoder and filename together', () => {
    const result = planImageExport(project(), preferences({ aspectRatio: '9:16' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toEqual({
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      quality: undefined,
      transparent: false,
      format: 'png',
      filename: 'threadform-my-project-1080x1920.png',
    });
  });

  it('maps every format to its MIME type and extension', () => {
    const expected: Record<ExportImageFormat, { mimeType: string; extension: string }> = {
      png: { mimeType: 'image/png', extension: 'png' },
      'png-transparent': { mimeType: 'image/png', extension: 'png' },
      jpg: { mimeType: 'image/jpeg', extension: 'jpg' },
      webp: { mimeType: 'image/webp', extension: 'webp' },
    };
    for (const [format, want] of Object.entries(expected)) {
      const definition = imageFormat(format as ExportImageFormat);
      expect(definition.mimeType).toBe(want.mimeType);
      expect(definition.extension).toBe(want.extension);
    }
  });

  // `png-transparent` is PNG with the backdrop omitted, not a fourth encoder.
  it('marks only png-transparent as transparent, and still encodes it as PNG', () => {
    const transparent = planImageExport(
      project(),
      preferences({ image: { format: 'png-transparent', resolution: '1080p' } }),
    );
    expect(transparent.ok && transparent.plan.transparent).toBe(true);
    expect(transparent.ok && transparent.plan.mimeType).toBe('image/png');
    expect(transparent.ok && transparent.plan.filename.endsWith('.png')).toBe(true);

    for (const format of ['png', 'jpg', 'webp'] as const) {
      const plan = planImageExport(
        project(),
        preferences({ image: { format, resolution: '1080p' } }),
      );
      expect(plan.ok && plan.plan.transparent).toBe(false);
    }
  });

  it('gives lossy formats a quality and lossless ones none', () => {
    expect(IMAGE_FORMATS.png.quality).toBeUndefined();
    expect(IMAGE_FORMATS['png-transparent'].quality).toBeUndefined();
    expect(IMAGE_FORMATS.jpg.quality).toBeGreaterThan(0);
    expect(IMAGE_FORMATS.webp.quality).toBeGreaterThan(0);
    // One value, defined centrally — not a per-format guess.
    expect(IMAGE_FORMATS.jpg.quality).toBe(IMAGE_FORMATS.webp.quality);
  });

  it('fails with the dimension error rather than planning an impossible render', () => {
    const result = planImageExport(
      project(),
      preferences({ aspectRatio: 'custom', customAspectRatio: { width: 0, height: 10 } }),
    );
    expect(result.ok).toBe(false);
  });

  it('is deterministic — the same inputs give the same plan, including the name', () => {
    const a = planImageExport(project(), preferences({ aspectRatio: '4:5' }));
    const b = planImageExport(project(), preferences({ aspectRatio: '4:5' }));
    expect(a).toEqual(b);
  });

  it('does not mutate its inputs', () => {
    const prefs = preferences({ aspectRatio: '16:9' });
    const proj = project();
    const prefsSnapshot = structuredClone(prefs);
    const projSnapshot = structuredClone(proj);
    planImageExport(proj, prefs);
    expect(prefs).toEqual(prefsSnapshot);
    expect(proj).toEqual(projSnapshot);
  });
});

describe('filenames', () => {
  it('is derived from the project name and the real output size', () => {
    expect(
      exportFilename({ projectName: 'Summer Drop', width: 1080, height: 1350, extension: 'jpg' }),
    ).toBe('threadform-summer-drop-1080x1350.jpg');
  });

  // A timestamp would make two identical jobs produce different names for no
  // product value, and would make the export path untestable.
  it('carries no timestamp, so re-exporting overwrites rather than accumulates', () => {
    const first = exportFilename({
      projectName: 'Tee',
      width: 1080,
      height: 1080,
      extension: 'png',
    });
    const second = exportFilename({
      projectName: 'Tee',
      width: 1080,
      height: 1080,
      extension: 'png',
    });
    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{10,}/);
  });

  // A project name is user input being written into a filesystem path.
  it('strips path separators, traversal and other unsafe characters', () => {
    expect(slugifyProjectName('../../etc/passwd')).toBe('etc-passwd');
    expect(slugifyProjectName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(slugifyProjectName('  spaced   out  ')).toBe('spaced-out');
  });

  it('folds accents rather than dropping the letters', () => {
    expect(slugifyProjectName('Café Crème')).toBe('cafe-creme');
  });

  it('falls back when a name reduces to nothing', () => {
    expect(slugifyProjectName('!!!')).toBe('project');
    expect(slugifyProjectName('')).toBe('project');
    expect(exportFilename({ projectName: '???', width: 100, height: 100, extension: 'png' })).toBe(
      'threadform-project-100x100.png',
    );
  });

  it('caps an absurdly long name and never ends on a separator', () => {
    const slug = slugifyProjectName('word '.repeat(60));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('export targets', () => {
  // A target is data that resolves into an aspect ratio and a tier. If one
  // ever needed its own rendering path, this is the test that would fail.
  it('resolves every target to primitives that already exist', () => {
    for (const target of EXPORT_TARGETS) {
      if (target.id === 'custom') {
        expect(targetSettings('custom')).toBeNull();
        continue;
      }
      const settings = targetSettings(target.id);
      expect(settings).not.toBeNull();
      const plan = planImageExport(
        project(),
        preferences({
          target: target.id,
          aspectRatio: settings!.aspectRatio,
          image: { format: 'png', resolution: settings!.resolution },
        }),
      );
      expect(plan.ok).toBe(true);
    }
  });

  it('produces the documented sizes for the social and commerce presets', () => {
    const sized = (id: Parameters<typeof targetSettings>[0]) => {
      const settings = targetSettings(id)!;
      const plan = planImageExport(
        project(),
        preferences({
          aspectRatio: settings.aspectRatio,
          image: { format: 'png', resolution: settings.resolution },
        }),
      );
      if (!plan.ok) throw new Error('expected a plan');
      return `${plan.plan.width}x${plan.plan.height}`;
    };

    expect(sized('instagram-feed')).toBe('1080x1350');
    expect(sized('instagram-story')).toBe('1080x1920');
    expect(sized('tiktok')).toBe('1080x1920');
    expect(sized('youtube-shorts')).toBe('1080x1920');
    expect(sized('shopify')).toBe('1440x1440');
    expect(sized('amazon')).toBe('2160x2160');
    expect(sized('etsy')).toBe('2560x1440');
  });

  it('finds a target by id, and nothing for one that does not exist', () => {
    expect(findExportTarget('tiktok')?.label).toBe('TikTok');
    // Every id in the union has a row — a target with no data would be a
    // control that resolves to nothing.
    const ids = EXPORT_TARGETS.map((target) => target.id);
    for (const id of [
      'instagram-feed',
      'instagram-story',
      'tiktok',
      'youtube-shorts',
      'shopify',
      'amazon',
      'etsy',
      'custom',
    ] as const) {
      expect(ids).toContain(id);
    }
  });

  // So a highlighted preset can never disagree with what will be rendered.
  it('matches settings back to a target, falling back to custom', () => {
    expect(matchTarget('9:16', '1080p')).toBe('instagram-story');
    expect(matchTarget('4:5', '1080p')).toBe('instagram-feed');
    expect(matchTarget('1:1', '720p')).toBe('custom');
    expect(matchTarget('custom', '1080p')).toBe('custom');
  });
});

describe('describeExportBlock', () => {
  it('names the layers that are not ready rather than failing generically', () => {
    expect(describeExportBlock({ kind: 'artwork-failed', layerNames: ['Chest mark'] })).toContain(
      'Chest mark',
    );
    expect(
      describeExportBlock({ kind: 'artwork-not-ready', layerNames: ['Back print'] }),
    ).toContain('Back print');
  });

  it('names the format a browser cannot encode', () => {
    expect(describeExportBlock({ kind: 'format-unsupported', format: 'webp' })).toContain('WebP');
  });

  it('passes an invalid-settings error through unchanged', () => {
    expect(describeExportBlock({ kind: 'invalid-settings', error: 'Too big.' })).toBe('Too big.');
  });
});

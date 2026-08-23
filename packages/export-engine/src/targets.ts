import type { ExportAspectRatio, ExportResolution, ExportTargetPreset } from '@threadform/types';

/**
 * Export targets are **data, not code paths**.
 *
 * A target resolves into the primitives that already exist — an aspect ratio
 * and a resolution tier — and nothing else. Choosing one is therefore
 * indistinguishable, downstream, from setting those two fields by hand, and
 * adding a target later is a row in this table rather than another rendering
 * path. `EXPORT_SPEC.md` states this rule; this is where it is kept honest.
 *
 * **These are ThreadForm export presets, not platform compliance.** They are
 * sensible, conservative starting points named after where people tend to
 * post — nothing here is a guarantee that a platform accepts, prefers, or
 * will keep accepting a given size. Platforms change their requirements
 * without notice, and the product deliberately does not claim otherwise: the
 * user can always override the ratio and tier afterwards, and the panel
 * shows the real pixel size it is about to render.
 */

export interface ExportTargetDefinition {
  id: ExportTargetPreset;
  label: string;
  /** Factual, short. Describes the shape, never promises platform acceptance. */
  description: string;
  /** `null` for `custom`, which means "whatever the user has set". */
  aspectRatio: Exclude<ExportAspectRatio, 'custom'> | null;
  resolution: ExportResolution | null;
}

export const EXPORT_TARGETS: ExportTargetDefinition[] = [
  {
    id: 'custom',
    label: 'Custom',
    description: 'Choose the shape and size yourself.',
    aspectRatio: null,
    resolution: null,
  },
  {
    id: 'instagram-feed',
    label: 'Instagram feed',
    description: 'Tall 4:5 feed post.',
    aspectRatio: '4:5',
    resolution: '1080p',
  },
  {
    id: 'instagram-story',
    label: 'Instagram story',
    description: 'Full-screen 9:16.',
    aspectRatio: '9:16',
    resolution: '1080p',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Full-screen 9:16.',
    aspectRatio: '9:16',
    resolution: '1080p',
  },
  {
    id: 'youtube-shorts',
    label: 'YouTube Shorts',
    description: 'Full-screen 9:16.',
    aspectRatio: '9:16',
    resolution: '1080p',
  },
  {
    id: 'shopify',
    label: 'Shopify',
    description: 'Square product shot.',
    aspectRatio: '1:1',
    resolution: '1440p',
  },
  {
    id: 'amazon',
    label: 'Amazon',
    description: 'Square product shot, larger.',
    aspectRatio: '1:1',
    // Amazon's listing imagery rewards detail, so this preset starts at the
    // largest square tier rather than the common 1080.
    resolution: '4k',
  },
  {
    id: 'etsy',
    label: 'Etsy',
    description: 'Landscape 16:9 listing image.',
    aspectRatio: '16:9',
    resolution: '1440p',
  },
];

export function findExportTarget(id: ExportTargetPreset): ExportTargetDefinition | undefined {
  return EXPORT_TARGETS.find((target) => target.id === id);
}

/**
 * The aspect ratio and resolution a target implies, or `null` for `custom`.
 *
 * Callers apply this through the normal `ExportPreferences` mutations, so a
 * target selection ends up indistinguishable from the user having set both
 * fields themselves — which is what keeps a target from becoming a mode.
 */
export function targetSettings(
  id: ExportTargetPreset,
): { aspectRatio: Exclude<ExportAspectRatio, 'custom'>; resolution: ExportResolution } | null {
  const target = findExportTarget(id);
  if (!target || target.aspectRatio === null || target.resolution === null) return null;
  return { aspectRatio: target.aspectRatio, resolution: target.resolution };
}

/**
 * Which target, if any, the current settings correspond to. Used so the
 * panel can show the user's manual ratio/tier edits falling back to
 * "Custom" rather than leaving a preset highlighted that no longer matches
 * what will be rendered.
 */
export function matchTarget(
  aspectRatio: ExportAspectRatio,
  resolution: ExportResolution,
): ExportTargetPreset {
  if (aspectRatio === 'custom') return 'custom';
  const match = EXPORT_TARGETS.find(
    (target) => target.aspectRatio === aspectRatio && target.resolution === resolution,
  );
  return match?.id ?? 'custom';
}

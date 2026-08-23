import type { ExportAspectRatio, ExportPreferences, ExportResolution } from '@threadform/types';

/**
 * How an export's pixel dimensions are decided.
 *
 * This is the one place in ThreadForm that turns "1080p, 9:16" into
 * "1080 × 1920". Everything else — the panel's read-out, the off-screen
 * renderer's canvas size, the filename — asks this function, so a component
 * can never become a second source of truth for a pixel count.
 */

/**
 * A resolution tier names the **short edge**, not the height.
 *
 * `EXPORT_SPEC.md` named the tiers without saying what they mean off 16:9,
 * which is ambiguous exactly where it matters: "1080p" at 9:16 could
 * defensibly be 1080×1920 or 607×1080. Short-edge is the rule because it is
 * what the tier name means to the person choosing it — a "1080p" story is a
 * 1080-wide story, and a "4K" landscape render is 3840 across. Height-based
 * would make every portrait export quietly lower-resolution than its label.
 */
export const RESOLUTION_SHORT_EDGE_PX: Record<ExportResolution, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  // The tier is named for its long edge in the broadcast convention (3840),
  // but its short edge on 16:9 is 2160 — which is what keeps it consistent
  // with the others.
  '4k': 2160,
};

/** Width ÷ height for each named ratio. `custom` has no fixed ratio — its dimensions are given explicitly. */
export const ASPECT_RATIO_VALUE: Record<Exclude<ExportAspectRatio, 'custom'>, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
};

/**
 * Client-side ceilings. A browser asked for a 20000px render target does not
 * politely decline — it either throws, silently clamps to something the
 * driver allows, or loses the WebGL context and takes the Studio with it.
 * Refusing here is the difference between a clear message and a blank tab.
 *
 * 3840 × 2160 is exactly the largest tier this milestone offers, so no
 * preset can ever hit the ceiling; only a hand-entered custom size can.
 */
export const MAX_EXPORT_DIMENSION_PX = 3840;
export const MAX_EXPORT_PIXELS = 3840 * 2160;
export const MIN_EXPORT_DIMENSION_PX = 16;

export interface ExportDimensions {
  width: number;
  height: number;
}

export type DimensionResult =
  { ok: true; dimensions: ExportDimensions } | { ok: false; error: string };

/**
 * Rounds a derived edge to whole pixels. `Math.round` rather than floor or
 * ceil so a ratio and its inverse stay symmetric (1080/(9/16) and
 * 1080×(16/9) both land on 1920), and so the result never drifts a pixel
 * below the tier the user picked.
 */
function edge(shortEdge: number, ratio: number): ExportDimensions {
  // The short edge is whichever of width/height the ratio makes smaller.
  return ratio >= 1
    ? { width: Math.round(shortEdge * ratio), height: shortEdge }
    : { width: shortEdge, height: Math.round(shortEdge / ratio) };
}

function validate(dimensions: ExportDimensions): DimensionResult {
  const { width, height } = dimensions;

  for (const value of [width, height]) {
    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Export size must be a number.' };
    }
    if (!Number.isInteger(value)) {
      return { ok: false, error: 'Export size must be a whole number of pixels.' };
    }
    if (value < MIN_EXPORT_DIMENSION_PX) {
      return {
        ok: false,
        error: `Export size must be at least ${MIN_EXPORT_DIMENSION_PX}px on each side.`,
      };
    }
    if (value > MAX_EXPORT_DIMENSION_PX) {
      return {
        ok: false,
        error: `Export size can be at most ${MAX_EXPORT_DIMENSION_PX}px on each side.`,
      };
    }
  }

  if (width * height > MAX_EXPORT_PIXELS) {
    return {
      ok: false,
      error: `That size is ${width}×${height}, which is more pixels than an export can render safely.`,
    };
  }

  return { ok: true, dimensions: { width, height } };
}

/**
 * The pixel size an export will actually produce.
 *
 * A `custom` aspect ratio carries **explicit final dimensions** rather than a
 * ratio to apply the tier to — that is what `EXPORT_SPEC.md` describes, and
 * it is the only reading under which the resolution tier and the custom
 * numbers do not contradict each other. When `custom` is selected the tier
 * is deliberately not consulted.
 */
export function resolveExportDimensions(preferences: ExportPreferences): DimensionResult {
  if (preferences.aspectRatio === 'custom') {
    const custom = preferences.customAspectRatio;
    if (!custom) {
      return { ok: false, error: 'Enter a width and height for a custom export size.' };
    }
    return validate({ width: custom.width, height: custom.height });
  }

  const ratio = ASPECT_RATIO_VALUE[preferences.aspectRatio];
  const shortEdge = RESOLUTION_SHORT_EDGE_PX[preferences.image.resolution];
  if (ratio === undefined || shortEdge === undefined) {
    return { ok: false, error: 'That combination of size and shape is not supported.' };
  }

  return validate(edge(shortEdge, ratio));
}

/** `1080 × 1920 px`, for the panel's read-out. Never an estimated file size — that would be a guess. */
export function formatDimensions({ width, height }: ExportDimensions): string {
  return `${width} × ${height} px`;
}

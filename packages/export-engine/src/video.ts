import type {
  ExportFrameRate,
  ExportPreferences,
  ExportResolution,
  ExportVideoFormat,
  Project,
} from '@threadform/types';
import { ASPECT_RATIO_VALUE, RESOLUTION_SHORT_EDGE_PX } from './dimensions';
import type { ExportDimensions, DimensionResult } from './dimensions';
import { exportFilename } from './filename';

/**
 * Video export decisions, as pure data.
 *
 * Same rule as the image half of this package: everything with a right
 * answer — how many pixels, how many frames, which container, what the file
 * is called — is settled here by a function with tests, and the renderer is
 * left with nothing to decide. It has no DOM dependency except the one
 * capability probe, which cannot be anything else.
 *
 * **What is deliberately not here:** 4K and 60fps. Video export renders and
 * records in real time, so those are not free the way a larger still is —
 * they are a longer wait and a higher chance of a dropped frame, and this
 * milestone would rather ship two resolutions that always work than four
 * that sometimes do. The tiers are modelled in `ExportResolution` and simply
 * not offered for video.
 */

/** Video tiers this build offers. `1440p` and `4k` are modelled and not offered — see above. */
export const VIDEO_RESOLUTIONS: readonly ExportResolution[] = ['720p', '1080p'];

/**
 * Frame rates this build offers.
 *
 * `ExportFrameRate` also names 60. A 60fps clip is twice the frames in the
 * same real-time recording window, which is where a browser encoder starts
 * dropping them — and a video that silently drops frames is exactly the kind
 * of "it worked on my machine" output this project refuses to ship. Not
 * offered until it is measured, not because it is impossible.
 */
export const VIDEO_FRAME_RATES: readonly ExportFrameRate[] = [24, 30];

/**
 * Encoders want even dimensions; several reject odd ones outright and
 * others silently pad. Every tier/ratio combination this build offers is
 * already even, so this only ever bites a hand-entered custom size.
 */
export const MAX_VIDEO_DIMENSION_PX = 1920;
export const MIN_VIDEO_DIMENSION_PX = 128;

export interface VideoFormatDefinition {
  id: ExportVideoFormat;
  label: string;
  description: string;
  /**
   * MIME types to try, best first. `MediaRecorder` is asked about each in
   * turn: a browser may support the container with one codec and not
   * another, and there is no way to know but to ask.
   */
  candidateMimeTypes: readonly string[];
  extension: string;
}

export const VIDEO_FORMATS: Record<ExportVideoFormat, VideoFormatDefinition> = {
  webm: {
    id: 'webm',
    label: 'WebM',
    description: 'Plays in browsers and on most social platforms. Widely supported.',
    // VP9 first for quality per bit, VP8 as the older fallback, then the
    // container alone — which lets a browser pick its own default codec.
    candidateMimeTypes: [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ],
    extension: 'webm',
  },
  mp4: {
    id: 'mp4',
    label: 'MP4',
    description: 'H.264. Only offered when this browser can genuinely record it.',
    candidateMimeTypes: [
      'video/mp4;codecs=avc1.4d002a',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ],
    extension: 'mp4',
  },
};

/** In the order the Studio should offer them. */
export const VIDEO_FORMAT_ORDER: readonly ExportVideoFormat[] = ['webm', 'mp4'];

export function videoFormat(format: ExportVideoFormat): VideoFormatDefinition {
  return VIDEO_FORMATS[format];
}

/**
 * The exact MIME type this browser will record `format` as, or `null` if it
 * cannot record it at all.
 *
 * Probed, never assumed. Chrome has recorded WebM since 2016 and MP4 only
 * very recently; Safari is the other way round; a user-agent string answers
 * neither question reliably. Asking `MediaRecorder` is the only honest
 * answer, and it is also what stops ThreadForm handing someone a `.mp4`
 * containing WebM bytes — the video equivalent of the `toBlob` PNG-fallback
 * trap the image path already guards against.
 */
export function recordableVideoMimeType(format: ExportVideoFormat): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
  for (const mimeType of videoFormat(format).candidateMimeTypes) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    } catch {
      // A browser that throws rather than returning false has answered.
    }
  }
  return null;
}

export function canRecordVideoFormat(format: ExportVideoFormat): boolean {
  return recordableVideoMimeType(format) !== null;
}

/** Whether this browser can record video at all — the whole feature depends on it. */
export function canRecordVideo(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof HTMLCanvasElement === 'undefined') return false;
  return typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** The formats this browser can produce, for building the panel's options. */
export function supportedVideoFormats(): ExportVideoFormat[] {
  if (!canRecordVideo()) return [];
  return VIDEO_FORMAT_ORDER.filter((format) => canRecordVideoFormat(format));
}

function evenDown(value: number): number {
  return value % 2 === 0 ? value : value - 1;
}

function validateVideo(dimensions: ExportDimensions): DimensionResult {
  const width = evenDown(Math.round(dimensions.width));
  const height = evenDown(Math.round(dimensions.height));

  for (const value of [width, height]) {
    if (!Number.isFinite(value)) return { ok: false, error: 'Video size must be a number.' };
    if (value < MIN_VIDEO_DIMENSION_PX) {
      return {
        ok: false,
        error: `Video must be at least ${MIN_VIDEO_DIMENSION_PX}px on each side.`,
      };
    }
    if (value > MAX_VIDEO_DIMENSION_PX) {
      return {
        ok: false,
        error: `Video can be at most ${MAX_VIDEO_DIMENSION_PX}px on each side. Reduce the size or choose a different shape.`,
      };
    }
  }

  return { ok: true, dimensions: { width, height } };
}

/**
 * The pixel size a video export will actually produce.
 *
 * Shares the image path's short-edge semantics — "1080p" names the shortest
 * side, so 1080p at 9:16 is 1080 × 1920 — because a project has one aspect
 * ratio and a user who has learned what a tier means for a still should not
 * have to learn a second rule for a clip. What differs is the ceiling and
 * the evenness requirement, both of which are encoder facts rather than
 * product decisions.
 */
export function resolveVideoDimensions(preferences: ExportPreferences): DimensionResult {
  if (preferences.aspectRatio === 'custom') {
    const custom = preferences.customAspectRatio;
    if (!custom) return { ok: false, error: 'Enter a width and height for a custom size.' };
    return validateVideo({ width: custom.width, height: custom.height });
  }

  const ratio = ASPECT_RATIO_VALUE[preferences.aspectRatio];
  const shortEdge = RESOLUTION_SHORT_EDGE_PX[preferences.video.resolution];
  if (ratio === undefined || shortEdge === undefined) {
    return { ok: false, error: 'That combination of size and shape is not supported for video.' };
  }
  if (!VIDEO_RESOLUTIONS.includes(preferences.video.resolution)) {
    return {
      ok: false,
      error: 'Video export supports 720p and 1080p. Choose one of those sizes.',
    };
  }

  return validateVideo(
    ratio >= 1
      ? { width: Math.round(shortEdge * ratio), height: shortEdge }
      : { width: shortEdge, height: Math.round(shortEdge / ratio) },
  );
}

export interface VideoExportPlan {
  width: number;
  height: number;
  frameRate: ExportFrameRate;
  format: ExportVideoFormat;
  /** The exact type `MediaRecorder` was told it can produce. */
  mimeType: string;
  filename: string;
  /**
   * Target bitrate. Derived from the pixel rate rather than fixed, so a
   * 720p24 clip is not given a 1080p30 budget it cannot use and a 1080p30
   * clip is not starved into blocking artefacts on the fabric weave.
   */
  videoBitsPerSecond: number;
}

export type VideoExportPlanResult =
  | { ok: true; plan: VideoExportPlan }
  | { ok: false; error: string };

/**
 * Bits per pixel per second. 0.11 is a middling-quality H.264/VP9 figure —
 * about 6.8 Mbps at 1080p30, which holds up on a fabric weave and a printed
 * edge without producing a file too large to send.
 */
const BITS_PER_PIXEL_SECOND = 0.11;

export function videoBitrate(width: number, height: number, frameRate: number): number {
  return Math.round(width * height * frameRate * BITS_PER_PIXEL_SECOND);
}

/**
 * Builds a video export plan from a project and its preferences.
 *
 * `mimeType` is supplied by the caller rather than probed here, for the same
 * reason the image planner does not probe: this module stays pure and
 * testable, and the one function that has to touch `MediaRecorder`
 * (`recordableVideoMimeType`) is separate and called once.
 */
export function planVideoExport(
  project: Pick<Project, 'metadata'>,
  preferences: ExportPreferences,
  mimeType: string | null,
): VideoExportPlanResult {
  const dimensions = resolveVideoDimensions(preferences);
  if (!dimensions.ok) return { ok: false, error: dimensions.error };

  const definition = videoFormat(preferences.video.format);
  if (!definition) return { ok: false, error: 'That video format is not supported.' };
  if (!mimeType) {
    return { ok: false, error: `This browser can't record ${definition.label}.` };
  }

  const frameRate = preferences.video.frameRate;
  if (!VIDEO_FRAME_RATES.includes(frameRate)) {
    return { ok: false, error: 'Video export supports 24 and 30 frames per second.' };
  }

  const { width, height } = dimensions.dimensions;
  return {
    ok: true,
    plan: {
      width,
      height,
      frameRate,
      format: definition.id,
      mimeType,
      filename: exportFilename({
        projectName: project.metadata.name,
        width,
        height,
        extension: definition.extension,
        // Two clips of the same project at the same size but different
        // frame rates are different files, so the name has to say which.
        suffix: `${frameRate}fps`,
      }),
      videoBitsPerSecond: videoBitrate(width, height, frameRate),
    },
  };
}

/**
 * The states a video job passes through.
 *
 * Held as application state, never inside a `Project` — same reason as the
 * image job: "currently recording" is a fact about this tab in this moment.
 *
 * `rendering` carries a real frame count rather than a percentage invented
 * from a timer. It is the one number here that is honestly measurable: the
 * exporter knows exactly how many frames the clip has and exactly how many
 * it has drawn. `encoding` deliberately carries no progress, because the
 * browser's encoder does not report any and a moving bar during it would be
 * a fiction.
 */
export type VideoJobState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | {
      status: 'rendering';
      dimensions: ExportDimensions;
      renderedFrames: number;
      totalFrames: number;
    }
  | { status: 'encoding'; dimensions: ExportDimensions }
  | {
      status: 'completed';
      filename: string;
      dimensions: ExportDimensions;
      byteSize: number;
      durationMs: number;
    }
  | { status: 'failed'; error: string };

/** Why a video export could not run. Each maps to a specific, actionable message. */
export type VideoBlockReason =
  | { kind: 'no-project' }
  | { kind: 'garment-not-ready' }
  | { kind: 'artwork-not-ready'; layerNames: string[] }
  | { kind: 'artwork-failed'; layerNames: string[] }
  | { kind: 'recording-unsupported' }
  | { kind: 'format-unsupported'; format: ExportVideoFormat }
  | { kind: 'animation-static' }
  | { kind: 'invalid-settings'; error: string };

export function describeVideoBlock(reason: VideoBlockReason): string {
  switch (reason.kind) {
    case 'no-project':
      return 'Open or create a project before exporting.';
    case 'garment-not-ready':
      return 'The garment is still loading. Try again in a moment.';
    case 'artwork-not-ready':
      return `Still loading artwork: ${reason.layerNames.join(', ')}. Try again in a moment.`;
    case 'artwork-failed':
      // The same refusal the image path makes, for the same reason: a file
      // presented as finished output cannot silently omit artwork the user
      // placed and can see listed.
      return `Can't export — this artwork couldn't be loaded: ${reason.layerNames.join(', ')}. Replace or remove it, then export again.`;
    case 'recording-unsupported':
      return "This browser can't record video from a canvas. Image export still works.";
    case 'format-unsupported':
      return `This browser can't record ${videoFormat(reason.format).label}. Choose another format.`;
    case 'animation-static':
      return 'Choose an animation in the Motion panel — Idle has nothing to record.';
    case 'invalid-settings':
      return reason.error;
  }
}

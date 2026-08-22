import type { ArtworkFileKind } from '@threadform/types';
import {
  ACCEPTED_ARTWORK_LABEL,
  MAX_ARTWORK_BYTES,
  MAX_ARTWORK_DIMENSION,
  MAX_ARTWORK_PIXELS,
  MIN_ARTWORK_DIMENSION,
} from './limits';
import { sniffArtworkFileKind } from './sniff';
import { readImageHeaderSize } from './imageHeader';
import { sanitizeSvg } from './sanitizeSvg';

/**
 * The artwork trust boundary, in one pure-ish place: bytes in, either a
 * rejection with user-facing copy or a normalized, safe-to-store artwork
 * out. It performs no I/O and touches no storage, so the whole policy —
 * what a file *is*, how large it may be, and what an SVG is allowed to
 * contain — is testable without a browser, a network, or a database.
 *
 * The bytes it returns are the bytes that get persisted: identical to the
 * input for raster formats, and the *rebuilt* markup for SVG, so the
 * original (potentially hostile) document never reaches storage.
 */

export interface ValidatedArtwork {
  fileKind: ArtworkFileKind;
  /** What should be written to storage — sanitized markup for SVG, the original bytes otherwise. */
  bytes: Uint8Array;
  mimeType: string;
  pixelWidth: number;
  pixelHeight: number;
  byteSize: number;
}

export type ArtworkValidationResult =
  { ok: true; artwork: ValidatedArtwork } | { ok: false; error: string };

const MIME_TYPE: Record<ArtworkFileKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function checkDimensions(width: number, height: number): string | null {
  if (width < MIN_ARTWORK_DIMENSION || height < MIN_ARTWORK_DIMENSION) {
    return 'That image is too small to use as artwork.';
  }
  if (width > MAX_ARTWORK_DIMENSION || height > MAX_ARTWORK_DIMENSION) {
    return `That image is ${width}×${height}. The largest side can be ${MAX_ARTWORK_DIMENSION} pixels.`;
  }
  if (width * height > MAX_ARTWORK_PIXELS) {
    return `That image is ${width}×${height}, which is too many pixels to process safely.`;
  }
  return null;
}

export function validateArtworkBytes(bytes: Uint8Array): ArtworkValidationResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if (bytes.byteLength > MAX_ARTWORK_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatMegabytes(bytes.byteLength)}. Artwork can be up to ${formatMegabytes(MAX_ARTWORK_BYTES)}.`,
    };
  }

  const fileKind = sniffArtworkFileKind(bytes);
  if (!fileKind) {
    return {
      ok: false,
      error: `That file isn't a supported image. Use ${ACCEPTED_ARTWORK_LABEL}.`,
    };
  }

  if (fileKind === 'svg') {
    const markup = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const sanitized = sanitizeSvg(markup);
    if (!sanitized.ok) return { ok: false, error: sanitized.error };

    const dimensionError = checkDimensions(sanitized.width, sanitized.height);
    if (dimensionError) return { ok: false, error: dimensionError };

    const rebuilt = new TextEncoder().encode(sanitized.markup);
    return {
      ok: true,
      artwork: {
        fileKind,
        bytes: rebuilt,
        mimeType: MIME_TYPE.svg,
        pixelWidth: Math.round(sanitized.width),
        pixelHeight: Math.round(sanitized.height),
        byteSize: rebuilt.byteLength,
      },
    };
  }

  const headerSize = readImageHeaderSize(bytes, fileKind);
  if (!headerSize) {
    return { ok: false, error: "That image file is damaged and couldn't be read." };
  }

  const dimensionError = checkDimensions(headerSize.width, headerSize.height);
  if (dimensionError) return { ok: false, error: dimensionError };

  return {
    ok: true,
    artwork: {
      fileKind,
      bytes,
      mimeType: MIME_TYPE[fileKind],
      pixelWidth: headerSize.width,
      pixelHeight: headerSize.height,
      byteSize: bytes.byteLength,
    },
  };
}

/** Convenience wrapper for the browser side — reads the blob, then applies exactly the checks above. */
export async function validateArtworkBlob(blob: Blob): Promise<ArtworkValidationResult> {
  if (blob.size > MAX_ARTWORK_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatMegabytes(blob.size)}. Artwork can be up to ${formatMegabytes(MAX_ARTWORK_BYTES)}.`,
    };
  }
  return validateArtworkBytes(new Uint8Array(await blob.arrayBuffer()));
}

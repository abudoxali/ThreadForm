import type { ArtworkFileKind } from '@threadform/types';

/**
 * Hard limits enforced at the artwork trust boundary. These exist to stop a
 * single file from exhausting the tab's memory (a "decompression bomb": a
 * few kilobytes of PNG can declare a 30000×30000 canvas, ~3.6 GB once
 * decoded) and to keep IndexedDB payloads small enough that a project stays
 * quick to save and load — see `docs/PRIVACY_SECURITY.md`.
 */

/** Largest artwork file accepted, in bytes. */
export const MAX_ARTWORK_BYTES = 12 * 1024 * 1024;

/** Largest accepted extent on either axis, in pixels. */
export const MAX_ARTWORK_DIMENSION = 8192;

/**
 * Largest accepted total pixel count. Checked *in addition to* the per-axis
 * limit, because 8192×8192 is within that limit and still 268 megapixels.
 */
export const MAX_ARTWORK_PIXELS = 40_000_000;

/** Smallest accepted extent — a 0- or 1-pixel image is a corrupt or hostile file, not artwork. */
export const MIN_ARTWORK_DIMENSION = 2;

/**
 * The formats ThreadForm accepts, per `ArtworkFileKind`. Membership here is
 * decided by the file's actual signature (`sniffArtworkFileKind`), never by
 * its declared MIME type or filename extension.
 */
export const ACCEPTED_ARTWORK_KINDS = [
  'png',
  'jpeg',
  'webp',
  'svg',
] as const satisfies readonly ArtworkFileKind[];

/**
 * Narrows an arbitrary string to an `ArtworkFileKind`. Lives beside
 * `ACCEPTED_ARTWORK_KINDS` so the one assertion in the codebase that widens
 * a string into that union sits directly next to the list it was checked
 * against, rather than being repeated wherever a stored or serialized kind
 * has to be read back.
 */
export function isArtworkFileKind(value: string): value is ArtworkFileKind {
  return (ACCEPTED_ARTWORK_KINDS as readonly string[]).includes(value);
}

/** For a file input's `accept` attribute — a convenience filter for the picker dialog, never a security control. */
export const ARTWORK_ACCEPT_ATTRIBUTE = 'image/png,image/jpeg,image/webp,image/svg+xml';

export const ARTWORK_KIND_LABEL: Record<ArtworkFileKind, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  svg: 'SVG',
};

/** Human-readable list of accepted formats, for empty states and error copy. */
export const ACCEPTED_ARTWORK_LABEL = 'PNG, JPEG, WebP or SVG';

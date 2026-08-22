import type { ArtworkFileKind } from '@threadform/types';
import { validateArtworkBlob } from './validate';
import type { ValidatedArtwork } from './validate';

/**
 * Turns artwork bytes into something the renderer can draw, and owns the
 * object-URL lifetime that comes with it.
 *
 * `docs/PRIVACY_SECURITY.md` is explicit that an object URL created for
 * display must be revoked when its owner goes away; a long editing session
 * that swaps artwork repeatedly would otherwise pin every previous blob in
 * memory for the lifetime of the document. Rather than leaving that to each
 * call site, every decode here returns a `release()` and that is the only
 * supported way to finish with the result — including on the failure paths,
 * which revoke before returning.
 */

export interface DecodedArtwork {
  /** Ready to draw — already loaded, so a canvas can use it immediately. */
  image: HTMLImageElement;
  width: number;
  height: number;
  fileKind: ArtworkFileKind;
  /** Revokes the object URL backing `image`. Safe to call more than once. */
  release: () => void;
}

export type ArtworkDecodeResult =
  { ok: true; artwork: DecodedArtwork } | { ok: false; error: string };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = url;
  });
}

async function decodeValidated(artwork: ValidatedArtwork): Promise<ArtworkDecodeResult> {
  const blob = new Blob([artwork.bytes as BlobPart], { type: artwork.mimeType });
  const url = URL.createObjectURL(blob);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    URL.revokeObjectURL(url);
  };

  try {
    const image = await loadImage(url);
    return {
      ok: true,
      artwork: {
        image,
        // The validated size is authoritative: a browser may report a
        // default `naturalWidth` for an SVG sized only by its `viewBox`.
        width: artwork.pixelWidth,
        height: artwork.pixelHeight,
        fileKind: artwork.fileKind,
        release,
      },
    };
  } catch {
    release();
    return { ok: false, error: "That image couldn't be displayed - the file may be damaged." };
  }
}

/**
 * Validates and decodes a blob read back from storage. Persisted bytes are
 * re-validated (and SVG re-sanitized) rather than trusted: they crossed a
 * storage boundary, exactly like a persisted `Project` does before
 * `validateProject` runs on it.
 *
 * `expectedKind` is the kind the project recorded at import; a mismatch
 * means the stored blob is not what the project believes it is, and is
 * refused rather than rendered.
 */
export async function decodeStoredArtwork(
  blob: Blob,
  expectedKind: ArtworkFileKind,
): Promise<ArtworkDecodeResult> {
  const validated = await validateArtworkBlob(blob);
  if (!validated.ok) return validated;
  if (validated.artwork.fileKind !== expectedKind) {
    return { ok: false, error: "That artwork file doesn't match what this project expects." };
  }
  return decodeValidated(validated.artwork);
}

export interface ImportedArtwork {
  /** Exactly what should be persisted - sanitized for SVG, byte-identical for raster formats. */
  blob: Blob;
  fileKind: ArtworkFileKind;
  pixelWidth: number;
  pixelHeight: number;
  byteSize: number;
  decoded: DecodedArtwork;
}

export type ArtworkImportResult =
  { ok: true; artwork: ImportedArtwork } | { ok: false; error: string };

/**
 * The full import path for a user-selected file: validate, sanitize, then
 * prove the browser can actually decode the result before anything is
 * written to storage. A file that passes every structural check but still
 * fails to decode is rejected here, so a project can never end up
 * referencing a blob that will not render.
 */
export async function importArtworkFile(file: Blob): Promise<ArtworkImportResult> {
  const validated = await validateArtworkBlob(file);
  if (!validated.ok) return validated;

  const decoded = await decodeValidated(validated.artwork);
  if (!decoded.ok) return decoded;

  return {
    ok: true,
    artwork: {
      blob: new Blob([validated.artwork.bytes as BlobPart], { type: validated.artwork.mimeType }),
      fileKind: validated.artwork.fileKind,
      pixelWidth: validated.artwork.pixelWidth,
      pixelHeight: validated.artwork.pixelHeight,
      byteSize: validated.artwork.byteSize,
      decoded: decoded.artwork,
    },
  };
}

/**
 * A display name derived from the uploaded filename: extension dropped,
 * whitespace collapsed, length capped, and an empty result replaced. Kept
 * here rather than in a component so every entry point names layers the
 * same way. The result is rendered as text by React, never as markup.
 */
export function artworkNameFromFileName(fileName: string, fallback = 'Artwork'): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '');
  const collapsed = withoutExtension.replace(/[\s_]+/g, ' ').trim();
  if (!collapsed) return fallback;
  return collapsed.length > 60 ? `${collapsed.slice(0, 60).trimEnd()}...` : collapsed;
}

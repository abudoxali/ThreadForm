import type { ArtworkFileKind } from '@threadform/types';

/**
 * Identifies an artwork file from its actual bytes. A browser's reported
 * `File.type` comes from the OS's extension mapping and is trivially
 * spoofed by renaming a file, so it is never consulted here — this is the
 * only thing allowed to decide what a byte stream *is*
 * (`docs/PRIVACY_SECURITY.md`, "File validation").
 *
 * Returns `null` for anything not on the accepted list, including files
 * whose header is truncated: an unrecognized header is a rejection, never a
 * "probably fine" fallback.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8

/** Enough bytes for every check below, including the SVG text probe. */
export const ARTWORK_SNIFF_BYTES = 1024;

function matchesAt(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * SVG has no binary magic number, so it is detected structurally: strip a
 * UTF-8 BOM and leading whitespace, then require the document to open with
 * an XML declaration, a doctype, an XML comment, or the `<svg` element
 * itself. Anything else (notably HTML, which also starts with `<`) is not
 * treated as SVG. The markup is still sanitized before use — this only
 * decides the file's kind.
 */
function looksLikeSvg(bytes: Uint8Array): boolean {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(start, start + ARTWORK_SNIFF_BYTES))
    .trimStart();
  if (!head.startsWith('<')) return false;
  if (/^<svg[\s>]/i.test(head)) return true;
  // A prologue (declaration/doctype/comment) is only accepted if the `<svg`
  // root actually appears within the sniffed window.
  if (/^<(\?xml|!doctype|!--)/i.test(head)) return /<svg[\s>]/i.test(head);
  return false;
}

export function sniffArtworkFileKind(bytes: Uint8Array): ArtworkFileKind | null {
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) return 'png';
  if (matchesAt(bytes, 0, JPEG_SIGNATURE)) return 'jpeg';
  if (matchesAt(bytes, 0, RIFF_SIGNATURE) && matchesAt(bytes, 8, WEBP_TAG)) return 'webp';
  if (looksLikeSvg(bytes)) return 'svg';
  return null;
}

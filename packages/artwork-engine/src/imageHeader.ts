import type { ArtworkFileKind } from '@threadform/types';

/**
 * Reads a raster image's declared pixel dimensions straight out of its
 * header, without decoding it.
 *
 * This exists so the size limits in `limits.ts` can be enforced *before* the
 * browser is asked to allocate a decode buffer. A "decompression bomb" is a
 * few kilobytes of valid PNG that declares a 30000×30000 image; by the time
 * an `<img>` has told us its `naturalWidth`, the several gigabytes are
 * already allocated. Parsing the handful of header bytes ourselves makes
 * the rejection cost proportional to the file, not to what it claims to be.
 *
 * Returns `null` when the header is truncated or malformed — the caller
 * treats that as a rejection, never as "assume it's fine".
 */

export interface ImageHeaderSize {
  width: number;
  height: number;
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 4) return null;
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 3) return null;
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

/** PNG: the IHDR chunk is mandatory and must be first, so width/height sit at fixed offsets. */
function readPngSize(bytes: Uint8Array): ImageHeaderSize | null {
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width === null || height === null) return null;
  return { width, height };
}

/**
 * JPEG: dimensions live in whichever Start-Of-Frame marker the encoder
 * used, so the segment chain has to be walked. `SOF4`/`SOF8`/`SOF12`
 * (0xC4/0xC8/0xCC) are Huffman/arithmetic tables, not frame headers, and
 * are skipped like any other segment.
 */
function readJpegSize(bytes: Uint8Array): ImageHeaderSize | null {
  let offset = 2; // past the SOI marker
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // resynchronize across fill bytes
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = readUint16BE(bytes, offset + 2);
    if (length === null || length < 2) return null;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      if (width === null || height === null) return null;
      return { width, height };
    }
    if (marker === 0xda) return null; // start of scan — no frame header found
    offset += 2 + length;
  }
  return null;
}

/** WebP has three container variants; all three keep the canvas size in the first chunk. */
function readWebpSize(bytes: Uint8Array): ImageHeaderSize | null {
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));

  if (chunk === 'VP8X') {
    const width = readUint24LE(bytes, 24);
    const height = readUint24LE(bytes, 27);
    if (width === null || height === null) return null;
    return { width: width + 1, height: height + 1 };
  }

  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte frame tag, the 3-byte start code 0x9d012a, then two
    // 16-bit values whose low 14 bits are the dimensions.
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = ((bytes[27]! << 8) | bytes[26]!) & 0x3fff;
    const height = ((bytes[29]! << 8) | bytes[28]!) & 0x3fff;
    return { width, height };
  }

  if (chunk === 'VP8L') {
    // Lossless: a 0x2f signature byte, then 14 bits of (width - 1) followed
    // by 14 bits of (height - 1), packed little-endian across four bytes.
    if (bytes[20] !== 0x2f) return null;
    if (bytes.length < 25) return null;
    const packed = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0;
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

export function readImageHeaderSize(
  bytes: Uint8Array,
  kind: ArtworkFileKind,
): ImageHeaderSize | null {
  const size =
    kind === 'png'
      ? readPngSize(bytes)
      : kind === 'jpeg'
        ? readJpegSize(bytes)
        : kind === 'webp'
          ? readWebpSize(bytes)
          : null;

  if (!size) return null;
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
  if (size.width <= 0 || size.height <= 0) return null;
  return size;
}

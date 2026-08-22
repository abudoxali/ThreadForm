import { describe, expect, it } from 'vitest';
import { readImageHeaderSize } from './imageHeader';

/**
 * Header fixtures are assembled byte by byte rather than loaded from real
 * files: the point of this parser is to read a declared size out of a few
 * bytes without decoding, so the tests exercise exactly those bytes -
 * including the sizes no real encoder would produce, which is precisely
 * what a decompression-bomb file does.
 */

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function uint24LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...uint32BE(13),
    ...ascii('IHDR'),
    ...uint32BE(width),
    ...uint32BE(height),
    8,
    6,
    0,
    0,
    0,
  ]);
}

function jpeg(width: number, height: number, marker = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    // A JFIF APP0 segment, skipped on the way to the frame header.
    0xff,
    0xe0,
    ...uint16BE(16),
    ...ascii('JFIF'),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    marker,
    ...uint16BE(17),
    8,
    ...uint16BE(height),
    ...uint16BE(width),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...uint24LE(width - 1),
    ...uint24LE(height - 1),
  ]);
}

function webpLossy(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii('VP8 '),
    20,
    0,
    0,
    0,
    0x9d,
    0x01,
    0x2a, // frame tag (contents irrelevant to the size)
    0x9d,
    0x01,
    0x2a, // start code
    width & 0xff,
    (width >> 8) & 0x3f,
    height & 0xff,
    (height >> 8) & 0x3f,
  ]);
}

function webpLossless(width: number, height: number): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14);
  return new Uint8Array([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii('VP8L'),
    20,
    0,
    0,
    0,
    0x2f,
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff,
  ]);
}

describe('readImageHeaderSize', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(readImageHeaderSize(png(1920, 1080), 'png')).toEqual({ width: 1920, height: 1080 });
  });

  it('reads JPEG dimensions by walking to the start-of-frame marker', () => {
    expect(readImageHeaderSize(jpeg(800, 600), 'jpeg')).toEqual({ width: 800, height: 600 });
  });

  it('reads dimensions from a progressive JPEG (SOF2)', () => {
    expect(readImageHeaderSize(jpeg(640, 480, 0xc2), 'jpeg')).toEqual({ width: 640, height: 480 });
  });

  it('reads dimensions from all three WebP container variants', () => {
    expect(readImageHeaderSize(webpVp8x(4000, 3000), 'webp')).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(readImageHeaderSize(webpLossy(300, 200), 'webp')).toEqual({ width: 300, height: 200 });
    expect(readImageHeaderSize(webpLossless(300, 200), 'webp')).toEqual({
      width: 300,
      height: 200,
    });
  });

  // A file can honestly declare an enormous size in a handful of bytes;
  // reporting it truthfully is what lets the size limits reject it before
  // anything is allocated.
  it('reports an absurd declared size rather than silently accepting it', () => {
    expect(readImageHeaderSize(png(30000, 30000), 'png')).toEqual({
      width: 30000,
      height: 30000,
    });
  });

  it('returns null for a truncated or malformed header', () => {
    expect(readImageHeaderSize(png(10, 10).subarray(0, 18), 'png')).toBeNull();
    expect(readImageHeaderSize(new Uint8Array([0xff, 0xd8, 0xff]), 'jpeg')).toBeNull();
    expect(readImageHeaderSize(new Uint8Array(30), 'webp')).toBeNull();
  });

  it('returns null for a zero dimension', () => {
    expect(readImageHeaderSize(png(0, 100), 'png')).toBeNull();
  });

  it('returns null for SVG, which has no binary header to read', () => {
    expect(readImageHeaderSize(png(10, 10), 'svg')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { validateArtworkBytes } from './validate';
import { MAX_ARTWORK_BYTES } from './limits';
import { artworkNameFromFileName } from './decode';

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function png(width: number, height: number, padding = 0): Uint8Array {
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
    ...new Array<number>(padding).fill(0),
  ]);
}

function svg(markup: string): Uint8Array {
  return new TextEncoder().encode(markup);
}

describe('validateArtworkBytes — accepting real artwork', () => {
  it('accepts a PNG and reports its size without decoding it', () => {
    const result = validateArtworkBytes(png(1200, 800));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artwork.fileKind).toBe('png');
    expect(result.artwork.pixelWidth).toBe(1200);
    expect(result.artwork.pixelHeight).toBe(800);
    expect(result.artwork.mimeType).toBe('image/png');
  });

  it('accepts an SVG and returns rebuilt, sanitized markup rather than the original bytes', () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script><rect width="64" height="64"/></svg>';
    const result = validateArtworkBytes(svg(hostile));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = new TextDecoder().decode(result.artwork.bytes);
    // What reaches storage is the sanitized document, so a later build - or
    // a user poking at IndexedDB - never finds the hostile original.
    expect(stored).not.toContain('script');
    expect(stored).toContain('rect');
    expect(result.artwork.byteSize).toBe(result.artwork.bytes.byteLength);
  });

  it('passes raster bytes through unchanged', () => {
    const original = png(64, 64);
    const result = validateArtworkBytes(original);
    expect(result.ok && result.artwork.bytes).toBe(original);
  });
});

describe('validateArtworkBytes — rejecting hostile or unusable input', () => {
  it('rejects an empty file', () => {
    const result = validateArtworkBytes(new Uint8Array(0));
    expect(result).toEqual({ ok: false, error: 'That file is empty.' });
  });

  it('rejects a file that is not a supported image, whatever it claims to be', () => {
    const result = validateArtworkBytes(new TextEncoder().encode('#!/bin/sh\nrm -rf /\n'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/supported image/i);
  });

  it('rejects a file over the size ceiling', () => {
    const oversized = png(64, 64, MAX_ARTWORK_BYTES);
    const result = validateArtworkBytes(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/up to 12 MB/);
  });

  // The decompression-bomb case: tiny file, enormous declared canvas.
  it('rejects an image whose declared dimensions exceed the per-axis limit', () => {
    const result = validateArtworkBytes(png(30000, 100));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/8192 pixels/);
    // The bomb is a few dozen bytes; rejecting it costs nothing.
    expect(png(30000, 100).byteLength).toBeLessThan(200);
  });

  it('rejects an image within the per-axis limit but over the total pixel budget', () => {
    const result = validateArtworkBytes(png(8000, 8000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too many pixels/i);
  });

  it('rejects an image too small to be usable artwork', () => {
    const result = validateArtworkBytes(png(1, 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too small/i);
  });

  it('rejects a PNG signature with a damaged header', () => {
    const damaged = png(64, 64).subarray(0, 15);
    const result = validateArtworkBytes(damaged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/damaged/i);
  });

  it('rejects an SVG that is not valid XML', () => {
    const result = validateArtworkBytes(svg('<svg><rect></svg>'));
    expect(result.ok).toBe(false);
  });

  it('rejects an SVG whose declared size is over the limit', () => {
    const result = validateArtworkBytes(
      svg('<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"></svg>'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/8192 pixels/);
  });
});

describe('artworkNameFromFileName', () => {
  it('drops the extension and tidies separators', () => {
    expect(artworkNameFromFileName('my_logo_final.png')).toBe('my logo final');
    expect(artworkNameFromFileName('Chest Print.SVG')).toBe('Chest Print');
  });

  it('falls back when the name is empty once the extension is removed', () => {
    expect(artworkNameFromFileName('.png')).toBe('Artwork');
    expect(artworkNameFromFileName('   ')).toBe('Artwork');
  });

  it('caps an absurdly long name', () => {
    const name = artworkNameFromFileName(`${'a'.repeat(200)}.png`);
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name.endsWith('...')).toBe(true);
  });
});

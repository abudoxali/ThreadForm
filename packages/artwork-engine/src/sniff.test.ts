import { describe, expect, it } from 'vitest';
import { sniffArtworkFileKind } from './sniff';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

const PNG_HEADER = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG_HEADER = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP_HEADER = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0x20,
  0,
  0,
  0,
  0x57,
  0x45,
  0x42,
  0x50,
  0x56,
  0x50,
  0x38,
  0x20,
);

describe('sniffArtworkFileKind', () => {
  it('recognizes each accepted format from its signature', () => {
    expect(sniffArtworkFileKind(PNG_HEADER)).toBe('png');
    expect(sniffArtworkFileKind(JPEG_HEADER)).toBe('jpeg');
    expect(sniffArtworkFileKind(WEBP_HEADER)).toBe('webp');
    expect(sniffArtworkFileKind(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      'svg',
    );
  });

  it('accepts SVG behind an XML declaration, a doctype, or leading whitespace', () => {
    expect(sniffArtworkFileKind(text('<?xml version="1.0"?><svg width="4"></svg>'))).toBe('svg');
    expect(sniffArtworkFileKind(text('<!DOCTYPE svg><svg width="4"></svg>'))).toBe('svg');
    expect(sniffArtworkFileKind(text('\n\n   <svg width="4"></svg>'))).toBe('svg');
  });

  it('accepts an SVG carrying a UTF-8 byte order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...text('<svg width="4"></svg>')]);
    expect(sniffArtworkFileKind(withBom)).toBe('svg');
  });

  // The whole point of signature sniffing: a browser's `File.type` and the
  // filename extension both come from the OS and are trivially spoofed.
  it('rejects a file whose bytes are not an image, however it is labelled', () => {
    expect(sniffArtworkFileKind(text('this is definitely a png, trust me'))).toBeNull();
    expect(sniffArtworkFileKind(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffArtworkFileKind(new Uint8Array(0))).toBeNull();
  });

  it('rejects HTML, which also opens with "<" but is not SVG', () => {
    expect(sniffArtworkFileKind(text('<!DOCTYPE html><html><body>hi</body></html>'))).toBeNull();
    expect(sniffArtworkFileKind(text('<html><svg></svg></html>'))).toBeNull();
  });

  it('rejects a truncated signature rather than guessing', () => {
    expect(sniffArtworkFileKind(bytes(0x89, 0x50, 0x4e))).toBeNull();
    // RIFF container, but not a WebP one (this is how a WAV file starts).
    expect(
      sniffArtworkFileKind(bytes(0x52, 0x49, 0x46, 0x46, 0x20, 0, 0, 0, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull();
  });

  it('does not treat a prologue with no <svg> root as SVG', () => {
    expect(sniffArtworkFileKind(text('<?xml version="1.0"?><rss><channel/></rss>'))).toBeNull();
  });
});

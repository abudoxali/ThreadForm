import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportImageFormat } from '@threadform/types';
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_ORDER,
  canEncodeImageFormat,
  imageFormat,
  supportedImageFormats,
} from './formats';

const ALL_FORMATS = Object.keys(IMAGE_FORMATS) as ExportImageFormat[];

describe('image format definitions', () => {
  it('describes every format the union names, keyed by its own id', () => {
    for (const format of ALL_FORMATS) {
      expect(imageFormat(format).id).toBe(format);
    }
  });

  it('offers every defined format in the panel order, exactly once', () => {
    expect([...IMAGE_FORMAT_ORDER].sort()).toEqual([...ALL_FORMATS].sort());
  });

  /**
   * The extension has to match what the MIME type will actually produce.
   * The whole point of the capability probe below is to avoid handing
   * someone a PNG named `.webp`; getting this table wrong would do the same
   * damage from the other direction.
   */
  it('pairs each MIME type with the extension that file really is', () => {
    const expected: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    };
    for (const format of ALL_FORMATS) {
      const { mimeType, extension } = imageFormat(format);
      expect(expected[mimeType], `unmapped MIME type ${mimeType}`).toBe(extension);
    }
  });

  // `png-transparent` is PNG with the backdrop omitted, not a fourth codec.
  it('treats transparent PNG as PNG, distinguished only by its alpha flag', () => {
    expect(imageFormat('png-transparent').mimeType).toBe(imageFormat('png').mimeType);
    expect(imageFormat('png-transparent').extension).toBe('png');
    expect(imageFormat('png-transparent').transparent).toBe(true);
    expect(imageFormat('png').transparent).toBe(false);
  });

  it('sets a quality on exactly the lossy formats, and the same one for both', () => {
    expect(imageFormat('png').quality).toBeUndefined();
    expect(imageFormat('png-transparent').quality).toBeUndefined();
    expect(imageFormat('jpg').quality).toBe(imageFormat('webp').quality);
    expect(imageFormat('jpg').quality).toBeGreaterThan(0.8);
    expect(imageFormat('jpg').quality).toBeLessThanOrEqual(1);
  });
});

/**
 * Stubs `canvas.toBlob` with a browser that can encode only `encodable`.
 *
 * The behaviour being modelled is the one the spec actually mandates and
 * that makes this probe necessary: asked for a type it cannot encode, a
 * canvas does not fail — it silently returns a PNG.
 */
function stubCanvas(encodable: string[]) {
  const toBlob = vi.fn((callback: (blob: Blob | null) => void, mimeType?: string) => {
    const type = mimeType && encodable.includes(mimeType) ? mimeType : 'image/png';
    callback(new Blob([], { type }));
  });
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
    return { width: 0, height: 0, toBlob } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  return toBlob;
}

describe('canEncodeImageFormat', () => {
  afterEach(() => vi.restoreAllMocks());

  // Every canvas implementation is required to support PNG, so the probe
  // must not spend a canvas on it — and must not be able to answer "no".
  it('answers yes for PNG without touching the DOM', async () => {
    const created = vi.spyOn(document, 'createElement');
    await expect(canEncodeImageFormat('png')).resolves.toBe(true);
    await expect(canEncodeImageFormat('png-transparent')).resolves.toBe(true);
    expect(created).not.toHaveBeenCalled();
  });

  it('answers yes when the canvas returns the type that was asked for', async () => {
    stubCanvas(['image/jpeg', 'image/webp']);
    await expect(canEncodeImageFormat('jpg')).resolves.toBe(true);
    await expect(canEncodeImageFormat('webp')).resolves.toBe(true);
  });

  /** The trap this function exists for. */
  it('answers no when the canvas quietly substitutes a PNG', async () => {
    stubCanvas(['image/jpeg']);
    await expect(canEncodeImageFormat('webp')).resolves.toBe(false);
  });

  it('answers no rather than throwing when the canvas has no toBlob at all', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
    } as unknown as HTMLElement);
    await expect(canEncodeImageFormat('webp')).resolves.toBe(false);
  });

  it('answers no rather than throwing when creating a canvas fails', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('no canvas here');
    });
    await expect(canEncodeImageFormat('jpg')).resolves.toBe(false);
  });

  it('answers no when the canvas produces nothing', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      toBlob: (callback: (blob: Blob | null) => void) => callback(null),
    } as unknown as HTMLElement);
    await expect(canEncodeImageFormat('webp')).resolves.toBe(false);
  });
});

describe('supportedImageFormats', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists everything a fully capable browser can encode, in panel order', async () => {
    stubCanvas(['image/jpeg', 'image/webp']);
    await expect(supportedImageFormats()).resolves.toEqual([...IMAGE_FORMAT_ORDER]);
  });

  it('drops only what the browser cannot produce, keeping the order stable', async () => {
    stubCanvas(['image/jpeg']);
    await expect(supportedImageFormats()).resolves.toEqual(['png', 'png-transparent', 'jpg']);
  });

  // Whatever else fails, PNG has to remain offerable — otherwise the panel
  // would have no formats at all and export would look broken.
  it('never returns an empty list, because PNG is always available', async () => {
    stubCanvas([]);
    await expect(supportedImageFormats()).resolves.toEqual(['png', 'png-transparent']);
  });
});

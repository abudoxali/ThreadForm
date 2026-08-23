import type { ExportImageFormat } from '@threadform/types';

/**
 * What each image format actually is, encoding-wise.
 *
 * `png-transparent` is not a separate file format — it is PNG with the
 * backdrop omitted from the render. Keeping that distinction here rather
 * than in the renderer is why the renderer only needs a boolean and never
 * has to know the product's format vocabulary.
 */

export interface ImageFormatDefinition {
  id: ExportImageFormat;
  label: string;
  description: string;
  mimeType: string;
  extension: string;
  /** Whether the exported pixels keep an alpha channel. */
  transparent: boolean;
  /**
   * Encoder quality, for lossy formats only. One deliberate value rather
   * than a slider: a quality control is a real product decision nobody has
   * made yet, and 0.92 is high enough that JPEG artefacts do not show on a
   * garment render while keeping the file a sensible size.
   */
  quality?: number;
}

const LOSSY_QUALITY = 0.92;

export const IMAGE_FORMATS: Record<ExportImageFormat, ImageFormatDefinition> = {
  png: {
    id: 'png',
    label: 'PNG',
    description: 'Lossless, with the studio backdrop.',
    mimeType: 'image/png',
    extension: 'png',
    transparent: false,
  },
  'png-transparent': {
    id: 'png-transparent',
    label: 'PNG (transparent)',
    description: 'Lossless, with no background — just the garment.',
    mimeType: 'image/png',
    extension: 'png',
    transparent: true,
  },
  jpg: {
    id: 'jpg',
    label: 'JPG',
    description: 'Smaller file. No transparency.',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    transparent: false,
    quality: LOSSY_QUALITY,
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    description: 'Smaller than PNG at similar quality.',
    mimeType: 'image/webp',
    extension: 'webp',
    transparent: false,
    quality: LOSSY_QUALITY,
  },
};

export function imageFormat(format: ExportImageFormat): ImageFormatDefinition {
  return IMAGE_FORMATS[format];
}

/** In the order the Studio should offer them. */
export const IMAGE_FORMAT_ORDER: readonly ExportImageFormat[] = [
  'png',
  'png-transparent',
  'jpg',
  'webp',
];

/**
 * Whether this browser can actually encode a format.
 *
 * `HTMLCanvasElement.toBlob` does **not** fail loudly for a MIME type it
 * cannot encode: the specification says it falls back to PNG. Without this
 * probe a WebP export in an unsupporting browser would download a PNG named
 * `.webp` — a corrupt-looking file the user can only discover by opening it.
 * Asking the canvas what it produced, and comparing, is the only reliable
 * answer; a user-agent string is not.
 *
 * Kept here rather than in a component so capability lives on the export
 * boundary instead of being re-derived by every caller.
 */
export async function canEncodeImageFormat(format: ExportImageFormat): Promise<boolean> {
  const { mimeType } = imageFormat(format);
  // PNG is the required baseline for every canvas implementation.
  if (mimeType === 'image/png') return true;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (typeof canvas.toBlob !== 'function') return false;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType);
    });
    return blob?.type === mimeType;
  } catch {
    return false;
  }
}

/** The formats this browser can produce, for building the panel's options. */
export async function supportedImageFormats(): Promise<ExportImageFormat[]> {
  const results = await Promise.all(
    IMAGE_FORMAT_ORDER.map(async (format) =>
      (await canEncodeImageFormat(format)) ? format : null,
    ),
  );
  return results.filter((format): format is ExportImageFormat => format !== null);
}

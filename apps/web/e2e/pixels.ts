import { inflateSync } from 'node:zlib';

/**
 * A minimal PNG reader, used to inspect Playwright screenshots.
 *
 * This exists so the artwork tests can assert on what the browser *actually
 * painted*, not on what the DOM claims. A React Three Fiber canvas renders
 * with `preserveDrawingBuffer: false` (the right default — keeping the
 * buffer around costs memory and bandwidth every frame), so `toDataURL` and
 * `readPixels` come back blank after compositing. A page screenshot is
 * therefore the only honest way to see the rendered garment, and it arrives
 * as PNG bytes that something has to decode.
 *
 * Node ships the hard part (zlib), and Playwright's screenshots are always
 * 8-bit, non-interlaced, RGB or RGBA — so the remaining work is the
 * scanline filters. Hand-rolling that is a better trade than adding an
 * image-decoding dependency to the repository for one assertion helper.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major from the top-left. */
  data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer: Buffer): DecodedImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => buffer[index] === byte)) {
    throw new Error('not a PNG');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported here');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported colour type ${colorType}`);

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart]!;

    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rowStart + 1 + x]!;
      const left = x >= channels ? current[x - channels]! : 0;
      const up = previous[x]!;
      const upLeft = x >= channels ? previous[x - channels]! : 0;

      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4:
          value = rawByte + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      current[x] = value & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      out[target] = current[source]!;
      out[target + 1] = current[source + 1]!;
      out[target + 2] = current[source + 2]!;
      out[target + 3] = channels === 4 ? current[source + 3]! : 255;
    }

    previous.set(current);
  }

  return { width, height, data: out };
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Counts pixels matching a hue *relationship* rather than an exact colour.
 *
 * The artwork on a rendered garment is not the artwork's source colour: it
 * has been lit by a three-point rig, tone-mapped, and converted to sRGB. A
 * strict equality check against `#ff00c8` would fail on a perfectly correct
 * render. What survives all of that is which channels dominate — a magenta
 * print stays red-and-blue-high, green-low no matter how it is lit — so
 * that is what the E2E assertions test.
 */
export function countPixels(image: DecodedImage, matches: (pixel: Rgb) => boolean): number {
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const pixel = {
      r: image.data[index]!,
      g: image.data[index + 1]!,
      b: image.data[index + 2]!,
    };
    if (matches(pixel)) count += 1;
  }
  return count;
}

/** Strongly magenta: red and blue both well ahead of green. */
export const isMagentaInk = ({ r, g, b }: Rgb): boolean =>
  r > 90 && b > 70 && r - g > 55 && b - g > 40;

/** Strongly cyan: green and blue both well ahead of red. */
export const isCyanInk = ({ r, g, b }: Rgb): boolean =>
  g > 90 && b > 90 && g - r > 45 && b - r > 45;

/** Strongly green: green well ahead of both red and blue (the SVG fixture's hue). */
export const isGreenInk = ({ r, g, b }: Rgb): boolean => g > 90 && g - r > 45 && g - b > 45;

/** Perceptual luminance, the channel most of the M04 surface measurements work in. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface SurfaceStats {
  /** How many pixels the mask selected. Guards against a "difference" measured over nothing. */
  count: number;
  meanLuminance: number;
  /** Mean absolute horizontal luminance gradient — high where structure runs vertically. */
  gradientX: number;
  /** Mean absolute vertical luminance gradient — high where structure runs horizontally. */
  gradientY: number;
  /** Overall local contrast, regardless of direction. */
  texture: number;
}

/**
 * Measures the surface character of a region of a render.
 *
 * M04's claims are about *surfaces* — a knit is ribbed where a weave is even,
 * embroidery is raised where screen-printed ink is flat — so the tests
 * measure local contrast and its direction rather than comparing pixels to a
 * stored image. A snapshot would break on any lighting or camera change and
 * would say nothing about whether the two materials actually differ; a
 * gradient ratio says exactly that, and survives everything it should.
 */
export function measureSurface(image: DecodedImage, mask: (pixel: Rgb) => boolean): SurfaceStats {
  const { width, height, data } = image;
  const pixelAt = (x: number, y: number): Rgb => {
    const index = (y * width + x) * 4;
    return { r: data[index]!, g: data[index + 1]!, b: data[index + 2]! };
  };

  let count = 0;
  let totalLuminance = 0;
  let totalGradientX = 0;
  let totalGradientY = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centre = pixelAt(x, y);
      if (!mask(centre)) continue;
      // Only measure where the whole neighbourhood is inside the region, so
      // the region's own edge is never mistaken for surface texture.
      if (!mask(pixelAt(x - 1, y)) || !mask(pixelAt(x + 1, y))) continue;
      if (!mask(pixelAt(x, y - 1)) || !mask(pixelAt(x, y + 1))) continue;

      count += 1;
      totalLuminance += luminance(centre);
      totalGradientX += Math.abs(luminance(pixelAt(x + 1, y)) - luminance(pixelAt(x - 1, y)));
      totalGradientY += Math.abs(luminance(pixelAt(x, y + 1)) - luminance(pixelAt(x, y - 1)));
    }
  }

  if (count === 0) {
    return { count: 0, meanLuminance: 0, gradientX: 0, gradientY: 0, texture: 0 };
  }

  const gradientX = totalGradientX / count;
  const gradientY = totalGradientY / count;
  return {
    count,
    meanLuminance: totalLuminance / count,
    gradientX,
    gradientY,
    texture: (gradientX + gradientY) / 2,
  };
}

/** Fraction of pixels whose luminance changed by more than `threshold` between two same-sized renders. */
export function changedFraction(before: DecodedImage, after: DecodedImage, threshold = 6): number {
  const length = Math.min(before.data.length, after.data.length);
  let changed = 0;
  let total = 0;
  for (let index = 0; index < length; index += 4) {
    const a = luminance({
      r: before.data[index]!,
      g: before.data[index + 1]!,
      b: before.data[index + 2]!,
    });
    const b = luminance({
      r: after.data[index]!,
      g: after.data[index + 1]!,
      b: after.data[index + 2]!,
    });
    total += 1;
    if (Math.abs(a - b) > threshold) changed += 1;
  }
  return total === 0 ? 0 : changed / total;
}

/** Bare, undyed garment fabric: bright and near-neutral, with no fixture ink in it. */
export const isGarmentFabric = ({ r, g, b }: Rgb): boolean =>
  r > 110 && g > 110 && b > 100 && Math.abs(r - g) < 22 && Math.abs(g - b) < 30;

/**
 * Magenta by hue alone, tolerant of brightness.
 *
 * `isMagentaInk` requires a bright, saturated pixel, which is right for
 * "is the artwork on the garment at all". It is the wrong test for "is the
 * artwork still fully there once it has been embroidered": raised stitching
 * shades each thread hard enough that the shadowed side of a stitch falls
 * below that brightness floor, so a correctly-rendered embroidery measures
 * as *less* ink than a flat print of the same artwork. This matcher keys on
 * the colour relationship only, so it counts a print's full extent whatever
 * the relief is doing to it.
 */
export const isMagentaHue = ({ r, g, b }: Rgb): boolean =>
  r > 45 && b > 35 && r - g > 25 && b - g > 18;

/**
 * Identifies an image from its magic bytes.
 *
 * Export tests must not take a file's extension as evidence of its contents:
 * the specific failure `canEncodeImageFormat` exists to prevent is a browser
 * silently encoding PNG when asked for WebP, which would arrive as a
 * perfectly named `.webp` full of PNG. Reading the signature is the only way
 * to catch that from the outside.
 */
export function sniffImageFormat(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buffer.length >= 8 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Dimensions straight from the header, so a JPEG/WebP can be checked without decoding it. */
export function readImageSize(buffer: Buffer): ImageSize | null {
  const format = sniffImageFormat(buffer);

  if (format === 'png') {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (format === 'jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (marker === 0xda) return null;
      offset += 2 + length;
    }
    return null;
  }

  if (format === 'webp') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const read24 = (at: number) => buffer[at]! | (buffer[at + 1]! << 8) | (buffer[at + 2]! << 16);
      return { width: read24(24) + 1, height: read24(27) + 1 };
    }
    if (chunk === 'VP8 ') {
      if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
      return {
        width: ((buffer[27]! << 8) | buffer[26]!) & 0x3fff,
        height: ((buffer[29]! << 8) | buffer[28]!) & 0x3fff,
      };
    }
    if (chunk === 'VP8L') {
      if (buffer[20] !== 0x2f) return null;
      const packed =
        (buffer[21]! | (buffer[22]! << 8) | (buffer[23]! << 16) | (buffer[24]! << 24)) >>> 0;
      return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  return null;
}

export interface AlphaProfile {
  transparent: number;
  opaque: number;
  partial: number;
  total: number;
}

/**
 * How a decoded image's alpha is distributed.
 *
 * A transparent export has to be checked as three separate claims: the
 * background is genuinely absent (`transparent`), the garment is genuinely
 * solid (`opaque`), and the silhouette is antialiased rather than hard-edged
 * (`partial`). A PNG with a black rectangle where the backdrop should be
 * passes a naive "is it a PNG of the right size" check and fails all three.
 */
export function alphaProfile(image: DecodedImage): AlphaProfile {
  let transparent = 0;
  let opaque = 0;
  let partial = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    const alpha = image.data[index]!;
    if (alpha === 0) transparent += 1;
    else if (alpha === 255) opaque += 1;
    else partial += 1;
  }
  return { transparent, opaque, partial, total: image.width * image.height };
}

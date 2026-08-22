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

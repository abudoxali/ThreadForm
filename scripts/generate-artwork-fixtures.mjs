// Generates the artwork files the end-to-end suite uploads.
//
// These are original, trivially-simple geometric marks built from explicit
// pixel maths in this script - no third-party artwork, clip art, or stock
// asset is involved. They exist to be *unmistakable* on a rendered garment:
// each uses one fully-saturated hue that appears nowhere in ThreadForm's own
// palette or in the Essential Tee's neutral fabric, so an E2E test can look
// at a screenshot of the real WebGL canvas and say with confidence whether
// the print is actually there.
//
// Run with: node scripts/generate-artwork-fixtures.mjs
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../apps/web/e2e/fixtures');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/** Encodes 8-bit RGBA pixels as a non-interlaced PNG. */
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline, then the row's pixel bytes.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark: a thick square ring with a solid centre bar, on a fully
 * transparent background. The ring proves alpha is respected (fabric shows
 * through the middle gap) and the solid areas give the pixel assertions
 * plenty of unambiguous colour to find.
 */
function drawMark(size, [r, g, b]) {
  const pixels = Buffer.alloc(size * size * 4); // zero-filled = transparent
  const outer = Math.round(size * 0.1);
  const inner = Math.round(size * 0.28);
  const barTop = Math.round(size * 0.44);
  const barBottom = Math.round(size * 0.56);

  const set = (x, y) => {
    const offset = (y * size + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inOuter = x >= outer && x < size - outer && y >= outer && y < size - outer;
      const inInner = x >= inner && x < size - inner && y >= inner && y < size - inner;
      const inBar = inInner && y >= barTop && y < barBottom;
      if (inOuter && (!inInner || inBar)) set(x, y);
    }
  }

  return encodePng(size, size, pixels);
}

/** An original SVG mark, deliberately including nothing that needs sanitizing. */
const SVG_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="26" y="26" width="204" height="204" fill="none" stroke="#39ff5a" stroke-width="26"/>
  <rect x="72" y="113" width="112" height="30" fill="#39ff5a"/>
</svg>
`;

/**
 * An SVG carrying every payload the sanitizer is supposed to strip. Used by
 * the E2E suite to confirm that what reaches the renderer is the rebuilt
 * document, not the uploaded one.
 */
const SVG_HOSTILE = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <script>window.__threadformSvgScriptRan = true;</script>
  <image href="https://example.invalid/tracker.png" width="10" height="10"/>
  <rect x="26" y="26" width="204" height="204" fill="#ff8a00" onload="window.__threadformSvgScriptRan = true"/>
</svg>
`;

async function main() {
  await mkdir(outDir, { recursive: true });

  const files = [
    ['threadform-test-mark-magenta.png', drawMark(256, [255, 0, 200])],
    ['threadform-test-mark-cyan.png', drawMark(256, [0, 225, 255])],
    ['threadform-test-mark.svg', Buffer.from(SVG_MARK, 'utf8')],
    ['threadform-test-mark-hostile.svg', Buffer.from(SVG_HOSTILE, 'utf8')],
    // A text file wearing a .png extension and served with an image MIME
    // type - the exact input a filename- or MIME-based check would wave
    // through.
    ['not-an-image.png', Buffer.from('This is a text file pretending to be a PNG.\n', 'utf8')],
  ];

  for (const [name, contents] of files) {
    await writeFile(path.join(outDir, name), contents);
    console.log(`Wrote ${name} (${contents.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

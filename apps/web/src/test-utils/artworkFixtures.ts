import { vi } from 'vitest';

/**
 * Test doubles for the two browser capabilities jsdom genuinely lacks:
 * object URLs and image decoding.
 *
 * Everything else on the artwork path runs for real in these tests — the
 * signature sniffing, the size limits, the SVG sanitizer, `project-engine`'s
 * clamping, and IndexedDB via `fake-indexeddb`. Only the final "hand these
 * bytes to the image decoder" step is faked, because jsdom has no decoder
 * to hand them to. Whether the *rendered* result is actually correct is a
 * question these tests cannot answer and do not pretend to: that is the
 * Playwright suite's job, which inspects real pixels on a real WebGL canvas.
 *
 * The object-URL double also counts `createObjectURL`/`revokeObjectURL`
 * calls, which is what makes the leak assertions in the artwork tests
 * possible at all.
 */

export interface ObjectUrlLedger {
  created: string[];
  revoked: string[];
  /** URLs handed out and not yet revoked — expected to be empty once artwork is removed or the Studio unmounts. */
  outstanding: () => string[];
}

/** A minimal but structurally valid PNG header: signature plus an IHDR chunk declaring the given size. */
export function pngBytes(width = 512, height = 512): Uint8Array {
  const uint32BE = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
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
    ...[...'IHDR'].map((c) => c.charCodeAt(0)),
    ...uint32BE(width),
    ...uint32BE(height),
    8,
    6,
    0,
    0,
    0,
  ]);
}

export function pngFile(name = 'logo.png', width = 512, height = 512): File {
  return new File([pngBytes(width, height) as BlobPart], name, { type: 'image/png' });
}

export function svgFile(markup: string, name = 'mark.svg'): File {
  return new File([markup], name, { type: 'image/svg+xml' });
}

/**
 * Installs the doubles and returns the object-URL ledger. Call
 * `restoreBrowserImageStubs()` afterwards (or rely on `vi.unstubAllGlobals`).
 */
export function installBrowserImageStubs(): ObjectUrlLedger {
  const created: string[] = [];
  const revoked: string[] = [];
  let counter = 0;

  // Patched onto the real `URL` rather than replacing it: `createObjectURL`
  // and `revokeObjectURL` are non-enumerable statics, so a spread copy would
  // silently drop them — and replacing `URL` wholesale would break every
  // other use of it.
  URL.createObjectURL = (_blob: Blob | MediaSource) => {
    const url = `blob:threadform/${(counter += 1)}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };

  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = 'async';
    naturalWidth = 512;
    naturalHeight = 512;
    #src = '';

    get src(): string {
      return this.#src;
    }

    // A real <img> loads asynchronously; resolving on a microtask keeps the
    // code under test on the same async path it takes in a browser.
    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal('Image', StubImage);

  return {
    created,
    revoked,
    outstanding: () => created.filter((url) => !revoked.includes(url)),
  };
}

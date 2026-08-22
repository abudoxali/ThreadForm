import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `sanitizeSvg` and `decodeArtwork` are deliberately built on the
    // platform's own DOMParser/XMLSerializer rather than a hand-rolled
    // parser, so their tests need a real DOM implementation.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

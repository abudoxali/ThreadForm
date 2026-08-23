import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Planning is pure, but the format-capability probe is a real browser
    // question and needs a DOM to be tested against at all.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});

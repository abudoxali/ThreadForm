import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  /**
   * Well above Playwright's 30s default, because these are not typical DOM
   * tests: the artwork and material/effect journeys each drive a real WebGL
   * canvas through a dozen-plus screenshot-and-settle cycles, and the canvas
   * runs `frameloop="demand"` so every measurement waits for a frame. Both
   * take around 25 seconds alone, and several running in parallel contend
   * for one GPU. The default was tripping them on wall-clock while every
   * assertion still passed — raising the ceiling is the honest fix; trimming
   * the measurements to fit would have traded real coverage for a number.
   */
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: '3100' },
  },
  // Chromium only, per project convention (see docs/PRIVACY_SECURITY.md /
  // CI): CI installs only the Chromium browser binary to keep the install
  // step fast and reliable. Mobile-viewport behavior is covered by resizing
  // within Chromium (see the "no horizontal overflow" test) rather than by
  // running a second full browser engine.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

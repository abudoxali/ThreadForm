import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
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

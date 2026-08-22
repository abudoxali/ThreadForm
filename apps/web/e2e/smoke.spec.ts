import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test('home page renders and links into the Studio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Open the Studio' }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test('no horizontal overflow at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  return errors;
}

// StudioShell renders its canvas/tool-rail/inspector content twice — once
// inside a `hidden md:flex` desktop wrapper, once inside a `flex md:hidden`
// mobile wrapper — and swaps which is displayed with CSS at the `md`
// breakpoint (see StudioShell.tsx). Both copies exist in the DOM regardless
// of viewport, so every locator inside that area is ambiguous; `.first()`
// (desktop-order) or `.last()` (mobile-order) disambiguates, matching the
// pattern already established for M01's E2E suite.

test('garment project lifecycle: create, render, recolor, camera, persist, recent projects, delete', async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);

  await test.step('FLOW 1 — choosing the real garment creates a project and renders it', async () => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: /choose a garment/i }).first()).toBeVisible();

    const viewTool = page.getByRole('button', { name: 'View' }).first();
    await expect(viewTool).toHaveAttribute('aria-disabled', 'true');

    await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).first().click();

    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'ThreadForm Essential Tee Project',
    );
    await expect(viewTool).toHaveAttribute('aria-disabled', 'false');

    // Real WebGL canvas, real garment mesh — not a placeholder message.
    const canvas = page.locator('canvas:visible').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(50);
    expect(box?.height).toBeGreaterThan(50);
    await expect(page.getByText(/couldn.t be displayed/i)).toHaveCount(0);
  });

  await test.step('FLOW 2 — changing garment color updates state and persists across reload', async () => {
    const blackSwatch = page.getByRole('button', { name: 'Black' }).first();
    await blackSwatch.click();
    await expect(blackSwatch).toHaveAttribute('aria-pressed', 'true');
    // Autosave is debounced (see useStudioProject's AUTOSAVE_DEBOUNCE_MS) —
    // wait for the write to actually land before reloading, rather than
    // racing the known in-flight-save-vs-navigation window.
    await expect(page.locator('header').getByRole('status')).toHaveText(/^saved$/i, {
      timeout: 8000,
    });

    await page.reload();
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'ThreadForm Essential Tee Project',
    );
    await expect(page.getByRole('button', { name: 'Black' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('canvas:visible').first()).toBeVisible();
  });

  await test.step('FLOW 3 — camera: orbit drag and preset buttons keep the canvas operational', async () => {
    await page.getByRole('button', { name: 'View' }).first().click();

    const canvas = page.locator('canvas:visible').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('expected the canvas to have a bounding box');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Orbit drag — must not throw or detach the canvas.
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 80, centerY - 40, { steps: 8 });
    await page.mouse.up();
    await expect(canvas).toBeVisible();

    const backPreset = page.getByRole('button', { name: 'Back' }).first();
    await backPreset.click();
    await expect(backPreset).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toBeVisible();

    const frontPreset = page.getByRole('button', { name: 'Front' }).first();
    await frontPreset.click();
    await expect(frontPreset).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('FLOW 4 — a second project appears in recents; switching and deleting work', async () => {
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByRole('heading', { name: /choose a garment/i }).first()).toBeVisible();
    await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).first().click();

    const nameInput = page.getByRole('textbox', { name: /project name/i });
    await nameInput.fill('Second Drop');
    await expect(page.locator('header').getByRole('status')).toHaveText(/^saved$/i, {
      timeout: 8000,
    });

    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByText('ThreadForm Essential Tee Project').first()).toBeVisible();
    await expect(page.getByText('Second Drop').first()).toBeVisible();

    await page.getByText('ThreadForm Essential Tee Project').first().click();
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'ThreadForm Essential Tee Project',
    );

    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('button', { name: 'Delete Second Drop' }).first().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText('Second Drop').first()).not.toBeVisible();

    await page.reload();
    await expect(page.getByText('Second Drop').first()).not.toBeVisible();
  });

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('legacy M01 project reference resolves to the real garment', async ({ page }) => {
  // M01 persisted a placeholder garment reference shaped
  // { garmentId: category, garmentVersion: '0.0.0', category } — no
  // manifest system existed yet. Seed one directly in IndexedDB (mirroring
  // packages/local-storage's schema) and confirm the Studio treats a
  // t-shirt placeholder as compatible with the real garment, per
  // docs/GARMENT_SPEC.md's compatibility rule.
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: /choose a garment/i }).first()).toBeVisible();

  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      // Opened without a version so this keeps working as the schema is
      // upgraded (M03 added the artwork store at v2) - naming an older
      // version than the app already created would fail outright.
      const request = indexedDB.open('threadform');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const now = new Date().toISOString();
        const project = {
          schemaVersion: 1,
          metadata: {
            id: 'project_legacy-m01',
            name: 'Legacy Tee',
            createdAt: now,
            updatedAt: now,
            studioMode: '3d',
          },
          garment: { garmentId: 't-shirt', garmentVersion: '0.0.0', category: 't-shirt' },
          garmentColor: { hex: '#f5f5f0', label: 'Natural' },
          material: { materialId: 'cotton', color: { hex: '#f5f5f0' }, propertyOverrides: {} },
          artworks: [],
          printZones: [],
          effects: [],
          animation: {
            presetId: 'idle',
            durationMs: 4000,
            playbackSpeed: 1,
            loop: true,
            startAtMs: 0,
            endAtMs: 4000,
          },
          camera: {
            presetId: 'front',
            target: { x: 0, y: 0, z: 0 },
            distance: 1.9,
            azimuthDegrees: 0,
            polarDegrees: 80,
            fieldOfViewDegrees: 32,
          },
          lighting: {
            presetId: 'studio-soft',
            key: { intensity: 1, colorTemperatureKelvin: 5600 },
            fill: { intensity: 0.45, colorTemperatureKelvin: 5600 },
            rim: { intensity: 0.6, colorTemperatureKelvin: 6500 },
            environment: { intensity: 0.35, colorTemperatureKelvin: 6500 },
          },
          background: { kind: 'solid-color', color: '#101012' },
          exportPreferences: {
            target: 'custom',
            image: { format: 'png', resolution: '1080p' },
            video: { format: 'webm', resolution: '1080p', frameRate: 30 },
            aspectRatio: '1:1',
          },
        };
        const tx = db.transaction(['projects', 'meta'], 'readwrite');
        tx.objectStore('projects').put({
          id: project.metadata.id,
          schemaVersion: project.schemaVersion,
          name: project.metadata.name,
          createdAt: project.metadata.createdAt,
          updatedAt: project.metadata.updatedAt,
          project,
        });
        tx.objectStore('meta').put({ key: 'lastOpenedProjectId', value: project.metadata.id });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });

  await page.reload();

  await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue('Legacy Tee');
  await expect(page.locator('canvas:visible').first()).toBeVisible();
  await expect(page.getByText(/matched from an earlier project format/i).first()).toBeVisible();
});

test('mobile: garment renders full-viewport with no overflow and accessible controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = trackConsoleErrors(page);

  await page.goto('/studio');
  await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).last().click();

  await expect(page.locator('canvas:visible').first()).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);

  // The bottom tool bar (mobile layout) must still be reachable.
  await expect(page.getByRole('navigation', { name: 'Studio tools' }).last()).toBeVisible();
  const viewTool = page.getByRole('button', { name: 'View' }).last();
  await expect(viewTool).toHaveAttribute('aria-disabled', 'false');

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

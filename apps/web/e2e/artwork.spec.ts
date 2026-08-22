import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { countPixels, decodePng, isCyanInk, isGreenInk, isMagentaInk } from './pixels';

/**
 * The artwork flow, verified against pixels the browser actually painted.
 *
 * Every "is the artwork there?" assertion here screenshots the real WebGL
 * canvas and counts pixels of the fixture's hue. That is deliberate: a test
 * that only checked component state would pass just as happily with the 3D
 * projection completely broken, which is the specific failure this
 * milestone most needs to rule out. The fixtures use fully-saturated hues
 * that appear nowhere in the Studio's palette or on the tee's neutral
 * fabric (see `scripts/generate-artwork-fixtures.mjs`), and the matchers
 * test channel *relationships* rather than exact values, so lighting and
 * tone mapping don't make a correct render look like a failure.
 *
 * As elsewhere in this suite, the Studio renders desktop and mobile layouts
 * side by side and swaps them with CSS, so `.first()` / `.last()`
 * disambiguates each locator.
 */

// `__dirname`, not `import.meta.url`: Playwright transpiles specs to CJS.
const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name: string) => path.join(FIXTURES, name);

/** Comfortably above the stray-pixel noise floor, comfortably below a full-size print. */
const INK_PRESENT = 400;
const INK_ABSENT = 40;

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  return errors;
}

function studioCanvas(page: Page): Locator {
  return page.locator('canvas:visible').first();
}

/**
 * Counts pixels of a given ink in the rendered garment. The short settle
 * wait is not arbitrary: the canvas runs `frameloop="demand"`, so it
 * redraws once in response to a texture upload and then goes idle again —
 * screenshotting before that frame lands would read the previous state.
 */
async function inkPixels(
  page: Page,
  matcher: (pixel: { r: number; g: number; b: number }) => boolean,
) {
  await page.waitForTimeout(650);
  const shot = await studioCanvas(page).screenshot();
  return countPixels(decodePng(shot), matcher);
}

async function openArtworkTool(page: Page) {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).first().click();
  await expect(studioCanvas(page)).toBeVisible();
  await page.getByRole('button', { name: 'Artwork' }).first().click();
  await expect(page.getByLabel('Add artwork').first()).toBeAttached();
}

async function uploadArtwork(page: Page, file: string) {
  await page.getByLabel('Add artwork').first().setInputFiles(fixture(file));
}

async function waitForSaved(page: Page) {
  await expect(page.locator('header').getByRole('status')).toHaveText(/^saved$/i, {
    timeout: 8000,
  });
}

test('artwork lifecycle: import, project onto the garment, place, persist, reload, replace, delete', async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);

  await test.step('FLOW 1 — an imported file is printed on the real 3D garment', async () => {
    await openArtworkTool(page);
    // Nothing printed yet: the fixture hue must be absent to begin with, or
    // every later assertion would be meaningless.
    expect(await inkPixels(page, isMagentaInk)).toBeLessThan(INK_ABSENT);

    await uploadArtwork(page, 'threadform-test-mark-magenta.png');
    await expect(
      page.getByRole('button', { name: /threadform-test-mark-magenta/i }).first(),
    ).toBeVisible();

    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT);
  });

  await test.step('FLOW 2 — placement changes are visible on the garment', async () => {
    const before = await inkPixels(page, isMagentaInk);

    const size = page.getByLabel('Size').first();
    await size.fill('12');
    const shrunk = await inkPixels(page, isMagentaInk);
    // A smaller print covers meaningfully fewer pixels — proof the transform
    // reaches the renderer rather than only the panel.
    expect(shrunk).toBeLessThan(before * 0.6);
    expect(shrunk).toBeGreaterThan(0);

    await size.fill('45');
    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(shrunk * 1.5);

    await page.getByLabel('Rotation').first().fill('35');
    await page.getByLabel('Vertical').first().fill('65');
    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT);
  });

  await test.step('FLOW 3 — front and back are genuinely separate print zones', async () => {
    await page.getByRole('button', { name: /^Back/ }).first().click();

    // Selecting the back zone turns the garment around; the front print is
    // now facing away and must not be visible through the garment.
    expect(await inkPixels(page, isMagentaInk)).toBeLessThan(INK_ABSENT);
    await expect(page.getByText(/nothing on the back yet/i).first()).toBeVisible();

    await uploadArtwork(page, 'threadform-test-mark-cyan.png');
    await expect(
      page.getByRole('button', { name: /threadform-test-mark-cyan/i }).first(),
    ).toBeVisible();

    expect(await inkPixels(page, isCyanInk)).toBeGreaterThan(INK_PRESENT);
    // The back print must not bleed onto the front zone's texture.
    expect(await inkPixels(page, isMagentaInk)).toBeLessThan(INK_ABSENT);

    // Returning to the front finds its artwork untouched by the round trip.
    await page
      .getByRole('button', { name: /^Front/ })
      .first()
      .click();
    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT);
    expect(await inkPixels(page, isCyanInk)).toBeLessThan(INK_ABSENT);
  });

  await test.step('FLOW 4 — artwork and placement survive a reload', async () => {
    const rotationBefore = await page.getByLabel('Rotation').first().inputValue();
    const sizeBefore = await page.getByLabel('Size').first().inputValue();
    const verticalBefore = await page.getByLabel('Vertical').first().inputValue();
    const magentaBefore = await inkPixels(page, isMagentaInk);

    await waitForSaved(page);
    await page.reload();

    await expect(studioCanvas(page)).toBeVisible();
    await page.getByRole('button', { name: 'Artwork' }).first().click();
    await expect(
      page.getByRole('button', { name: /threadform-test-mark-magenta/i }).first(),
    ).toBeVisible();

    await expect(page.getByLabel('Rotation').first()).toHaveValue(rotationBefore);
    await expect(page.getByLabel('Size').first()).toHaveValue(sizeBefore);
    await expect(page.getByLabel('Vertical').first()).toHaveValue(verticalBefore);

    // Visually equivalent, not merely "some artwork is present".
    const magentaAfter = await inkPixels(page, isMagentaInk);
    expect(magentaAfter).toBeGreaterThan(magentaBefore * 0.8);
    expect(magentaAfter).toBeLessThan(magentaBefore * 1.25);

    // The back zone's artwork came back too.
    await page.getByRole('button', { name: /^Back/ }).first().click();
    expect(await inkPixels(page, isCyanInk)).toBeGreaterThan(INK_PRESENT);
    await page
      .getByRole('button', { name: /^Front/ })
      .first()
      .click();
  });

  await test.step('FLOW 5 — garment colour and artwork coexist', async () => {
    await page.getByRole('button', { name: 'Garment' }).first().click();
    await page.getByRole('button', { name: 'Black' }).first().click();
    await page.getByRole('button', { name: 'Artwork' }).first().click();

    // Recolouring the shirt must not tint the ink printed on it.
    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT);
  });

  await test.step('FLOW 6 — replacing the artwork swaps what is printed', async () => {
    await page
      .getByLabel('Replace artwork')
      .first()
      .setInputFiles(fixture('threadform-test-mark.svg'));
    await expect(page.getByRole('button', { name: /threadform-test-mark/i }).first()).toBeVisible();

    expect(await inkPixels(page, isGreenInk)).toBeGreaterThan(INK_PRESENT);
    expect(await inkPixels(page, isMagentaInk)).toBeLessThan(INK_ABSENT);
  });

  await test.step('FLOW 7 — removing the artwork clears it from the garment', async () => {
    await page.getByRole('button', { name: 'Remove' }).first().click();
    expect(await inkPixels(page, isGreenInk)).toBeLessThan(INK_ABSENT);
    await expect(page.getByText(/nothing on the front yet/i).first()).toBeVisible();

    await waitForSaved(page);
    await page.reload();
    await page.getByRole('button', { name: 'Artwork' }).first().click();
    await expect(page.getByText(/nothing on the front yet/i).first()).toBeVisible();
    expect(await inkPixels(page, isGreenInk)).toBeLessThan(INK_ABSENT);
  });

  await test.step('FLOW 8 — orbit and camera presets leave the print attached to the garment', async () => {
    await page.getByRole('button', { name: /^Back/ }).first().click();
    expect(await inkPixels(page, isCyanInk)).toBeGreaterThan(INK_PRESENT);

    const box = await studioCanvas(page).boundingBox();
    if (!box) throw new Error('expected the canvas to have a bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    // Still printed after orbiting — the artwork is part of the garment
    // surface, not an overlay pinned to the viewport.
    expect(await inkPixels(page, isCyanInk)).toBeGreaterThan(INK_PRESENT / 2);
  });

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('artwork import rejects files that are not real images', async ({ page }) => {
  await openArtworkTool(page);

  await test.step('a text file with a .png name and an image MIME type is refused', async () => {
    await uploadArtwork(page, 'not-an-image.png');
    // Scoped by text, not by role alone: Next renders an always-present
    // empty route-announcer with role="alert".
    await expect(page.getByRole('alert').filter({ hasText: /supported image/i })).toHaveCount(1);
    // Nothing was added, and nothing was printed.
    await expect(page.getByText(/nothing on the front yet/i).first()).toBeVisible();
  });

  await test.step('a valid file still works immediately afterwards', async () => {
    await uploadArtwork(page, 'threadform-test-mark-magenta.png');
    await expect(
      page.getByRole('button', { name: /threadform-test-mark-magenta/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /supported image/i })).toHaveCount(0);
    expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT);
  });
});

test('uploaded SVG is sanitized before anything renders it', async ({ page }) => {
  const consoleErrors = trackConsoleErrors(page);
  await openArtworkTool(page);

  await uploadArtwork(page, 'threadform-test-mark-hostile.svg');
  await expect(
    page.getByRole('button', { name: /threadform-test-mark-hostile/i }).first(),
  ).toBeVisible();

  // The fixture's <script> and its `onload` handler both set this flag. An
  // <img>-rendered SVG should not run script even unsanitized, which is
  // exactly why this is asserted rather than assumed.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => 'ThreadFormSvgScriptRan' in window)).toBe(false);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__threadformSvgScriptRan,
    ),
  ).toBeUndefined();

  // The external <image href> was stripped, so nothing was fetched off-origin.
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) externalRequests.push(request.url());
  });
  await page.waitForTimeout(500);
  expect(externalRequests).toEqual([]);

  // What survived sanitization still renders: the artwork is real, not blanked.
  const shot = await studioCanvas(page).screenshot();
  const orange = countPixels(
    decodePng(shot),
    ({ r, g, b }) => r > 140 && r - b > 70 && g > 60 && g < r,
  );
  expect(orange).toBeGreaterThan(INK_PRESENT);

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('mobile: artwork can be imported and placed at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = trackConsoleErrors(page);

  await page.goto('/studio');
  await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).last().click();
  await expect(studioCanvas(page)).toBeVisible();

  // The mobile tool bar opens the Inspector sheet with the artwork controls.
  await page.getByRole('button', { name: 'Artwork' }).last().click();
  const addArtwork = page.getByLabel('Add artwork').last();
  await expect(addArtwork).toBeAttached();

  await addArtwork.setInputFiles(fixture('threadform-test-mark-magenta.png'));
  await expect(
    page.getByRole('button', { name: /threadform-test-mark-magenta/i }).last(),
  ).toBeVisible();
  expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(INK_PRESENT / 2);

  // Placement controls are usable and meet the touch-target minimum.
  const size = page.getByLabel('Size').last();
  await expect(size).toBeVisible();
  const sizeBox = await size.boundingBox();
  expect(sizeBox?.height).toBeGreaterThanOrEqual(36);
  await size.fill('20');
  expect(await inkPixels(page, isMagentaInk)).toBeGreaterThan(0);

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Download, Locator, Page } from '@playwright/test';
import {
  alphaProfile,
  countPixels,
  decodePng,
  isGarmentFabric,
  isMagentaHue,
  isMagentaInk,
  measureSurface,
  readImageSize,
  sniffImageFormat,
} from './pixels';

/**
 * Image export, verified against the bytes the browser actually downloaded.
 *
 * Every assertion here reads the real file: its signature, its header
 * dimensions, and — for PNG — its decoded pixels. Asserting that the panel
 * said "Saved" would pass just as happily against a zero-byte file, a PNG
 * mislabelled `.webp`, a 512px render upscaled by the encoder, or a
 * "transparent" export with the studio backdrop baked into it. Those are
 * precisely the failures this milestone has to rule out.
 */

// `__dirname`, not `import.meta.url`: Playwright transpiles specs to CJS.
const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name: string) => path.join(FIXTURES, name);

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

/** A project with a garment, real artwork and a real print effect — so an export has something to prove. */
async function openProjectWithArtwork(
  page: Page,
  options: { effect?: RegExp; mobile?: boolean } = {},
) {
  const pick = (locator: Locator) => (options.mobile ? locator.last() : locator.first());

  await page.goto('/studio');
  await pick(page.getByRole('button', { name: 'ThreadForm Essential Tee' })).click();
  await expect(studioCanvas(page)).toBeVisible();
  await page.waitForTimeout(900);

  await pick(page.getByRole('button', { name: 'Artwork' })).click();
  await pick(page.getByLabel('Add artwork')).setInputFiles(
    fixture('threadform-test-mark-magenta.png'),
  );
  await expect(
    pick(page.getByRole('button', { name: /threadform-test-mark-magenta/i })),
  ).toBeVisible();

  if (options.effect) {
    await pick(page.getByRole('button', { name: options.effect })).click();
    await page.waitForTimeout(600);
  }
}

async function openExportTool(page: Page, mobile = false) {
  const pick = (locator: Locator) => (mobile ? locator.last() : locator.first());
  await pick(page.getByRole('button', { name: 'Export' })).click();
  await expect(pick(page.getByRole('button', { name: /Export image/ }))).toBeVisible();
}

/** Clicks Export and returns the file the browser actually downloaded. */
async function runExport(
  page: Page,
  mobile = false,
): Promise<{ download: Download; buffer: Buffer }> {
  const pick = (locator: Locator) => (mobile ? locator.last() : locator.first());
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    pick(page.getByRole('button', { name: /Export image/ })).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error('the download produced no file');
  return { download, buffer: readFileSync(filePath) };
}

async function setOption(page: Page, name: string | RegExp, mobile = false) {
  const locator = page.getByRole('button', { name });
  await (mobile ? locator.last() : locator.first()).click();
  await page.waitForTimeout(250);
}

async function waitForSaved(page: Page) {
  await expect(page.locator('header').getByRole('status')).toHaveText(/^saved$/i, {
    timeout: 8000,
  });
}

test('FLOW A — PNG 1080 square: a real downloaded file with a real garment and real artwork', async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await openProjectWithArtwork(page);
  await openExportTool(page);

  await setOption(page, 'PNG', false);
  await setOption(page, '1:1');
  await setOption(page, '1080p');

  // The panel states the exact output size before anything is rendered.
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('1080 × 1080 px');

  const { download, buffer } = await runExport(page);

  expect(download.suggestedFilename()).toMatch(/^threadform-.*-1080x1080\.png$/);
  expect(sniffImageFormat(buffer)).toBe('png');
  expect(readImageSize(buffer)).toEqual({ width: 1080, height: 1080 });

  const image = decodePng(buffer);
  // Not a screenshot of the viewport: the Studio canvas at this window size
  // is nothing like 1080×1080.
  expect(image.width).toBe(1080);
  expect(image.height).toBe(1080);

  const fabric = measureSurface(image, isGarmentFabric);
  expect(fabric.count, 'the garment should be in the file').toBeGreaterThan(40_000);
  expect(countPixels(image, isMagentaInk), 'the artwork should be in the file').toBeGreaterThan(
    2000,
  );

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('FLOW B — portrait social export is 1080×1920 with the garment fully visible', async ({
  page,
}) => {
  await openProjectWithArtwork(page, { effect: /Embroidery/ });
  await openExportTool(page);

  await setOption(page, '9:16');
  await setOption(page, '1080p');
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('1080 × 1920 px');

  const { buffer } = await runExport(page);
  expect(readImageSize(buffer)).toEqual({ width: 1080, height: 1920 });

  const image = decodePng(buffer);
  expect(countPixels(image, isMagentaHue)).toBeGreaterThan(1500);

  await test.step('the garment is not clipped by the frame', async () => {
    // Fabric touching any edge of the image would mean the garment ran off
    // the canvas rather than being framed for this aspect ratio.
    const edgeFabric = (() => {
      let found = 0;
      const at = (x: number, y: number) => {
        const index = (y * image.width + x) * 4;
        return { r: image.data[index]!, g: image.data[index + 1]!, b: image.data[index + 2]! };
      };
      for (let x = 0; x < image.width; x += 1) {
        if (isGarmentFabric(at(x, 0))) found += 1;
        if (isGarmentFabric(at(x, image.height - 1))) found += 1;
      }
      for (let y = 0; y < image.height; y += 1) {
        if (isGarmentFabric(at(0, y))) found += 1;
        if (isGarmentFabric(at(image.width - 1, y))) found += 1;
      }
      return found;
    })();
    expect(edgeFabric).toBe(0);
  });

  await test.step('the garment is reasonably scaled, not lost in the frame', async () => {
    // Fitting a bounding *sphere* left the product occupying about a third
    // of a 9:16 frame — technically unclipped and not a usable social post.
    const fabric = measureSurface(image, isGarmentFabric);
    expect(fabric.count / (image.width * image.height)).toBeGreaterThan(0.12);
  });
});

test('FLOW C — transparent PNG has real alpha, not a dark rectangle', async ({ page }) => {
  await openProjectWithArtwork(page, { effect: /Screen print/ });
  await openExportTool(page);

  await setOption(page, /PNG \(transparent\)/);
  await setOption(page, '1:1');
  await setOption(page, '1080p');

  const { buffer } = await runExport(page);
  expect(sniffImageFormat(buffer)).toBe('png');
  expect(readImageSize(buffer)).toEqual({ width: 1080, height: 1080 });

  const image = decodePng(buffer);
  const alpha = alphaProfile(image);

  // A genuinely empty background, not the studio gradient with an alpha
  // channel bolted on.
  expect(alpha.transparent / alpha.total).toBeGreaterThan(0.3);
  // The garment itself is solid.
  expect(alpha.opaque / alpha.total).toBeGreaterThan(0.2);
  // An antialiased silhouette, so the edge is soft rather than stepped —
  // but a thin band of the image, not most of it.
  expect(alpha.partial).toBeGreaterThan(0);
  expect(alpha.partial / alpha.total).toBeLessThan(0.05);

  // The corners are the backdrop, and must be fully absent.
  const corners: Array<[number, number]> = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
  ];
  for (const [x, y] of corners) {
    const index = (y * image.width + x) * 4;
    expect(image.data[index + 3], `corner ${x},${y} alpha`).toBe(0);
  }

  expect(countPixels(image, isMagentaInk), 'artwork survives a transparent export').toBeGreaterThan(
    1500,
  );

  await test.step('the antialiased edge is not composited against the dark backdrop', async () => {
    // If the silhouette had been flattened onto the studio gradient before
    // the alpha was applied, edge pixels would be markedly darker than the
    // solid garment beside them. They are not.
    let partialTotal = 0;
    let partialCount = 0;
    let opaqueEdgeTotal = 0;
    let opaqueEdgeCount = 0;
    const alphaAt = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]!;
    const lumaAt = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      return 0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!;
    };

    for (let y = 1; y < image.height - 1 && partialCount < 3000; y += 1) {
      for (let x = 1; x < image.width - 1; x += 1) {
        const a = alphaAt(x, y);
        if (a > 0 && a < 255) {
          partialTotal += lumaAt(x, y);
          partialCount += 1;
        } else if (a === 255) {
          const neighbours = [
            alphaAt(x - 1, y),
            alphaAt(x + 1, y),
            alphaAt(x, y - 1),
            alphaAt(x, y + 1),
          ];
          if (neighbours.some((n) => n < 255) && opaqueEdgeCount < 3000) {
            opaqueEdgeTotal += lumaAt(x, y);
            opaqueEdgeCount += 1;
          }
        }
      }
    }

    expect(partialCount).toBeGreaterThan(100);
    expect(opaqueEdgeCount).toBeGreaterThan(100);
    const partialLuma = partialTotal / partialCount;
    const opaqueLuma = opaqueEdgeTotal / opaqueEdgeCount;
    expect(partialLuma).toBeGreaterThan(opaqueLuma * 0.75);
  });
});

test('FLOW D — JPG and WebP encode to the format they claim, or say they cannot', async ({
  page,
}) => {
  await openProjectWithArtwork(page);
  await openExportTool(page);
  await setOption(page, '1:1');
  await setOption(page, '720p');

  await test.step('JPG', async () => {
    await setOption(page, 'JPG');
    const { download, buffer } = await runExport(page);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    expect(sniffImageFormat(buffer)).toBe('jpeg');
    expect(readImageSize(buffer)).toEqual({ width: 720, height: 720 });
  });

  await test.step('WebP, when this browser can encode it', async () => {
    const supported = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp');
      });
      return blob?.type === 'image/webp';
    });

    const option = page.getByRole('button', { name: 'WebP' }).first();
    if (!supported) {
      // The product must not offer an encoder the browser does not have —
      // and must never hand over a PNG named `.webp`.
      await expect(option).toHaveCount(0);
      return;
    }

    await setOption(page, 'WebP');
    const { download, buffer } = await runExport(page);
    expect(download.suggestedFilename()).toMatch(/\.webp$/);
    expect(sniffImageFormat(buffer)).toBe('webp');
    expect(readImageSize(buffer)).toEqual({ width: 720, height: 720 });
  });
});

test('FLOW E — exported files reflect the real material and print effect', async ({ page }) => {
  await openProjectWithArtwork(page, { effect: /Screen print/ });

  const exportAt = async (): Promise<Buffer> => {
    await openExportTool(page);
    await setOption(page, 'PNG', false);
    await setOption(page, '1:1');
    await setOption(page, '1080p');
    const { buffer } = await runExport(page);
    return buffer;
  };

  const cottonScreenPrint = decodePng(await exportAt());

  await page.getByRole('button', { name: 'Garment' }).first().click();
  await page
    .getByRole('button', { name: /Jersey/ })
    .first()
    .click();
  await page.waitForTimeout(500);
  const jerseyScreenPrint = decodePng(await exportAt());

  await test.step('cotton and jersey export as different surfaces', async () => {
    const cotton = measureSurface(cottonScreenPrint, isGarmentFabric);
    const jersey = measureSurface(jerseyScreenPrint, isGarmentFabric);
    expect(cotton.count).toBeGreaterThan(20_000);
    expect(jersey.count).toBeGreaterThan(20_000);
    // A knit's wales run vertically, so its contrast is far more horizontal
    // than a weave's even grid — the same relationship M04 measures in the
    // viewport, now proven in the exported file.
    expect(jersey.gradientX / jersey.gradientY).toBeGreaterThan(
      (cotton.gradientX / cotton.gradientY) * 1.15,
    );
  });

  await page.getByRole('button', { name: 'Artwork' }).first().click();
  await page
    .getByRole('button', { name: /Embroidery/ })
    .first()
    .click();
  await page.waitForTimeout(600);
  const jerseyEmbroidery = decodePng(await exportAt());

  await test.step('embroidery exports as a raised surface, screen print as flat ink', async () => {
    const ink = measureSurface(jerseyScreenPrint, isMagentaInk);
    const thread = measureSurface(jerseyEmbroidery, isMagentaInk);
    expect(ink.count).toBeGreaterThan(1000);
    expect(thread.texture).toBeGreaterThan(ink.texture * 1.4);
  });
});

test('FLOW F — export preferences persist across a reload and still export', async ({ page }) => {
  await openProjectWithArtwork(page);
  await openExportTool(page);

  await setOption(page, /Instagram feed/);
  await setOption(page, 'JPG');
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('1080 × 1350 px');

  await waitForSaved(page);
  await page.reload();
  await expect(studioCanvas(page)).toBeVisible();
  await openExportTool(page);

  await expect(page.getByRole('button', { name: /Instagram feed/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'JPG' }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('1080 × 1350 px');

  const { download, buffer } = await runExport(page);
  expect(download.suggestedFilename()).toMatch(/-1080x1350\.jpg$/);
  expect(sniffImageFormat(buffer)).toBe('jpeg');
  expect(readImageSize(buffer)).toEqual({ width: 1080, height: 1350 });
});

test('FLOW G — mobile: export is reachable and works at 390×844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = trackConsoleErrors(page);

  await openProjectWithArtwork(page, { mobile: true });
  await openExportTool(page, true);

  const dimensions = page.getByTestId('export-dimensions').last();
  await expect(dimensions).toBeVisible();

  await setOption(page, '1:1', true);
  await setOption(page, '720p', true);
  await expect(dimensions).toHaveText('720 × 720 px');

  // The export button meets the project's touch-target minimum.
  const button = page.getByRole('button', { name: /Export image/ }).last();
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(32);

  const { buffer } = await runExport(page, true);
  expect(sniffImageFormat(buffer)).toBe('png');
  // The export is the size that was asked for — not the size of the phone.
  expect(readImageSize(buffer)).toEqual({ width: 720, height: 720 });

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

/**
 * One real 4K render. Not repeated across the suite — it is the slowest and
 * heaviest case — but M05 cannot claim 4K is supported without ever having
 * produced one.
 */
test('4K export renders and encodes at full size', async ({ page }) => {
  await openProjectWithArtwork(page, { effect: /Screen print/ });
  await openExportTool(page);

  await setOption(page, '16:9');
  await setOption(page, '4K');
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('3840 × 2160 px');

  const { download, buffer } = await runExport(page);
  expect(download.suggestedFilename()).toMatch(/-3840x2160\.png$/);
  expect(sniffImageFormat(buffer)).toBe('png');
  expect(readImageSize(buffer)).toEqual({ width: 3840, height: 2160 });

  const image = decodePng(buffer);
  // Not a blank frame, and not a small render the encoder upscaled.
  expect(measureSurface(image, isGarmentFabric).count).toBeGreaterThan(200_000);
  expect(countPixels(image, isMagentaInk)).toBeGreaterThan(5000);

  // The Studio survives a 4K render and can still export afterwards.
  await expect(studioCanvas(page)).toBeVisible();
  await setOption(page, '1:1');
  await setOption(page, '720p');
  const second = await runExport(page);
  expect(readImageSize(second.buffer)).toEqual({ width: 720, height: 720 });
});

test('export refuses rather than producing a file missing known content', async ({ page }) => {
  await openProjectWithArtwork(page);
  await waitForSaved(page);

  // Simulate storage eviction: the project still references artwork whose
  // bytes are gone. Interactively that layer shows as broken and stays
  // editable; an export presented as finished output must not silently omit
  // it.
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('threadform');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['artworks'], 'readwrite');
        tx.objectStore('artworks').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });

  await page.reload();
  await expect(studioCanvas(page)).toBeVisible();
  await openExportTool(page);

  const exportButton = page.getByRole('button', { name: /Export image/ }).first();
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText(/couldn.t be loaded/i).first()).toBeVisible();

  // And the Studio is still usable.
  await page.getByRole('button', { name: 'Garment' }).first().click();
  await expect(page.getByRole('button', { name: /Jersey/ }).first()).toBeVisible();
});

test('an invalid custom size is refused with a specific reason, and export recovers', async ({
  page,
}) => {
  await openProjectWithArtwork(page);
  await openExportTool(page);

  await setOption(page, 'Custom size');
  const width = page.getByLabel('Width').first();
  await width.fill('0');
  await page.waitForTimeout(300);

  await expect(page.getByTestId('export-dimensions').first()).toHaveText('—');
  await expect(page.getByRole('button', { name: /Export image/ }).first()).toBeDisabled();

  await width.fill('9999');
  await page.waitForTimeout(300);
  await expect(page.getByRole('alert').filter({ hasText: /at most/i })).toHaveCount(1);

  // A valid size brings it straight back — no reload, no lost project.
  await width.fill('800');
  await page.getByLabel('Height').first().fill('600');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('export-dimensions').first()).toHaveText('800 × 600 px');

  const { buffer } = await runExport(page);
  expect(readImageSize(buffer)).toEqual({ width: 800, height: 600 });
});

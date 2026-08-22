import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  changedFraction,
  decodePng,
  isGarmentFabric,
  isMagentaHue,
  isMagentaInk,
  measureSurface,
} from './pixels';

/**
 * Garment material and print effects, measured against what the browser
 * actually painted.
 *
 * The claims M04 makes are about surfaces, so the measurements are about
 * surfaces: local contrast, and which direction it runs in. A knit is ribbed
 * where a weave is even; embroidery is raised where screen-printed ink is
 * flat. Those are relationships between two renders, which is what makes
 * them robust — an exact-pixel snapshot would break on any lighting tweak
 * while proving nothing about whether the two materials differ at all.
 *
 * As elsewhere in this suite, the Studio renders desktop and mobile layouts
 * side by side and swaps them with CSS, so `.first()` / `.last()`
 * disambiguates each locator.
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

/** The canvas runs `frameloop="demand"`, so it redraws once and idles — settle before reading it. */
async function renderOf(page: Page) {
  await page.waitForTimeout(700);
  return decodePng(await studioCanvas(page).screenshot());
}

async function openStudio(page: Page) {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).first().click();
  await expect(studioCanvas(page)).toBeVisible();
  await page.waitForTimeout(900);
}

/** Faces the garment and moves in, so fabric structure is actually resolvable. */
async function zoomToFabric(page: Page, steps = 8) {
  const box = await studioCanvas(page).boundingBox();
  if (!box) throw new Error('expected the canvas to have a bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < steps; i += 1) await page.mouse.wheel(0, -120);
  await page.waitForTimeout(600);
}

async function waitForSaved(page: Page) {
  await expect(page.locator('header').getByRole('status')).toHaveText(/^saved$/i, {
    timeout: 8000,
  });
}

test('FLOW A — garment material: cotton and jersey render as different surfaces, and persist', async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await openStudio(page);
  await zoomToFabric(page);

  await expect(page.getByRole('button', { name: /Cotton/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cotton = await renderOf(page);
  const cottonFabric = measureSurface(cotton, isGarmentFabric);
  expect(cottonFabric.count).toBeGreaterThan(20000);

  await page
    .getByRole('button', { name: /Jersey/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: /Jersey/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const jersey = await renderOf(page);
  const jerseyFabric = measureSurface(jersey, isGarmentFabric);

  await test.step('the rendered garment actually changes', async () => {
    // A dropdown that changes while the render does not would pass every
    // DOM assertion in this file and fail here.
    expect(changedFraction(cotton, jersey)).toBeGreaterThan(0.05);
  });

  await test.step('the two surfaces differ in structure, not only in shading', async () => {
    // A knit's wales run vertically, so its contrast is far more horizontal
    // than a weave's even grid. This is the measurement that separates a
    // real second material from a roughness tweak.
    const cottonAnisotropy = cottonFabric.gradientX / cottonFabric.gradientY;
    const jerseyAnisotropy = jerseyFabric.gradientX / jerseyFabric.gradientY;
    expect(jerseyAnisotropy).toBeGreaterThan(cottonAnisotropy * 1.2);
  });

  await test.step('garment colour still works on the new fabric', async () => {
    await page.getByRole('button', { name: 'Black' }).first().click();
    await expect(page.getByRole('button', { name: 'Black' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const dark = await renderOf(page);
    expect(changedFraction(jersey, dark)).toBeGreaterThan(0.1);

    await page.getByRole('button', { name: 'Natural' }).first().click();
    await expect(page.getByRole('button', { name: 'Natural' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  await test.step('the fabric survives a reload, rendered as well as selected', async () => {
    await waitForSaved(page);
    await page.reload();
    await expect(studioCanvas(page)).toBeVisible();
    await expect(page.getByRole('button', { name: /Jersey/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await zoomToFabric(page);
    const restored = measureSurface(await renderOf(page), isGarmentFabric);
    expect(restored.count).toBeGreaterThan(20000);
    // Still the knit, not the weave it would have fallen back to.
    expect(restored.gradientX / restored.gradientY).toBeGreaterThan(
      (cottonFabric.gradientX / cottonFabric.gradientY) * 1.2,
    );
  });

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('FLOW B & C — screen print and embroidery are different physical treatments that persist', async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await openStudio(page);

  await page.getByRole('button', { name: 'Artwork' }).first().click();
  await page
    .getByLabel('Add artwork')
    .first()
    .setInputFiles(fixture('threadform-test-mark-magenta.png'));
  await expect(
    page.getByRole('button', { name: /threadform-test-mark-magenta/i }).first(),
  ).toBeVisible();
  // Face the print head-on and move in, so the treatment is resolvable.
  await page
    .getByRole('button', { name: /^Front/ })
    .first()
    .click();
  await zoomToFabric(page, 12);

  const untreated = measureSurface(await renderOf(page), isMagentaInk);
  expect(untreated.count).toBeGreaterThan(2000);

  await test.step('FLOW B — screen print renders as flat bonded ink', async () => {
    await page
      .getByRole('button', { name: /Screen print/ })
      .first()
      .click();
    await expect(page.getByRole('button', { name: /Screen print/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const screenPrint = measureSurface(await renderOf(page), isMagentaInk);

    // The artwork is still there and still the right colour.
    expect(screenPrint.count).toBeGreaterThan(2000);
    // Screen-printed ink takes the shape of the cloth it bonds to, so it
    // shows the weave where an untreated print — which has no relief at all —
    // is perfectly smooth. This is the assertion that separates a real
    // treatment from the same transparent overlay under a new name.
    expect(screenPrint.texture).toBeGreaterThan(untreated.texture * 1.5);
  });

  await test.step('FLOW B — the print stays attached through transform and orbit', async () => {
    await page.getByLabel('Rotation').first().fill('25');
    await page.getByLabel('Size').first().fill('60');
    const transformed = measureSurface(await renderOf(page), isMagentaInk);
    expect(transformed.count).toBeGreaterThan(2000);

    const box = await studioCanvas(page).boundingBox();
    if (!box) throw new Error('expected the canvas to have a bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    // Still printed on the garment after orbiting — not a screen-space overlay.
    const orbited = measureSurface(await renderOf(page), isMagentaInk);
    expect(orbited.count).toBeGreaterThan(1000);

    await page
      .getByRole('button', { name: /^Front/ })
      .first()
      .click();
    await zoomToFabric(page, 0);
  });

  await test.step('FLOW C — embroidery renders measurably differently from screen print', async () => {
    // A controlled comparison: same camera, same artwork, same transform,
    // only the treatment differs. Re-measured here rather than reusing the
    // earlier reading, which was taken before the transform and orbit above.
    const inkRender = await renderOf(page);
    const ink = measureSurface(inkRender, isMagentaInk);
    const inkExtent = measureSurface(inkRender, isMagentaHue);
    const fabricBefore = measureSurface(inkRender, isGarmentFabric);
    expect(ink.count).toBeGreaterThan(500);

    await page
      .getByRole('button', { name: /Embroidery/ })
      .first()
      .click();
    await expect(page.getByRole('button', { name: /Embroidery/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const render = await renderOf(page);
    const embroidery = measureSurface(render, isMagentaInk);

    // The artwork is still there at its full extent. Measured by hue, not
    // by `isMagentaInk`: stitch relief shades each thread hard enough that
    // a correctly-rendered embroidery has *fewer* bright-magenta pixels than
    // the flat print it replaced, which is the effect working rather than
    // the artwork shrinking.
    expect(measureSurface(render, isMagentaHue).count).toBeGreaterThan(inkExtent.count * 0.8);
    // Raised stitching has far more local contrast within the print than a
    // flat film of ink does. Together with the step above this pins the
    // whole ordering — untreated < screen print < embroidery — so two
    // effects mapping to the same material would fail here, which is the
    // whole point of the assertion.
    expect(embroidery.texture).toBeGreaterThan(ink.texture * 1.6);

    // Alpha clipping: the bare fabric around the print is untouched, so no
    // raised surface leaked onto cloth that has no artwork on it.
    const fabricAfter = measureSurface(render, isGarmentFabric);
    expect(fabricAfter.count).toBeGreaterThan(10000);
    expect(Math.abs(fabricAfter.texture - fabricBefore.texture)).toBeLessThan(
      fabricBefore.texture * 0.35,
    );
  });

  await test.step('FLOW C — the stitch relief control changes the render', async () => {
    await page.getByLabel('Stitch relief').first().fill('5');
    const soft = measureSurface(await renderOf(page), isMagentaInk);

    await page.getByLabel('Stitch relief').first().fill('100');
    const hard = measureSurface(await renderOf(page), isMagentaInk);

    expect(hard.texture).toBeGreaterThan(soft.texture * 1.3);

    await page.getByLabel('Stitch relief').first().fill('60');
  });

  await test.step('FLOW C — the treatment survives a reload', async () => {
    const before = measureSurface(await renderOf(page), isMagentaInk);

    await waitForSaved(page);
    await page.reload();
    await expect(studioCanvas(page)).toBeVisible();
    await page.getByRole('button', { name: 'Artwork' }).first().click();
    await expect(page.getByRole('button', { name: /Embroidery/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Stitch relief').first()).toHaveValue('60');

    await page
      .getByRole('button', { name: /^Front/ })
      .first()
      .click();
    await zoomToFabric(page, 12);
    const after = measureSurface(await renderOf(page), isMagentaInk);

    expect(after.count).toBeGreaterThan(2000);
    // Visually equivalent, not merely "an effect is selected".
    expect(after.texture).toBeGreaterThan(before.texture * 0.6);
    expect(after.texture).toBeLessThan(before.texture * 1.7);
  });

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

test('FLOW D — capability enforcement: unsupported materials and effects are never offered or honoured', async ({
  page,
}) => {
  await openStudio(page);

  await test.step('the Tee offers only what its manifest declares', async () => {
    // `MaterialId` names nine fabrics and `EffectKind` sixteen processes.
    for (const absent of ['Denim', 'Fleece', 'Nylon', 'Mesh', 'Performance', 'Polyester']) {
      await expect(page.getByRole('button', { name: new RegExp(absent, 'i') })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: /Cotton/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Jersey/ }).first()).toBeVisible();
  });

  await test.step('an unsupported process is not offered on an artwork layer', async () => {
    await page.getByRole('button', { name: 'Artwork' }).first().click();
    await page
      .getByLabel('Add artwork')
      .first()
      .setInputFiles(fixture('threadform-test-mark-magenta.png'));
    await expect(page.getByRole('button', { name: /Screen print/ }).first()).toBeVisible();

    for (const absent of ['Puff', 'Foil', 'Metallic', 'Distressed', 'Acid wash', 'Sublimation']) {
      await expect(page.getByRole('button', { name: new RegExp(absent, 'i') })).toHaveCount(0);
    }
  });

  await test.step('a persisted project naming unsupported state opens safely and substitutes', async () => {
    // Hiding options in the UI does nothing about a document that already
    // names a fabric the garment never offered, or a process this build
    // cannot render. Seeded straight into IndexedDB, as M03 does for its
    // legacy-reference test.
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('threadform');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const now = new Date().toISOString();
          const project = {
            schemaVersion: 1,
            metadata: {
              id: 'project_hostile-m04',
              name: 'Hostile Config',
              createdAt: now,
              updatedAt: now,
              studioMode: '3d',
            },
            garment: {
              garmentId: 'threadform-essential-tee',
              garmentVersion: '1.1.0',
              category: 't-shirt',
            },
            garmentColor: { hex: '#f5f5f0', label: 'Natural' },
            // A fabric the Tee does not offer.
            material: { materialId: 'denim', propertyOverrides: { roughness: 900 } },
            artworks: [],
            printZones: [],
            // A process this build does not implement.
            // Schema-valid but unrenderable: this build implements no
            // 'foil'. An out-of-range intensity would be rejected by
            // `validateProject` instead, which is a different path (already
            // covered by M01's invalid-project test).
            effects: [{ id: 'effect_x', kind: 'foil', intensity: 1, parameters: { evil: 1e9 } }],
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

    const consoleErrors = trackConsoleErrors(page);
    await page.reload();

    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'Hostile Config',
    );
    // It renders rather than blanking: the unsupported fabric was substituted
    // and the absurd override clamped, at the resolution boundary.
    await expect(studioCanvas(page)).toBeVisible();
    await expect(page.getByText(/couldn.t be displayed/i)).toHaveCount(0);

    const fabric = measureSurface(await renderOf(page), isGarmentFabric);
    expect(fabric.count).toBeGreaterThan(10000);

    expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});

test('FLOW E — mobile: material and effect controls are reachable and usable at 390x844', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const consoleErrors = trackConsoleErrors(page);

  await page.goto('/studio');
  await page.getByRole('button', { name: 'ThreadForm Essential Tee' }).last().click();
  await expect(studioCanvas(page)).toBeVisible();
  await page.waitForTimeout(900);

  await test.step('the fabric control is reachable and meets the touch-target minimum', async () => {
    // Tapping a tool opens the Inspector sheet its controls live in.
    await page.getByRole('button', { name: 'Garment' }).last().click();
    const jersey = page.getByRole('button', { name: /Jersey/ }).last();
    await expect(jersey).toBeVisible();
    const box = await jersey.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(36);

    const before = await renderOf(page);
    await jersey.click();
    await expect(jersey).toHaveAttribute('aria-pressed', 'true');

    // The render does change — but the threshold is deliberately low. At
    // 390px the garment is small and its weave is close to sub-pixel, so
    // most of what differs here is the fabrics' shading rather than their
    // structure. Whether the two are properly distinct surfaces is measured
    // at desktop resolution in Flow A; this step's job is that the mobile
    // control is reachable and actually drives the renderer.
    const after = await renderOf(page);
    expect(changedFraction(before, after)).toBeGreaterThan(0.003);
    expect(
      Math.abs(
        measureSurface(after, isGarmentFabric).meanLuminance -
          measureSurface(before, isGarmentFabric).meanLuminance,
      ),
    ).toBeGreaterThan(0.05);
  });

  await test.step('the effect controls are reachable and the artwork stays visible while adjusting', async () => {
    await page.getByRole('button', { name: 'Artwork' }).last().click();
    await page
      .getByLabel('Add artwork')
      .last()
      .setInputFiles(fixture('threadform-test-mark-magenta.png'));
    await expect(
      page.getByRole('button', { name: /threadform-test-mark-magenta/i }).last(),
    ).toBeVisible();

    const embroidery = page.getByRole('button', { name: /Embroidery/ }).last();
    await expect(embroidery).toBeVisible();
    const box = await embroidery.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(36);
    await embroidery.click();
    await expect(embroidery).toHaveAttribute('aria-pressed', 'true');

    const relief = page.getByLabel('Stitch relief').last();
    await expect(relief).toBeVisible();
    expect((await relief.boundingBox())?.height).toBeGreaterThanOrEqual(36);
    await relief.fill('90');

    // The print is still on the garment while the control is being used.
    const render = await renderOf(page);
    expect(measureSurface(render, isMagentaInk).count).toBeGreaterThan(200);
  });

  await test.step('no horizontal overflow', async () => {
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('; ')}`).toEqual([]);
});

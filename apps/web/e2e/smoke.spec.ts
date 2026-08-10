import { test, expect } from '@playwright/test';

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

test('project lifecycle: create, persist across reload, switch, and delete', async ({ page }) => {
  await test.step('FLOW 1 — choosing a garment creates a real, persisted project', async () => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: /choose a garment/i })).toBeVisible();

    const artworkTool = page.getByRole('button', { name: 'Artwork' });
    await expect(artworkTool).toHaveAttribute('aria-disabled', 'true');

    await page.getByRole('button', { name: 'T-Shirt' }).click();

    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'T-Shirt Project',
    );
    await expect(artworkTool).toHaveAttribute('aria-disabled', 'false');
    await expect(page.getByText(/selected garment: t-shirt/i).first()).toBeVisible();
  });

  await test.step('FLOW 2 — reloading the page restores the persisted project', async () => {
    await page.reload();
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'T-Shirt Project',
    );
    // The garment picker's empty state must not flash before the restore completes.
    await expect(page.getByRole('heading', { name: /choose a garment/i })).not.toBeVisible();
  });

  await test.step('FLOW 3 — a second project appears in recents; switching works', async () => {
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByRole('heading', { name: /choose a garment/i })).toBeVisible();
    await page.getByRole('button', { name: 'Hoodie', exact: true }).click();
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'Hoodie Project',
    );

    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByText('T-Shirt Project').first()).toBeVisible();
    await expect(page.getByText('Hoodie Project').first()).toBeVisible();

    await page.getByText('T-Shirt Project').first().click();
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'T-Shirt Project',
    );
  });

  await test.step('FLOW 4 — deleting a project removes it permanently', async () => {
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByText('Hoodie Project').first()).toBeVisible();

    await page.getByRole('button', { name: 'Delete Hoodie Project' }).first().click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Hoodie Project').first()).not.toBeVisible();

    await page.reload();
    // T-Shirt was the last-opened project (reopened at the end of FLOW 3),
    // so reload restores it directly rather than showing the picker.
    await expect(page.getByRole('textbox', { name: /project name/i })).toHaveValue(
      'T-Shirt Project',
    );

    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByText('T-Shirt Project').first()).toBeVisible();
    await expect(page.getByText('Hoodie Project').first()).not.toBeVisible();
  });
});

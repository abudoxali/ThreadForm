import { test, expect } from '@playwright/test';

test('home page renders and links into the Studio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Open the Studio' }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test('studio garment picker unlocks the tool rail', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: /choose a garment/i })).toBeVisible();

  const artworkTool = page.getByRole('button', { name: 'Artwork' }).first();
  await expect(artworkTool).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: 'T-Shirt' }).click();
  await expect(artworkTool).toHaveAttribute('aria-disabled', 'false');
});

test('no horizontal overflow at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

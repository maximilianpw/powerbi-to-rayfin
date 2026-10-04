import { test, expect } from '@playwright/test';
test('synthetic report loads, explains blockers and inspects query bindings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Synthetic example — no real data' })).toBeVisible();
  await expect(page.getByText('Offline inspection, not a finished migration.')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Revenue (revenue)', exact: true }).click();
  await expect(page.getByText('Unexecuted candidate only. No parity claim.')).toBeVisible();
  await expect(page.locator('pre')).toContainText('ROW');
  await page.getByRole('button', { name: '← All objects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All objects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Compatibility findings/ }).click();
  await page.getByText('VISUAL TYPE UNSUPPORTED', { exact: true }).click();
  await expect(page.getByText('No renderer for visual type customExampleVisual.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('page switching and search are usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Synthetic details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect Region / Revenue (table)', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('not a report');
  await expect(page.getByRole('navigation', { name: 'Reports' }).getByRole('button')).toHaveCount(0);
  await page.getByRole('searchbox').fill('Synthetic');
  await expect(page.getByRole('navigation', { name: 'Reports' }).getByRole('button')).toHaveCount(1);
});
test('mobile shell does not create document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Synthetic example — no real data' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('catalog failure has an explicit retry state', async ({ page }) => {
  await page.route('**/catalog.json', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Could not open the catalog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

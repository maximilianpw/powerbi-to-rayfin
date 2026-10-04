import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// An explicit local-only smoke check. Evidence can contain private report labels.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5188');
  const reportButtons = page.getByRole('navigation', { name: 'Reports' }).getByRole('button');
  await reportButtons.first().waitFor();
  const reportCount = await reportButtons.count();
  let pagesChecked = 0;
  for (let report = 0; report < reportCount; report++) {
    await reportButtons.nth(report).click();
    const tabs = page.getByRole('navigation', { name: 'Report pages' }).getByRole('button');
    const count = await tabs.count();
    for (let tab = 0; tab < count; tab++) {
      await tabs.nth(tab).click();
      const objects = page.getByRole('region', { name: 'Report layout canvas' }).getByRole('button');
      if (await objects.count()) {
        // Some visuals overlap by design; inspect through the complete object list instead.
        const first = page.locator('.object-list button').first();
        if (await first.count()) await first.click();
      }
      pagesChecked++;
    }
  }
  await reportButtons.first().click();
  await mkdir('.local/evidence', { recursive: true });
  await page.screenshot({ path: '.local/evidence/report-workbench.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!fits) throw new Error('LOCAL_PREVIEW_MOBILE_OVERFLOW');
  if (errors.length) throw new Error('LOCAL_PREVIEW_BROWSER_ERRORS: ' + errors.join('; '));
  console.log(
    JSON.stringify({
      reportsChecked: reportCount,
      pagesChecked,
      browserErrors: errors.length,
      mobileDocumentFits: fits,
    }),
  );
} finally {
  await browser.close();
}

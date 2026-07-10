import { test, expect } from '@playwright/test';

test('check frontend renders', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text().substring(0, 150));
    }
  });
  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message.substring(0, 150)}`));

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);

  const rootChildren = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
  const rootHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 500) ?? '');

  console.log('Root children count:', rootChildren);
  console.log('Root HTML:', rootHTML);
  console.log('Errors:', JSON.stringify(errors));

  // React must render content into the root div
  expect(rootChildren).toBeGreaterThan(0);
  // No page errors
  expect(errors).toEqual([]);
});

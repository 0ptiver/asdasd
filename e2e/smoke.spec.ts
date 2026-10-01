import { test, expect } from '@playwright/test';

test('boots, creates a new game, shows HUD, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('new-0').click();
  await page.getByTestId('start-new').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('money')).toContainText('$100');
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

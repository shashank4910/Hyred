import { test, expect } from '@playwright/test';
import { prTitle } from '../helpers/pr';

test.describe('Navigation shell', () => {
  test(prTitle([96, 101], 'header run scan and sidebar nav are visible on desktop'), async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/stats');
    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /run scan|scanning/i }).first()).toBeVisible();
  });

  test(prTitle(96, 'logout redirects to login'), async ({ page }) => {
    await page.goto('/');
    const logout = page.getByRole('button', { name: /log out/i });
    if (!(await logout.isVisible())) {
      test.skip(true, 'Logout not visible — mobile layout or no session');
      return;
    }
    await logout.click();
    await page.waitForURL(/\/login/);
  });
});

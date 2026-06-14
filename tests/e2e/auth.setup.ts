import { test as setup, expect } from '@playwright/test';

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

setup('authenticate test user', async ({ page }) => {
  if (!email || !password) {
    setup.skip(true, 'Set TEST_USER_EMAIL and TEST_USER_PASSWORD for authenticated E2E');
    return;
  }

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible({ timeout: 15_000 });
  await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });
});

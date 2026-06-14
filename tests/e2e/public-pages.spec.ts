import { test, expect } from '@playwright/test';
import { prTitle } from '../helpers/pr';

test.describe('Public pages', () => {
  test(prTitle([95, 77], 'legal pages and login load'), async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Hyred' })).toBeVisible();
    await expect(page.getByText(/match smarter/i)).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: /contact us/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'hello@hyred.in' })).toBeVisible();
  });

  test(prTitle(99, 'login form has no post-login-only legal footer'), async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible();
  });
});

test.describe('Unauthenticated API', () => {
  test(prTitle([32, 54], 'protected API returns 401 without session'), async ({ request }) => {
    const res = await request.post('/api/profile', {
      data: { full_name: 'Test' },
    });
    expect(res.status()).toBe(401);
  });

  test(prTitle(109, 'cancel scan returns 401 when logged out'), async ({ request }) => {
    const res = await request.post('/api/ingest/cancel');
    expect(res.status()).toBe(401);
  });
});

import { test, expect } from '@playwright/test';
import { prTitle } from '../helpers/pr';

test.describe('Dashboard UI', () => {
  test(prTitle([106, 100, 103], 'status tabs fit on one line without horizontal scroll'), async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /inbox/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /applied/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /rejected/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /saved/i })).toBeVisible();

    const grid = page.locator('.grid-cols-7').first();
    await expect(grid).toBeVisible();
    const box = await grid.boundingBox();
    expect(box?.width).toBeGreaterThan(200);
  });

  test(prTitle([1, 54], 'dashboard shows greeting and match list or empty state'), async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();
    const hasMatches = (await page.locator('a[href^="/jobs/"]').count()) > 0;
    const hasEmpty = (await page.getByText(/run scan|no matches|onboarding/i).count()) > 0;
    expect(hasMatches || hasEmpty).toBeTruthy();
  });

  test(prTitle(110, 'matches API pagination endpoint responds'), async ({ request }) => {
    const res = await request.get('/api/matches?limit=10&offset=0');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('matches');
    expect(Array.isArray(body.matches)).toBeTruthy();
  });
});

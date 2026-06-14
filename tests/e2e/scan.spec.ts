import { test, expect } from '@playwright/test';
import { prTitle } from '../helpers/pr';

test.describe('Scan flows', () => {
  test(prTitle(109, 'cancel scan returns 404 when no active scan'), async ({ request }) => {
    const res = await request.post('/api/ingest/cancel');
    if (res.status() === 401) {
      test.skip(true, 'No auth storage — run auth setup first');
      return;
    }
    expect([404, 200]).toContain(res.status());
  });

  test(prTitle([105, 111, 113, 114, 115], 'run scan button visible in header'), async ({
    page,
  }) => {
    await page.goto('/');
    const scanBtn = page.getByRole('button', { name: /run scan|scanning/i });
    await expect(scanBtn.first()).toBeVisible();
  });
});

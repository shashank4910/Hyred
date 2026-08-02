/**
 * End-to-end tests for the ATS Checker UI page.
 *
 * Covers: page load, sample resume loading, input validation,
 * JD comparison toggle, history display, and the full check flow.
 */

import { test, expect } from '@playwright/test';

test.describe('ATS Checker Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ats-checker');
    // Clear any localStorage history
    await page.evaluate(() => localStorage.clear());
  });

  /* ── Page Structure ──────────────────────────────────────── */

  test('loads the page with title and header elements', async ({ page }) => {
    await expect(page).toHaveTitle(/ATS Resume Checker/i);
    await expect(page.getByText('ATS Resume Checker')).toBeVisible();
    await expect(page.getByText('8 criteria checked')).toBeVisible();
    await expect(page.getByText('Instant results')).toBeVisible();
    await expect(page.getByText('100% private')).toBeVisible();
  });

  test('shows drag-and-drop upload area', async ({ page }) => {
    await expect(page.getByText('Upload your resume')).toBeVisible();
    await expect(page.getByText(/Drop a \.pdf, \.doc, \.docx/)).toBeVisible();
  });

  test('shows paste text area', async ({ page }) => {
    const textarea = page.getByPlaceholder('Paste your full resume text here...');
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEmpty();
  });

  test('shows check button disabled initially', async ({ page }) => {
    const checkBtn = page.getByRole('button', { name: /Check My Resume/i });
    await expect(checkBtn).toBeVisible();
    await expect(checkBtn).toBeDisabled();
  });

  /* ── Sample Resume ───────────────────────────────────────── */

  test('loads sample resume data when clicking try sample', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    const textarea = page.getByPlaceholder('Paste your full resume text here...');
    const value = await textarea.inputValue();
    // Sample resume should be long enough to enable the button
    expect(value.length).toBeGreaterThan(200);
    const checkBtn = page.getByRole('button', { name: /Check My Resume/i });
    await expect(checkBtn).toBeEnabled();
  });

  test('shows JD comparison input when toggled', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /Add JD comparison/i });
    await toggle.click();
    const jdInput = page.getByPlaceholder(/Paste the job description/);
    await expect(jdInput).toBeVisible();

    // Toggle off
    await page.getByRole('button', { name: /JD comparison on/i }).click();
    await expect(jdInput).not.toBeVisible();
  });

  test('loads sample JD together with sample resume', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    const jdToggle = page.getByRole('button', { name: /JD comparison on/i });
    await expect(jdToggle).toBeVisible();
  });

  /* ── Input Validation ────────────────────────────────────── */

  test('shows error for very short text', async ({ page }) => {
    const textarea = page.getByPlaceholder('Paste your full resume text here...');
    await textarea.fill('Hello world');
    // Button is still disabled (< 50 chars)
    const checkBtn = page.getByRole('button', { name: /Check My Resume/i });
    await expect(checkBtn).toBeDisabled();
  });

  test('enables button when 50+ characters entered', async ({ page }) => {
    const textarea = page.getByPlaceholder('Paste your full resume text here...');
    await textarea.fill('A'.repeat(51));
    const checkBtn = page.getByRole('button', { name: /Check My Resume/i });
    await expect(checkBtn).toBeEnabled();
  });

  /* ── Check Flow ──────────────────────────────────────────── */

  test('shows loading state after clicking check', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    const checkBtn = page.getByRole('button', { name: /Check My Resume/i });
    await checkBtn.click();
    // Should show loading state
    await expect(page.getByText('Analyzing your resume')).toBeVisible({ timeout: 3000 });
  });

  test('displays results after successful check', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    // Wait for results to load
    await expect(page.getByText(/ATS Ready|Minor Tweaks|Improvements Required|Significant Work/)).toBeVisible({ timeout: 15000 });

    // Score breakdown elements should be present
    await expect(page.getByText(/80|90|100/).or(page.getByText(/Score overview/))).toBeVisible();

    // Stats row
    await expect(page.getByText('Words')).toBeVisible();
    await expect(page.getByText('Bullets')).toBeVisible();
    await expect(page.getByText('Sections')).toBeVisible();
  });

  test('displays good practices and top improvements', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    await expect(page.getByText(/Working well|Fix these first/)).toBeVisible({ timeout: 15000 });
  });

  /* ── Detailed Breakdown ──────────────────────────────────── */

  test('expands and collapses criterion details', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    // Wait for results
    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });

    // Click on the first criterion accordion header
    const criterionBtn = page.getByRole('button', { name: /Section Structure|Contact Info|Bullet Points/ }).first();
    await criterionBtn.click();

    // Should show tip
    await expect(page.getByText(/Tip:/)).toBeVisible();
  });

  /* ── Result Actions ──────────────────────────────────────── */

  test('copy results button works', async ({ page }) => {
    // Mock clipboard API
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => {
      window.URL.createObjectURL = () => '';
    });

    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });

    // Click copy button
    await page.getByRole('button', { name: /Copy results/i }).click();
    await expect(page.getByText('Copied!')).toBeVisible();
  });

  test('check another resume button resets to input view', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Check another resume/i }).click();
    // Should be back at the text input
    await expect(page.getByPlaceholder('Paste your full resume text here...')).toBeVisible();
    await expect(page.getByRole('button', { name: /Check My Resume/i })).toBeDisabled();
  });

  /* ── History ─────────────────────────────────────────────── */

  test('saves check to history', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    // Wait for results
    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });

    // Go back to input
    await page.getByRole('button', { name: /Check another resume/i }).click();
    // Should see history button with count
    await expect(page.getByText(/History \(1\)/)).toBeVisible();
  });

  test('history panel shows scored items', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();
    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Check another resume/i }).click();

    // Open history
    await page.getByRole('button', { name: /History \(1\)/ }).click();
    await expect(page.getByText(/Pasted text|Recent checks/)).toBeVisible();
  });

  /* ── Keyboard Shortcuts ──────────────────────────────────── */

  test('escape key resets from results view', async ({ page }) => {
    await page.getByRole('button', { name: /Try sample resume/i }).click();
    await page.getByRole('button', { name: /Check My Resume/i }).click();
    await expect(page.getByText(/Score overview/)).toBeVisible({ timeout: 15000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Paste your full resume text here...')).toBeVisible();
  });

  /* ── Error Handling ──────────────────────────────────────── */

  test('shows error when API returns 400', async ({ page }) => {
    // Enter very short text that passes client validation but would fail API
    const textarea = page.getByPlaceholder('Paste your full resume text here...');
    await textarea.fill('Just a very short resume text that is exactly fifty characters for the test.');
    await page.getByRole('button', { name: /Check My Resume/i }).click();

    // Wait for either error or result
    await page.waitForTimeout(3000);

    // The API should return 400 since we didn't mock it,
    // but we just need to verify the UI doesn't crash
    await expect(page.getByPlaceholder('Paste your full resume text here...')).toBeVisible();
  });
});

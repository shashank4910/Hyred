/**
 * Upload a resume to Enhancv Resume Checker and capture the report UI/text.
 * Usage: node scripts/scrape-enhancv-checker.mjs "<path-to-pdf>"
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const resumePath = process.argv[2];
if (!resumePath || !fs.existsSync(resumePath)) {
  console.error('Resume not found:', resumePath);
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'tmp', 'enhancv-scrape');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});
const page = await context.newPage();

const networkLogs = [];
page.on('response', async (res) => {
  const url = res.url();
  if (!/enhancv|resume|check|score|upload|parse|api/i.test(url)) return;
  let bodyPreview = '';
  try {
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json')) {
      const text = await res.text();
      bodyPreview = text.slice(0, 4000);
    }
  } catch {}
  networkLogs.push({
    status: res.status(),
    url,
    bodyPreview,
  });
});

console.log('Opening Enhancv resume checker...');
await page.goto('https://enhancv.com/resources/resume-checker/', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, '01-landing.png'), fullPage: true });

// Accept cookies if present
for (const label of [/accept all/i, /agree/i, /got it/i, /allow all/i]) {
  const btn = page.getByRole('button', { name: label }).first();
  if (await btn.count()) {
    try {
      await btn.click({ timeout: 2000 });
    } catch {}
  }
}

const fileInput = page.locator('input[type="file"]').first();
if (!(await fileInput.count())) {
  // Try clicking upload CTA to reveal file input
  const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
  if (await uploadBtn.count()) await uploadBtn.click().catch(() => {});
  await page.waitForTimeout(1000);
}

const inputs = page.locator('input[type="file"]');
const n = await inputs.count();
console.log('file inputs:', n);
if (!n) {
  await page.screenshot({ path: path.join(outDir, '02-no-file-input.png'), fullPage: true });
  fs.writeFileSync(path.join(outDir, 'page.html'), await page.content());
  console.error('No file input found');
  await browser.close();
  process.exit(2);
}

console.log('Uploading', resumePath);
await inputs.first().setInputFiles(resumePath);

// Wait for navigation / report
await page.waitForTimeout(5000);
for (let i = 0; i < 40; i++) {
  const url = page.url();
  const text = await page.locator('body').innerText().catch(() => '');
  const ready =
    /score|ats|issues|improve|report|checks? passed|compatibility/i.test(text) &&
    !/drop your resume here/i.test(text.slice(0, 500));
  console.log(`tick ${i}: url=${url.slice(0, 120)} ready=${ready} textLen=${text.length}`);
  if (ready || /report|result|score|checker\/|analysis/i.test(url)) {
    break;
  }
  // email gate?
  if (/email/i.test(text) && await page.locator('input[type="email"]').count()) {
    console.log('Email gate detected');
    break;
  }
  await page.waitForTimeout(2000);
}

await page.screenshot({ path: path.join(outDir, '03-after-upload.png'), fullPage: true });
fs.writeFileSync(path.join(outDir, 'page-after-upload.html'), await page.content());
const bodyText = await page.locator('body').innerText();
fs.writeFileSync(path.join(outDir, 'body-after-upload.txt'), bodyText);
fs.writeFileSync(path.join(outDir, 'network.json'), JSON.stringify(networkLogs, null, 2));

// If email required, try continuing with a disposable-looking local email (may still gate)
const email = page.locator('input[type="email"]').first();
if (await email.count()) {
  console.log('Filling email gate...');
  await email.fill('hyred.research+enhancv@example.com');
  const cont = page.getByRole('button', { name: /continue|get|see|show|submit|check/i }).first();
  if (await cont.count()) await cont.click().catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(outDir, '04-after-email.png'), fullPage: true });
  fs.writeFileSync(path.join(outDir, 'body-after-email.txt'), await page.locator('body').innerText());
}

// Scroll report and capture more
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 800) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 200));
  }
});
await page.screenshot({ path: path.join(outDir, '05-full.png'), fullPage: true });
fs.writeFileSync(path.join(outDir, 'final-body.txt'), await page.locator('body').innerText());
fs.writeFileSync(path.join(outDir, 'final.html'), await page.content());
fs.writeFileSync(path.join(outDir, 'final-url.txt'), page.url());

console.log('Done. Output in', outDir);
await browser.close();

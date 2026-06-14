/**
 * Test: DOCX bullet point detection after the fix in resume.ts.
 *
 * Previously: mammoth.extractRawText() stripped all bullet markers, so
 * bullet points from DOCX files were invisible to findBulletLines().
 *
 * Fix: mammoth.convertToHtml() preserves list structure as <li> tags,
 * which are then converted to "- " prefixed lines in plain text.
 */

import mammoth from 'mammoth';
import path from 'path';
import fs from 'fs';
import { checkAtsCompatibility } from '../lib/ats-checker';

const DOCX_PATH = path.resolve(
  'node_modules/mammoth/test/test-data/simple-list.docx',
);

async function run() {
  console.log('='.repeat(60));
  console.log('📄 Testing DOCX bullet point detection');
  console.log(`File: ${DOCX_PATH}`);
  console.log('='.repeat(60));

  const buffer = fs.readFileSync(DOCX_PATH);

  // --- Old approach: extractRawText (no bullet markers) ---
  console.log('\n--- OLD APPROACH: extractRawText ---');
  const rawResult = await mammoth.extractRawText({ buffer });
  const rawText = rawResult.value ?? '';
  console.log('Raw text output:\n');
  console.log(rawText.slice(0, 500));
  const rawCheck = checkAtsCompatibility(rawText, 'simple-list.docx');
  console.log(`\nBullet count: ${rawCheck.stats.bulletCount}`);
  console.log(`Bullet score: ${rawCheck.breakdown.bulletQuality.score}/100`);
  console.log(`Bullet feedback: ${rawCheck.breakdown.bulletQuality.feedback}`);

  // --- New approach: convertToHtml + HTML-to-text (preserves bullets) ---
  console.log('\n--- NEW APPROACH: convertToHtml + HTML-to-text ---');
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value ?? '';
  console.log('Mammoth HTML (first 400 chars):\n');
  console.log(html.slice(0, 400));

  // Simulate what parseDocx does in resume.ts
  const resumeModule = await import('../lib/resume');
  
  // Replicate the logic from parseDocx + docxHtmlToPlainText
  const text = convertHtmlToText(html);
  console.log('\nConverted plain text:\n');
  console.log(text.slice(0, 500));

  // Check with ATS checker
  const newCheck = checkAtsCompatibility(text, 'simple-list.docx');
  console.log(`\nBullet count: ${newCheck.stats.bulletCount}`);
  console.log(`Bullet score: ${newCheck.breakdown.bulletQuality.score}/100`);
  console.log(`Bullet feedback: ${newCheck.breakdown.bulletQuality.feedback}`);

  // --- Also test the full parseResume pipeline ---
  console.log('\n--- FULL PIPELINE: parseResume ---');
  const parsed = await resumeModule.parseResume({
    buffer,
    filename: 'simple-list.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  console.log('Parsed text (first 500 chars):\n');
  console.log(parsed.slice(0, 500));
  const pipelineCheck = checkAtsCompatibility(parsed, 'simple-list.docx');
  console.log(`\nBullet count: ${pipelineCheck.stats.bulletCount}`);
  console.log(`Bullet score: ${pipelineCheck.breakdown.bulletQuality.score}/100`);
  console.log(`Bullet feedback: ${pipelineCheck.breakdown.bulletQuality.feedback}`);

  // --- Results ---
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Old (extractRawText):     bullets=${rawCheck.stats.bulletCount}, score=${rawCheck.breakdown.bulletQuality.score}`);
  console.log(`New (convertToHtml):      bullets=${newCheck.stats.bulletCount}, score=${newCheck.breakdown.bulletQuality.score}`);
  console.log(`Pipeline (parseResume):   bullets=${pipelineCheck.stats.bulletCount}, score=${pipelineCheck.breakdown.bulletQuality.score}`);

  if (newCheck.stats.bulletCount > 0) {
    console.log('\n✅ PASS: Bullet points detected after fix!');
  } else {
    console.log('\n❌ FAIL: No bullet points detected — fix not working.');
  }

  if (newCheck.stats.bulletCount > rawCheck.stats.bulletCount) {
    console.log('✅ PASS: New approach detects MORE bullets than old approach.');
  } else if (newCheck.stats.bulletCount === rawCheck.stats.bulletCount && newCheck.stats.bulletCount === 0) {
    console.log('❌ FAIL: Both approaches detect 0 bullets.');
  }
}

/**
 * Replicate the docxHtmlToPlainText logic from resume.ts for testing.
 */
function convertHtmlToText(html: string): string {
  let text = html;

  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  return text.trim();
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

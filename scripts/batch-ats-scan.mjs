/**
 * Batch ATS Scanner — copies resume files from Downloads/resumes26,
 * parses them via the same engine as the live API, runs checkAtsCompatibility,
 * and outputs structured results for analysis.
 *
 * Usage: node scripts/batch-ats-scan.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Source directory
const RESUME_DIR = path.resolve(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'resumes26');
const OUTPUT_FILE = path.join(projectRoot, 'batch-ats-results.json');

// Use project's lib via relative paths (since tsx resolves @/ aliases)
// But since this is .mjs, we'll use direct file paths instead
async function main() {
  if (!fs.existsSync(RESUME_DIR)) {
    console.error(`Resume directory not found: ${RESUME_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(RESUME_DIR).filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.txt');
  });

  console.log(`\n Found ${files.length} resume files in ${RESUME_DIR}\n`);

  const results = [];

  for (const file of files) {
    const filePath = path.join(RESUME_DIR, file);
    const stat = fs.statSync(filePath);
    const sizeKb = (stat.size / 1024).toFixed(1);

    process.stdout.write(`  Scanning: ${file} (${sizeKb} KB)... `);

    try {
      const buffer = fs.readFileSync(filePath);
      const { parseResume } = await import('../lib/resume.ts');
      const resumeText = await parseResume({ buffer, filename: file, mimeType: '' });
      process.stdout.write(`parsed ${resumeText.length} chars... `);

      const { checkAtsCompatibility, extractKeywords } = await import('../lib/ats-checker.ts');
      const atsResult = checkAtsCompatibility(resumeText, file);
      const keywords = extractKeywords(resumeText);

      results.push({
        filename: file,
        sizeKb: parseFloat(sizeKb),
        chars: resumeText.length,
        overallScore: atsResult.overallScore,
        breakdown: {
          sectionStructure: atsResult.breakdown.sectionStructure.score,
          contactInfo: atsResult.breakdown.contactInfo.score,
          bulletQuality: atsResult.breakdown.bulletQuality.score,
          quantifiableAchievements: atsResult.breakdown.quantifiableAchievements.score,
          skillsOptimization: atsResult.breakdown.skillsOptimization.score,
          lengthReadability: atsResult.breakdown.lengthReadability.score,
          formatCleanliness: atsResult.breakdown.formatCleanliness.score,
          dateConsistency: atsResult.breakdown.dateConsistency.score,
        },
        topImprovements: atsResult.topImprovements,
        goodPractices: atsResult.goodPractices.slice(0, 3),
        stats: atsResult.stats,
        keywordsFound: keywords.length,
        fileHints: atsResult.fileHints,
      });
      process.stdout.write(`score: ${atsResult.overallScore}/100\n`);
    } catch (err) {
      process.stdout.write(`ERROR: ${(err as Error).message.slice(0, 100)}\n`);
      results.push({ filename: file, error: (err as Error).message.slice(0, 200) });
    }
  }

  results.sort((a: any, b: any) => (a.overallScore ?? 999) - (b.overallScore ?? 999));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n Detailed results: ${OUTPUT_FILE}`);

  console.log('\n' + '='.repeat(100));
  console.log('BATCH ATS SCAN SUMMARY');
  console.log('='.repeat(100));
  console.log();
  console.log('  #  | Score | File');
  console.log('  ' + '-'.repeat(90));

  (results as any[]).forEach((r: any, i: number) => {
    const s = r.overallScore !== undefined ? String(r.overallScore).padStart(3) : 'ERR';
    const icon = r.overallScore >= 80 ? 'G' : r.overallScore >= 50 ? 'Y' : 'R';
    const err = r.error ? ` -- ${r.error}` : '';
    console.log(`  ${String(i + 1).padStart(2)} | ${icon} ${s}  | ${r.filename}${err}`);
  });

  const scored = results.filter((r: any) => r.overallScore !== undefined);
  if (scored.length > 0) {
    const avg = scored.reduce((s: number, r: any) => s + r.overallScore, 0) / scored.length;
    const scores = scored.map((r: any) => r.overallScore).sort((a: number, b: number) => a - b);
    console.log(`\n  Total: ${results.length} | Scored: ${scored.length} | Failed: ${results.length - scored.length}`);
    console.log(`  Range: ${scores[0]} -- ${scores[scores.length - 1]} | Avg: ${avg.toFixed(1)} | Median: ${scores[Math.floor(scores.length / 2)]}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

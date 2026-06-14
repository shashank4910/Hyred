/**
 * Batch ATS Scanner — scans all resumes in Downloads/resumes26 folder
 * Usage: npx tsx scripts/batch-ats-scan.ts
 */
import fs from 'fs';
import path from 'path';
import { parseResume } from '../lib/resume';
import { checkAtsCompatibility, extractKeywords } from '../lib/ats-checker';
import type { AtsCheckResult } from '../lib/ats-checker';

const RESUME_DIR = path.resolve(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\Admin', 'Downloads', 'resumes26');
const OUTPUT_FILE = path.resolve(__dirname, '..', 'batch-ats-results.json');

interface ScanResult {
  filename: string;
  sizeKb?: number;
  chars?: number;
  overallScore?: number;
  breakdown?: Record<string, number>;
  topImprovements?: string[];
  goodPractices?: string[];
  stats?: { wordCount: number; charCount: number; bulletCount: number; sectionCount: number };
  keywordsFound?: number;
  fileHints?: { extension: string; isPdf: boolean; isDocx: boolean; isTxt: boolean; mightBeScanned: boolean };
  error?: string;
}

async function main() {
  if (!fs.existsSync(RESUME_DIR)) {
    console.error(`Resume directory not found: ${RESUME_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(RESUME_DIR).filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith('.pdf') || lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.txt');
  });

  console.log(`\n Found ${files.length} resume files\n`);

  const results: ScanResult[] = [];

  for (const file of files) {
    const filePath = path.join(RESUME_DIR, file);
    const stat = fs.statSync(filePath);
    const sizeKb = (stat.size / 1024).toFixed(1);

    process.stdout.write(`  ${file} (${sizeKb} KB)... `);

    try {
      const buffer = fs.readFileSync(filePath);
      const resumeText = await parseResume({ buffer, filename: file, mimeType: '' });
      process.stdout.write(`${resumeText.length} chars... `);

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
    } catch (err: any) {
      process.stdout.write(`ERROR: ${(err.message || err).slice(0, 100)}\n`);
      results.push({ filename: file, error: (err.message || err).slice(0, 200) });
    }
  }

  results.sort((a, b) => (a.overallScore ?? 999) - (b.overallScore ?? 999));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n Detailed results: ${OUTPUT_FILE}`);

  console.log('\n' + '='.repeat(100));
  console.log('BATCH ATS SCAN SUMMARY');
  console.log('='.repeat(100));
  console.log('\n  #  | Score | File');
  console.log('  ' + '-'.repeat(90));

  results.forEach((r, i) => {
    const s = r.overallScore !== undefined ? String(r.overallScore).padStart(3) : 'ERR';
    const icon = r.overallScore !== undefined ? (r.overallScore >= 80 ? 'G' : r.overallScore >= 50 ? 'Y' : 'R') : 'X';
    const err = r.error ? `  -- ${r.error}` : '';
    console.log(`  ${String(i + 1).padStart(2)} | ${icon} ${s}  | ${r.filename}${err}`);
  });

  const scored = results.filter(r => r.overallScore !== undefined);
  if (scored.length > 0) {
    const avg = scored.reduce((s, r) => s + r.overallScore!, 0) / scored.length;
    const scores = scored.map(r => r.overallScore!).sort((a, b) => a - b);
    const median = scores[Math.floor(scores.length / 2)];
    console.log(`\n  Total: ${results.length} | Scored: ${scored.length} | Failed: ${results.length - scored.length}`);
    console.log(`  Range: ${scores[0]} - ${scores[scores.length - 1]} | Avg: ${avg.toFixed(1)} | Median: ${median}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

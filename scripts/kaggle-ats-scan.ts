/**
 * Kaggle Resume Dataset — Batch ATS Scan & Analysis
 *
 * Reads the CSV dataset, parses it properly (handling quoted fields),
 * runs every resume through checkAtsCompatibility, and produces:
 *   1. Per-resume detailed results JSON
 *   2. Category-level statistics
 *   3. Distribution analysis (score buckets)
 *   4. Anomaly detection (low/high outliers)
 *
 * Usage: npx tsx scripts/kaggle-ats-scan.ts
 */
import fs from 'fs';
import path from 'path';
import { checkAtsCompatibility } from '../lib/ats-checker';

const CSV_PATH = path.resolve(__dirname, '..', 'resume_dataset.csv');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'kaggle-ats-results.json');
const STATS_PATH = path.resolve(__dirname, '..', 'kaggle-ats-stats.json');

interface ScanEntry {
  index: number;
  category: string;
  resumeLength: number;
  overallScore: number;
  breakdown: Record<string, number>;
  topIssues: string[];
  goodPoints: string[];
  stats: { wordCount: number; bulletCount: number; sectionCount: number };
}

interface CategoryStats {
  count: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  scores: number[];
  avgBreakdown: Record<string, number>;
}

/**
 * Parse CSV properly — handles quoted fields with commas and newlines.
 */
function parseCsv(text: string): Array<{ category: string; resume: string }> {
  const results: Array<{ category: string; resume: string }> = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] ?? '';

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field.trim());
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        current.push(field.trim());
        field = '';
        if (ch === '\r') i++; // skip \r in \r\n
        if (current.length >= 2) {
          results.push({ category: current[0], resume: current.slice(1).join(',') });
        }
        current = [];
      } else {
        field += ch;
      }
    }
  }
  // Last line
  if (field.trim() || current.length > 0) {
    current.push(field.trim());
    if (current.length >= 2) {
      results.push({ category: current[0], resume: current.slice(1).join(',') });
    }
  }

  return results;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log('Reading CSV...');
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const entries = parseCsv(raw);

  // Skip header row
  const data = entries.slice(1).filter(e => e.resume.trim().length > 50);
  console.log(`\nFound ${data.length} valid resumes (after filtering short entries)\n`);

  // Run all through ATS checker
  const results: ScanEntry[] = [];
  const errors: Array<{ index: number; category: string; error: string }> = [];

  data.forEach((entry, i) => {
    const pct = ((i + 1) / data.length * 100).toFixed(0);
    process.stdout.write(`\r  Processing: ${i + 1}/${data.length} (${pct}%) — ${entry.category.slice(0, 30)}`);

    try {
      const atsResult = checkAtsCompatibility(entry.resume, 'kaggle-resume.txt');

      results.push({
        index: i,
        category: entry.category,
        resumeLength: entry.resume.length,
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
        topIssues: atsResult.topImprovements.slice(0, 3),
        goodPoints: atsResult.goodPractices.slice(0, 3),
        stats: atsResult.stats,
      });
    } catch (err: any) {
      errors.push({ index: i, category: entry.category, error: (err.message || '').slice(0, 100) });
    }
  });

  console.log('\n');

  // ── Compute category-level stats ──
  const catMap = new Map<string, CategoryStats>();

  for (const r of results) {
    const cat = r.category || 'Uncategorized';
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        count: 0,
        avgScore: 0,
        minScore: 100,
        maxScore: 0,
        scores: [],
        avgBreakdown: {
          sectionStructure: 0,
          contactInfo: 0,
          bulletQuality: 0,
          quantifiableAchievements: 0,
          skillsOptimization: 0,
          lengthReadability: 0,
          formatCleanliness: 0,
          dateConsistency: 0,
        },
      });
    }
    const s = catMap.get(cat)!;
    s.count++;
    s.scores.push(r.overallScore);
    s.minScore = Math.min(s.minScore, r.overallScore);
    s.maxScore = Math.max(s.maxScore, r.overallScore);
    for (const key of Object.keys(s.avgBreakdown)) {
      s.avgBreakdown[key] += (r.breakdown as any)[key] || 0;
    }
  }

  // Compute averages
  for (const [cat, s] of catMap) {
    if (s.count >= 3) {
      s.avgScore = Math.round(s.scores.reduce((a, b) => a + b, 0) / s.count);
      for (const key of Object.keys(s.avgBreakdown)) {
        s.avgBreakdown[key] = Math.round(s.avgBreakdown[key] / s.count);
      }
    }
  }

  // ── Overall distribution ──
  const allScores = results.map(r => r.overallScore);
  const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  allScores.sort((a, b) => a - b);
  const median = allScores[Math.floor(allScores.length / 2)];
  const min = allScores[0];
  const max = allScores[allScores.length - 1];

  // Score buckets
  const buckets = { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80-89': 0, '90-100': 0 };
  for (const s of allScores) {
    if (s < 20) buckets['0-19']++;
    else if (s < 40) buckets['20-39']++;
    else if (s < 60) buckets['40-59']++;
    else if (s < 80) buckets['60-79']++;
    else if (s < 90) buckets['80-89']++;
    else buckets['90-100']++;
  }

  // ── Output ──
  const stats = {
    totalResumes: results.length,
    errors: errors.length,
    overallStats: {
      average: Math.round(avg * 10) / 10,
      median,
      min,
      max,
    },
    scoreDistribution: buckets,
    categoryStats: Object.fromEntries(
      [...catMap.entries()]
        .filter(([_, s]) => s.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([cat, s]) => [cat, {
          count: s.count,
          avgScore: s.avgScore,
          minScore: s.minScore,
          maxScore: s.maxScore,
          avgBreakdown: s.avgBreakdown,
        }])
    ),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

  // ── Print report ──
  console.log('='.repeat(90));
  console.log('KAGGLE DATASET — ATS SCORING ANALYSIS');
  console.log('='.repeat(90));
  console.log(`\nTotal resumes scanned: ${results.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`\nOverall scores:`);
  console.log(`  Average: ${Math.round(avg * 10) / 10}`);
  console.log(`  Median:  ${median}`);
  console.log(`  Range:   ${min} – ${max}`);
  console.log(`\nScore distribution:`);
  for (const [bucket, count] of Object.entries(buckets)) {
    const bar = '█'.repeat(Math.round(count / results.length * 100));
    console.log(`  ${bucket}: ${String(count).padStart(4)} ${bar}`);
  }

  console.log(`\n\nCategory breakdown (sorted by count):`);
  console.log(`  ${'Category'.padEnd(30)} Count  Avg  Min  Max  Low-Criteria`);
  console.log(`  ${'-'.repeat(80)}`);

  const sortedCatStats = [...catMap.entries()]
    .filter(([_, s]) => s.count >= 3)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [cat, s] of sortedCatStats) {
    // Find the lowest avg criterion
    const lowest = Object.entries(s.avgBreakdown)
      .sort((a, b) => a[1] - b[1])[0];
    const lowestStr = lowest ? `${lowest[0]}:${lowest[1]}` : '';
    console.log(`  ${cat.padEnd(30)} ${String(s.count).padStart(4)}  ${String(s.avgScore).padStart(3)}  ${String(s.minScore).padStart(3)}  ${String(s.maxScore).padStart(3)}  ${lowestStr}`);
  }

  // ── Anomaly detection ──
  console.log(`\n\nScore anomalies (lowest 10 scoring resumes):`);
  results.sort((a, b) => a.overallScore - b.overallScore).slice(0, 10).forEach(r => {
    console.log(`  Score ${String(r.overallScore).padStart(2)} | ${r.category.slice(0, 35).padEnd(35)} | words:${r.stats.wordCount} bullets:${r.stats.bulletCount} sections:${r.stats.sectionCount}`);
  });

  console.log(`\nScore anomalies (highest 10 scoring resumes):`);
  results.sort((a, b) => b.overallScore - a.overallScore).slice(0, 10).forEach(r => {
    console.log(`  Score ${String(r.overallScore).padStart(2)} | ${r.category.slice(0, 35).padEnd(35)} | words:${r.stats.wordCount} bullets:${r.stats.bulletCount} sections:${r.stats.sectionCount}`);
  });

  console.log(`\n\n📊 Full results: ${OUTPUT_PATH}`);
  console.log(`📊 Category stats: ${STATS_PATH}`);
}

main();

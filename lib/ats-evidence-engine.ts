/**
 * Evidence-grounded ATS orchestrator.
 * Layer A (facts) + Layer B (semantic LLM) → Layer C (gate) → AtsReport.
 */

import {
  checkAtsCompatibility,
  type AtsCheckResult,
} from './ats-checker';
import { buildFactChecks } from './ats-fact-checks';
import { gateAtsChecks } from './ats-consistency';
import { parseResumeStructure } from './ats-resume-parse';
import { runSemanticReview } from './ats-semantic-review';
import {
  buildAtsReport,
  type AtsReport,
  type AtsReportCategory,
  type AtsReportCheck,
  type AtsReportCategoryId,
} from './ats-report';
import type { chat } from './gemini';

export type AtsEngineMode = 'structural' | 'hybrid';

export interface EvidenceAtsResult {
  engine: AtsEngineMode;
  /** Legacy score payload (Fix Studio, history, public widget) */
  result: AtsCheckResult;
  /** Gated Enhancv-style report (preferred by AtsScanReport when present) */
  report: AtsReport;
  resumeText: string;
}

export interface RunEvidenceAtsOptions {
  filename?: string;
  jobDescription?: string;
  profileId?: string;
  /** structural = zero LLM (public); hybrid = facts + semantic LLM (logged-in) */
  mode?: AtsEngineMode;
  chatFn?: typeof chat;
  /** Inject semantic checks in tests without calling LLM */
  semanticChecks?: AtsReportCheck[];
}

function avg(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function scoreOf(check: AtsReportCheck): number {
  if (typeof check.score === 'number') return check.score;
  if (check.status === 'pass') return 88;
  if (check.status === 'warn') return 58;
  if (check.status === 'fail') return 28;
  return 0;
}

function issueCount(checks: AtsReportCheck[]): number {
  return checks.filter((c) => c.status === 'fail' || c.status === 'warn').length;
}

function pick(
  checks: AtsReportCheck[],
  ids: string[],
): AtsReportCheck[] {
  const set = new Set(ids);
  return checks.filter((c) => set.has(c.id));
}

function category(
  id: AtsReportCategoryId,
  label: string,
  checks: AtsReportCheck[],
  tier: 'free' | 'premium' = 'free',
): AtsReportCategory {
  return {
    id,
    label,
    tier,
    score: avg(checks.map(scoreOf)),
    locked: false,
    issueCount: issueCount(checks),
    checks,
  };
}

/**
 * Assemble gated checks into AtsReport categories.
 */
export function assembleEvidenceReport(
  gated: AtsReportCheck[],
  legacy: AtsCheckResult,
  resumeText: string,
  opts: { isPremium?: boolean } = {},
): AtsReport {
  const content = pick(gated, [
    'fact-parse',
    'semantic-impact',
    'semantic-repetition',
    'semantic-spelling',
    'semantic-vague',
    'fact-bullets',
    'semantic-skills',
    'semantic-verbs',
    'semantic-template',
    'semantic-truncated',
  ]);
  const contentIds = new Set(content.map((c) => c.id));
  for (const id of ['fact-parse', 'fact-bullets'] as const) {
    if (!contentIds.has(id)) {
      const fallback = gated.find((c) => c.id === id);
      if (fallback) content.unshift(fallback);
    }
  }

  // Ensure quantify/skills placeholders if semantic omitted (from facts we don't have them —
  // leave as-is; semantic should supply when hybrid)

  const sections = pick(gated, ['fact-sections', 'fact-contact']);
  const ats = pick(gated, ['fact-file', 'fact-format', 'fact-dates', 'fact-length']);

  const structural = buildAtsReport(legacy, resumeText, {
    isPremium: Boolean(opts.isPremium),
  });
  const premium = structural.categories.filter((c) => c.tier === 'premium');

  const jdCheck = gated.find((c) => c.id === 'semantic-jd');
  if (jdCheck) {
    const tailor = premium.find((c) => c.id === 'tailoring');
    if (tailor && !tailor.locked) {
      tailor.checks = [
        jdCheck,
        ...tailor.checks.filter((c) => c.id !== 'tailor-hard' && c.id !== 'tailor-teaser'),
      ];
      tailor.issueCount = issueCount(tailor.checks);
      tailor.score = avg(tailor.checks.map(scoreOf));
    }
  }

  const categories: AtsReportCategory[] = [
    category('content', 'Content', content),
    category('sections', 'Sections', sections),
    category('ats_essentials', 'ATS Essentials', ats),
    ...premium,
  ];

  const freeIssues = categories
    .filter((c) => !c.locked)
    .reduce((n, c) => n + c.issueCount, 0);

  const parseCheck = gated.find((c) => c.id === 'fact-parse');
  const parseRate =
    typeof parseCheck?.score === 'number'
      ? parseCheck.score
      : legacy.parseQuality === 'good'
        ? 93
        : 50;

  const freeScores = categories
    .filter((c) => c.tier === 'free' && c.score != null)
    .map((c) => c.score as number);
  const gatedOverall = freeScores.length
    ? Math.round(avg(freeScores) * 0.7 + legacy.overallScore * 0.3)
    : legacy.overallScore;

  return {
    overallScore: Math.max(0, Math.min(100, gatedOverall)),
    issueCount: freeIssues,
    parseRatePercent: parseRate,
    categories,
  };
}

/**
 * Sync structural path: existing zero-LLM engine + consistency gate on report checks.
 */
export function runStructuralAts(
  resumeText: string,
  opts: { filename?: string; jobDescription?: string } = {},
): EvidenceAtsResult {
  const result = checkAtsCompatibility(
    resumeText,
    opts.filename,
    opts.jobDescription,
  );
  const parsed = parseResumeStructure(resumeText);
  const facts = buildFactChecks(parsed, result);
  // Also fold legacy report semantic-ish checks through gate after stripping
  // dictionary spelling/repetition from buildAtsReport — use facts-first merge.
  const legacyReport = buildAtsReport(result, parsed.text, { isPremium: false });
  const legacyFreeChecks = legacyReport.categories
    .filter((c) => !c.locked)
    .flatMap((c) => c.checks)
    // Drop dictionary-era checks we replaced with facts / hybrid semantics
    .filter(
      (c) =>
        ![
          'content-spelling',
          'content-repetition',
          'content-quantify',
          'content-bullets',
          'content-skills',
          'content-parse',
          'sec-essential',
          'sec-contact',
          'ats-format',
          'ats-dates',
          'ats-length',
          'ats-file',
        ].includes(c.id),
    );

  const gated = gateAtsChecks([...facts, ...legacyFreeChecks], parsed.text);
  const report = assembleEvidenceReport(gated, result, parsed.text, {
    isPremium: false,
  });
  // Keep overallScore aligned with legacy for public widget continuity
  report.overallScore = result.overallScore;

  return {
    engine: 'structural',
    result: { ...result, overallScore: result.overallScore },
    report,
    resumeText: parsed.text,
  };
}

/**
 * Hybrid path: facts + semantic LLM + gate.
 */
export async function runEvidenceGroundedAts(
  resumeText: string,
  opts: RunEvidenceAtsOptions = {},
): Promise<EvidenceAtsResult> {
  const mode: AtsEngineMode = opts.mode ?? 'hybrid';
  if (mode === 'structural') {
    return runStructuralAts(resumeText, opts);
  }

  const result = checkAtsCompatibility(
    resumeText,
    opts.filename,
    opts.jobDescription,
  );
  const parsed = parseResumeStructure(resumeText);
  const facts = buildFactChecks(parsed, result);

  const semantic =
    opts.semanticChecks ??
    (await runSemanticReview(parsed.text, {
      jobDescription: opts.jobDescription,
      profileId: opts.profileId,
      chatFn: opts.chatFn,
    }));

  const gated = gateAtsChecks([...facts, ...semantic], parsed.text);
  const report = assembleEvidenceReport(gated, result, parsed.text, {
    isPremium: true,
  });

  const hybridResult: AtsCheckResult = {
    ...result,
    overallScore: report.overallScore,
  };

  return {
    engine: 'hybrid',
    result: hybridResult,
    report,
    resumeText: parsed.text,
  };
}

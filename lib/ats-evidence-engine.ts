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

function mentionsInvolved(check: AtsReportCheck): boolean {
  const blob = [
    check.detail,
    ...(check.quotes ?? []).map((q) => q.text),
    ...(check.repetitions ?? []).map((r) => r.word),
  ]
    .join(' ')
    .toLowerCase();
  return /\binvolved\b/.test(blob);
}

/**
 * When several Content cards all hammer the same “Involved in” filler,
 * keep the strongest angles (repetition + impact) and drop the rest.
 */
export function dedupeContentChecks(checks: AtsReportCheck[]): AtsReportCheck[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const repetition = byId.get('semantic-repetition');
  const impact = byId.get('semantic-impact');
  const repetitionHits =
    repetition != null &&
    (repetition.status === 'fail' || repetition.status === 'warn') &&
    mentionsInvolved(repetition);
  const impactHits =
    impact != null &&
    (impact.status === 'fail' || impact.status === 'warn') &&
    mentionsInvolved(impact);

  if (repetitionHits || impactHits) {
    for (const id of ['semantic-vague', 'semantic-verbs'] as const) {
      const c = byId.get(id);
      if (c && (c.status === 'fail' || c.status === 'warn') && mentionsInvolved(c)) {
        byId.delete(id);
      }
    }
  }

  // Prefer semantic-repetition over a thin bullets warn that only echoes “involved”
  if (repetitionHits) {
    const bullets = byId.get('fact-bullets');
    if (
      bullets &&
      (bullets.status === 'fail' || bullets.status === 'warn') &&
      mentionsInvolved(bullets) &&
      (bullets.quotes?.length ?? 0) === 0
    ) {
      byId.delete('fact-bullets');
    }
  }

  return checks.filter((c) => byId.has(c.id));
}

/**
 * Align premium heuristic cards with gated semantic facts so the report
 * does not contradict itself (e.g. Skills pass + Seniority “only 2 skills”).
 */
export function reconcilePremiumWithGated(
  premium: AtsReportCategory[],
  gated: AtsReportCheck[],
): void {
  const skills = gated.find((c) => c.id === 'semantic-skills');
  const impact = gated.find((c) => c.id === 'semantic-impact');
  const repetition = gated.find((c) => c.id === 'semantic-repetition');
  const vague = gated.find((c) => c.id === 'semantic-vague');
  const fillerFail =
    (repetition != null &&
      (repetition.status === 'fail' || repetition.status === 'warn') &&
      mentionsInvolved(repetition)) ||
    (vague != null &&
      (vague.status === 'fail' || vague.status === 'warn') &&
      mentionsInvolved(vague));

  for (const cat of premium) {
    cat.checks = cat.checks.map((check) => {
      if (check.id === 'sen-skill-evidence' && skills?.status === 'pass') {
        const skillLabels = (skills.foundItems ?? [])
          .filter((f) => f.ok)
          .map((f) => f.label)
          .slice(0, 6);
        return {
          ...check,
          status: 'pass' as const,
          summary: 'No issues',
          score: typeof skills.score === 'number' ? skills.score : 88,
          detail:
            skillLabels.length > 0
              ? `Concrete skills show up in your resume: ${skillLabels.join(', ')}.`
              : skills.detail ||
                'Concrete technical skills show up in your resume (same as Content → Skills).',
          foundItems: skills.foundItems,
          emptyHint: null,
        };
      }

      if (check.id === 'hr-credibility' && fillerFail && check.status === 'pass') {
        const source =
          repetition &&
          (repetition.status === 'fail' || repetition.status === 'warn') &&
          mentionsInvolved(repetition)
            ? repetition
            : vague;
        if (!source) return check;
        return {
          ...check,
          status: source.status === 'fail' ? ('fail' as const) : ('warn' as const),
          summary: source.status === 'fail' ? '1 issue' : '1 tip',
          detail:
            source.detail ||
            'Duty filler (“involved in”) weakens credibility — swap for outcomes.',
          quotes: source.quotes?.slice(0, 2) ?? check.quotes,
          repetitions: source.repetitions ?? check.repetitions,
        };
      }

      if (
        check.id === 'hr-interview' &&
        impact &&
        (impact.status === 'fail' || impact.status === 'warn')
      ) {
        return {
          ...check,
          status: 'warn' as const,
          summary: '1 tip',
          detail:
            check.detail ||
            'Thin metrics invite hard interview follow-ups. Add numbers recruiters can probe.',
          quotes: impact.quotes?.slice(0, 2) ?? check.quotes,
          emptyHint: null,
        };
      }

      // Action Verbs in Tailoring overlaps Content repetition when “involved” dominates
      if (
        check.id === 'tailor-verbs' &&
        fillerFail &&
        (check.status === 'fail' || check.status === 'warn')
      ) {
        return {
          ...check,
          status: 'warn' as const,
          summary: 'See Content → Repetition',
          detail:
            'Duty fillers like “involved in” crowd out strong verbs. Fix that first — then lead with built / validated / delivered.',
          quotes: repetition?.quotes?.slice(0, 1) ?? check.quotes,
          emptyHint: null,
        };
      }

      return check;
    });
    cat.issueCount = issueCount(cat.checks);
    cat.score = avg(cat.checks.map(scoreOf));
  }
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
  const content = dedupeContentChecks(
    pick(gated, [
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
    ]),
  );
  const contentIds = new Set(content.map((c) => c.id));
  for (const id of ['fact-parse', 'fact-bullets'] as const) {
    if (!contentIds.has(id)) {
      const fallback = gated.find((c) => c.id === id);
      if (fallback && !content.some((c) => c.id === id)) {
        // Only re-add bullets if dedupe did not intentionally drop them
        if (id === 'fact-bullets') {
          const repetition = gated.find((c) => c.id === 'semantic-repetition');
          if (
            repetition &&
            (repetition.status === 'fail' || repetition.status === 'warn') &&
            mentionsInvolved(repetition) &&
            mentionsInvolved(fallback) &&
            (fallback.quotes?.length ?? 0) === 0
          ) {
            continue;
          }
        }
        content.unshift(fallback);
      }
    }
  }

  const sections = pick(gated, ['fact-sections', 'fact-contact']);
  const ats = pick(gated, ['fact-file', 'fact-format', 'fact-dates', 'fact-length']);

  const structural = buildAtsReport(legacy, resumeText, {
    isPremium: Boolean(opts.isPremium),
  });
  const premium = structural.categories.filter((c) => c.tier === 'premium');
  reconcilePremiumWithGated(premium, gated);

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

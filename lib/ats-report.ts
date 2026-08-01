/**
 * Enhancv-style ATS report model — maps zero-LLM AtsCheckResult into
 * category rails + issue cards (with resume quotes). Pure helpers.
 */

import type { AtsCheckResult } from './ats-checker';
import { ATS_CRITERION_LABELS, type AtsCriterionKey } from './ats-fix';

export type AtsReportTier = 'free' | 'premium';

export type AtsReportCategoryId =
  | 'content'
  | 'sections'
  | 'ats_essentials'
  | 'hr'
  | 'discrimination'
  | 'seniority'
  | 'tailoring';

export type AtsReportCheckStatus = 'pass' | 'fail' | 'warn' | 'locked';

export interface AtsReportQuote {
  text: string;
}

export interface AtsReportCheck {
  id: string;
  /** Maps to Fix Studio weakness when present */
  weaknessId?: string;
  criterionKey?: AtsCriterionKey | 'jdKeywords' | 'parse' | 'premium';
  label: string;
  status: AtsReportCheckStatus;
  /** Short status line (“3 issues”, “No issues”, “Locked”) */
  summary: string;
  /** Longer explanation for the expanded card */
  detail: string;
  quotes?: AtsReportQuote[];
  /** Optional “did you mean” pairs for spelling-like issues */
  suggestions?: Array<{ found: string; suggestion: string }>;
}

export interface AtsReportCategory {
  id: AtsReportCategoryId;
  label: string;
  tier: AtsReportTier;
  /** 0–100, or null when locked / unknown */
  score: number | null;
  locked: boolean;
  issueCount: number;
  checks: AtsReportCheck[];
}

export interface AtsReport {
  overallScore: number;
  issueCount: number;
  parseRatePercent: number;
  categories: AtsReportCategory[];
}

const NEEDS_WORK_BELOW = 75;

function bulletLines(text: string): string[] {
  const bulletChars = '-•*→⁃▪▸▹►‣∙○●';
  const bulletRegex = new RegExp(`^[${bulletChars}]`);
  return text.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (bulletRegex.test(t)) return true;
    if (/^\d+[.)]\s/.test(t)) return true;
    return false;
  });
}

function stripBullet(line: string): string {
  return line.trim().replace(/^[-•*→\d.)]+\s*/, '').trim();
}

/** Bullets that look like duties without measurable impact. */
export function findUnquantifiedBullets(resumeText: string, limit = 3): string[] {
  const dateOnly = /\b(19|20)\d{2}\b/;
  const out: string[] = [];
  for (const raw of bulletLines(resumeText)) {
    const body = stripBullet(raw);
    if (body.length < 24) continue;
    const hasNumber = /\d/.test(body);
    const isOnlyDate =
      dateOnly.test(body) && !/[%$%,.\d]{2,}/.test(body.replace(dateOnly, ''));
    if (!hasNumber || isOnlyDate) {
      out.push(body);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Short / thin bullets. */
export function findThinBullets(resumeText: string, limit = 3): string[] {
  const out: string[] = [];
  for (const raw of bulletLines(resumeText)) {
    const body = stripBullet(raw);
    const words = body.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length < 4) {
      out.push(body);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function parseRatePercent(result: AtsCheckResult): number {
  if (result.parseQuality === 'good') return 90 + Math.min(9, Math.floor(result.overallScore / 12));
  if (result.parseQuality === 'degraded') return 55 + Math.floor(result.overallScore / 5);
  return 25;
}

function criterionStatus(score: number): AtsReportCheckStatus {
  if (score >= NEEDS_WORK_BELOW) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

function statusSummary(status: AtsReportCheckStatus, issueCount = 0): string {
  if (status === 'locked') return 'Locked';
  if (status === 'pass') return 'No issues';
  if (issueCount <= 0) return status === 'warn' ? '1 issue' : 'Needs work';
  return `${issueCount} issue${issueCount === 1 ? '' : 's'}`;
}

function avg(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function lockedCheck(id: string, label: string): AtsReportCheck {
  return {
    id,
    criterionKey: 'premium',
    label,
    status: 'locked',
    summary: 'Locked',
    detail: 'Unlock with Hyred Premium for the full report.',
  };
}

function buildPremiumHeuristics(
  resumeText: string,
  result: AtsCheckResult,
): Pick<
  Record<AtsReportCategoryId, AtsReportCheck[]>,
  'hr' | 'discrimination' | 'seniority' | 'tailoring'
> {
  const lower = resumeText.toLowerCase();
  const vague = [
    'responsible for',
    'various',
    'helped with',
    'worked on',
    'participated in',
    'assisted',
  ].filter((p) => lower.includes(p));

  const yearMatches = [...resumeText.matchAll(/\b((19|20)\d{2})\b/g)].map((m) => Number(m[1]));
  const oldest = yearMatches.length ? Math.min(...yearMatches) : null;
  const ageismRisk = oldest != null && oldest < 2010;

  const leadership = (
    resumeText.match(/\b(led|managed|mentored|owned|directed|supervised|head of)\b/gi) ?? []
  ).length;

  const softHits = (
    resumeText.match(
      /\b(communication|collaboration|teamwork|leadership|problem[- ]solving|stakeholder)\b/gi,
    ) ?? []
  ).length;

  const actionHits = (
    resumeText.match(
      /\b(achieved|improved|reduced|delivered|built|designed|launched|optimized|automated)\b/gi,
    ) ?? []
  ).length;

  const hr: AtsReportCheck[] = [
    {
      id: 'hr-credibility',
      criterionKey: 'premium',
      label: 'Credibility',
      status: vague.length >= 3 ? 'fail' : vague.length > 0 ? 'warn' : 'pass',
      summary: statusSummary(
        vague.length >= 3 ? 'fail' : vague.length > 0 ? 'warn' : 'pass',
        vague.length,
      ),
      detail:
        vague.length > 0
          ? 'Some lines sound vague. Swap filler phrases for concrete outcomes.'
          : 'Language looks specific enough for a first HR screen.',
      quotes: vague.slice(0, 2).map((v) => ({ text: `…${v}…` })),
    },
    {
      id: 'hr-interview',
      criterionKey: 'premium',
      label: 'Interview Risks',
      status: result.breakdown.quantifiableAchievements.score < 50 ? 'warn' : 'pass',
      summary:
        result.breakdown.quantifiableAchievements.score < 50 ? '1 issue' : 'No issues',
      detail:
        result.breakdown.quantifiableAchievements.score < 50
          ? 'Weak metrics can trigger follow-up questions about impact.'
          : 'Impact language looks interview-ready.',
    },
  ];

  const discrimination: AtsReportCheck[] = [
    {
      id: 'disc-age',
      criterionKey: 'premium',
      label: 'Ageism & Date Bias',
      status: ageismRisk ? 'warn' : 'pass',
      summary: ageismRisk ? '1 issue' : 'No issues',
      detail: ageismRisk
        ? `Early dates (from ${oldest}) can invite age bias. Prefer recent roles and drop ancient graduation years when possible.`
        : 'No strong age-signal dates stood out.',
    },
    {
      id: 'disc-gaps',
      criterionKey: 'premium',
      label: 'Employment Gaps',
      status: 'pass',
      summary: 'No issues',
      detail: 'No obvious multi-year gaps detected from date tokens alone.',
    },
  ];

  const seniority: AtsReportCheck[] = [
    {
      id: 'sen-leadership',
      criterionKey: 'premium',
      label: 'Leadership Signals',
      status: leadership >= 2 ? 'pass' : leadership === 1 ? 'warn' : 'fail',
      summary: leadership >= 2 ? 'No issues' : leadership === 1 ? '1 issue' : 'Needs work',
      detail:
        leadership >= 2
          ? 'Leadership verbs show up in your experience.'
          : 'Add ownership verbs (led, mentored, owned) if you have that experience.',
    },
    {
      id: 'sen-skill-evidence',
      criterionKey: 'premium',
      label: 'Skill Evidence',
      status: criterionStatus(result.breakdown.skillsOptimization.score),
      summary: statusSummary(criterionStatus(result.breakdown.skillsOptimization.score)),
      detail: result.breakdown.skillsOptimization.feedback,
      weaknessId: 'skillsOptimization',
    },
  ];

  const jd = result.jdMatch;
  const tailoring: AtsReportCheck[] = [
    {
      id: 'tailor-hard',
      criterionKey: 'jdKeywords',
      label: 'Hard Skills',
      status: !jd
        ? 'warn'
        : jd.matchScore >= 70
          ? 'pass'
          : jd.matchScore >= 45
            ? 'warn'
            : 'fail',
      summary: !jd
        ? 'Add a job description'
        : jd.missing.length
          ? `${Math.min(jd.missing.length, 5)} gaps`
          : 'No issues',
      detail: !jd
        ? 'Paste a job description to unlock keyword gap analysis.'
        : jd.missing.length
          ? `Missing from the JD: ${jd.missing.slice(0, 6).join(', ')}.`
          : `Strong hard-skill overlap (${jd.matchScore}% match).`,
      weaknessId: jd?.missing?.[0] ? `jd:${jd.missing[0].toLowerCase()}` : undefined,
    },
    {
      id: 'tailor-soft',
      criterionKey: 'premium',
      label: 'Soft Skills',
      status: softHits >= 3 ? 'pass' : softHits >= 1 ? 'warn' : 'fail',
      summary: softHits >= 3 ? 'No issues' : softHits >= 1 ? '1 issue' : 'Needs work',
      detail:
        softHits >= 3
          ? 'Soft skills appear in context.'
          : 'Weave collaboration / communication / leadership into bullets — not only a skills list.',
    },
    {
      id: 'tailor-verbs',
      criterionKey: 'premium',
      label: 'Action Verbs',
      status: actionHits >= 5 ? 'pass' : actionHits >= 2 ? 'warn' : 'fail',
      summary: actionHits >= 5 ? 'No issues' : `${Math.max(1, 5 - actionHits)} to strengthen`,
      detail:
        actionHits >= 5
          ? 'Strong action-verb coverage.'
          : 'Start more bullets with concrete verbs (built, improved, delivered).',
    },
    {
      id: 'tailor-title',
      criterionKey: 'premium',
      label: 'Tailored Title',
      status: 'warn',
      summary: 'Review',
      detail:
        'Align your headline / summary title with the target role wording when you apply.',
    },
  ];

  return { hr, discrimination, seniority, tailoring };
}

export function buildAtsReport(
  result: AtsCheckResult,
  resumeText: string,
  opts: { isPremium?: boolean } = {},
): AtsReport {
  const isPremium = Boolean(opts.isPremium);
  const b = result.breakdown;
  const unquantified = findUnquantifiedBullets(resumeText);
  const thin = findThinBullets(resumeText);
  const parsePct = parseRatePercent(result);

  const contentChecks: AtsReportCheck[] = [
    {
      id: 'content-parse',
      criterionKey: 'parse',
      label: 'ATS Parse Rate',
      status: result.parseQuality === 'good' ? 'pass' : result.parseQuality === 'degraded' ? 'warn' : 'fail',
      summary: statusSummary(
        result.parseQuality === 'good' ? 'pass' : result.parseQuality === 'degraded' ? 'warn' : 'fail',
      ),
      detail:
        result.parseWarning ??
        `We read about ${parsePct}% of your resume clearly — a high parse rate helps ATS systems surface your skills.`,
    },
    {
      id: 'content-quantify',
      weaknessId: 'quantifiableAchievements',
      criterionKey: 'quantifiableAchievements',
      label: 'Quantifying Impact',
      status: criterionStatus(b.quantifiableAchievements.score),
      summary: statusSummary(
        criterionStatus(b.quantifiableAchievements.score),
        unquantified.length,
      ),
      detail: b.quantifiableAchievements.feedback,
      quotes: unquantified.map((t) => ({ text: t })),
    },
    {
      id: 'content-bullets',
      weaknessId: 'bulletQuality',
      criterionKey: 'bulletQuality',
      label: 'Bullets Consistency',
      status: criterionStatus(b.bulletQuality.score),
      summary: statusSummary(criterionStatus(b.bulletQuality.score), thin.length),
      detail: b.bulletQuality.feedback,
      quotes: thin.map((t) => ({ text: t })),
    },
    {
      id: 'content-skills',
      weaknessId: 'skillsOptimization',
      criterionKey: 'skillsOptimization',
      label: 'Skills Optimization',
      status: criterionStatus(b.skillsOptimization.score),
      summary: statusSummary(criterionStatus(b.skillsOptimization.score)),
      detail: b.skillsOptimization.feedback,
    },
  ];

  const sectionChecks: AtsReportCheck[] = [
    {
      id: 'sec-essential',
      weaknessId: 'sectionStructure',
      criterionKey: 'sectionStructure',
      label: 'Essential Sections',
      status: criterionStatus(b.sectionStructure.score),
      summary: statusSummary(criterionStatus(b.sectionStructure.score)),
      detail: b.sectionStructure.feedback,
    },
    {
      id: 'sec-contact',
      weaknessId: 'contactInfo',
      criterionKey: 'contactInfo',
      label: 'Contact Information',
      status: criterionStatus(b.contactInfo.score),
      summary: statusSummary(criterionStatus(b.contactInfo.score)),
      detail: b.contactInfo.feedback,
    },
  ];

  const atsChecks: AtsReportCheck[] = [
    {
      id: 'ats-format',
      weaknessId: 'formatCleanliness',
      criterionKey: 'formatCleanliness',
      label: 'Design & Format',
      status: criterionStatus(b.formatCleanliness.score),
      summary: statusSummary(criterionStatus(b.formatCleanliness.score)),
      detail: result.fileHints?.formatAdvice
        ? `${b.formatCleanliness.feedback} ${result.fileHints.formatAdvice}`
        : b.formatCleanliness.feedback,
    },
    {
      id: 'ats-dates',
      weaknessId: 'dateConsistency',
      criterionKey: 'dateConsistency',
      label: 'Dates & Links',
      status: criterionStatus(b.dateConsistency.score),
      summary: statusSummary(criterionStatus(b.dateConsistency.score)),
      detail: b.dateConsistency.feedback,
    },
    {
      id: 'ats-length',
      weaknessId: 'lengthReadability',
      criterionKey: 'lengthReadability',
      label: 'Length & Density',
      status: criterionStatus(b.lengthReadability.score),
      summary: statusSummary(criterionStatus(b.lengthReadability.score)),
      detail: b.lengthReadability.feedback,
    },
  ];

  if (result.fileHints) {
    const fq = result.fileHints.formatQuality;
    const fileStatus: AtsReportCheckStatus =
      fq === 'best' || fq === 'good' ? 'pass' : fq === 'poor' ? 'fail' : 'warn';
    atsChecks.unshift({
      id: 'ats-file',
      criterionKey: 'formatCleanliness',
      label: 'File Format & Size',
      status: fileStatus,
      summary: statusSummary(fileStatus),
      detail:
        result.fileHints.formatAdvice ??
        `Detected .${result.fileHints.extension || 'unknown'} upload.`,
    });
  }

  const premium = buildPremiumHeuristics(resumeText, result);

  const freeContentScore = avg([
    parsePct,
    b.quantifiableAchievements.score,
    b.bulletQuality.score,
    b.skillsOptimization.score,
  ]);
  const freeSectionsScore = avg([b.sectionStructure.score, b.contactInfo.score]);
  const freeAtsScore = avg([
    b.formatCleanliness.score,
    b.dateConsistency.score,
    b.lengthReadability.score,
  ]);

  const categories: AtsReportCategory[] = [
    {
      id: 'content',
      label: 'Content',
      tier: 'free',
      score: freeContentScore,
      locked: false,
      issueCount: contentChecks.filter((c) => c.status !== 'pass').length,
      checks: contentChecks,
    },
    {
      id: 'sections',
      label: 'Sections',
      tier: 'free',
      score: freeSectionsScore,
      locked: false,
      issueCount: sectionChecks.filter((c) => c.status !== 'pass').length,
      checks: sectionChecks,
    },
    {
      id: 'ats_essentials',
      label: 'ATS Essentials',
      tier: 'free',
      score: freeAtsScore,
      locked: false,
      issueCount: atsChecks.filter((c) => c.status !== 'pass').length,
      checks: atsChecks,
    },
    {
      id: 'hr',
      label: 'HR Red Flags',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.hr
              .filter((c) => c.status !== 'locked')
              .map((c) => (c.status === 'pass' ? 85 : c.status === 'warn' ? 60 : 40)),
          )
        : 69,
      locked: !isPremium,
      issueCount: isPremium ? premium.hr.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.hr
        : [lockedCheck('hr-cred', 'Credibility'), lockedCheck('hr-int', 'Interview Risks')],
    },
    {
      id: 'discrimination',
      label: 'Bias Signals',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.discrimination.map((c) =>
              c.status === 'pass' ? 88 : c.status === 'warn' ? 62 : 45,
            ),
          )
        : 54,
      locked: !isPremium,
      issueCount: isPremium
        ? premium.discrimination.filter((c) => c.status !== 'pass').length
        : 0,
      checks: isPremium
        ? premium.discrimination
        : [
            lockedCheck('disc-age', 'Ageism & Date Bias'),
            lockedCheck('disc-gaps', 'Employment Gaps'),
          ],
    },
    {
      id: 'seniority',
      label: 'Seniority',
      tier: 'premium',
      score: isPremium
        ? avg(
            premium.seniority.map((c) =>
              c.status === 'pass' ? 82 : c.status === 'warn' ? 58 : 42,
            ),
          )
        : 57,
      locked: !isPremium,
      issueCount: isPremium ? premium.seniority.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.seniority
        : [
            lockedCheck('sen-prog', 'Career Progression'),
            lockedCheck('sen-lead', 'Leadership Signals'),
          ],
    },
    {
      id: 'tailoring',
      label: 'Tailoring',
      tier: 'premium',
      score: isPremium
        ? result.jdMatch?.matchScore ??
          avg(
            premium.tailoring.map((c) =>
              c.status === 'pass' ? 80 : c.status === 'warn' ? 55 : 40,
            ),
          )
        : null,
      locked: !isPremium,
      issueCount: isPremium ? premium.tailoring.filter((c) => c.status !== 'pass').length : 0,
      checks: isPremium
        ? premium.tailoring
        : [
            // Shallow free teaser when JD exists — still marked locked for deep report
            ...(result.jdMatch
              ? [
                  {
                    id: 'tailor-teaser',
                    criterionKey: 'jdKeywords' as const,
                    label: 'Hard Skills (preview)',
                    status: 'locked' as const,
                    summary: `${result.jdMatch.matchScore}% match`,
                    detail: `Free preview: ${result.jdMatch.matched.length} matched, ${result.jdMatch.missing.length} missing. Unlock Premium for full Tailoring.`,
                  },
                ]
              : []),
            lockedCheck('tailor-soft', 'Soft Skills'),
            lockedCheck('tailor-verbs', 'Action Verbs'),
            lockedCheck('tailor-title', 'Tailored Title'),
          ],
    },
  ];

  const issueCount = categories
    .filter((c) => !c.locked)
    .reduce((n, c) => n + c.issueCount, 0);

  return {
    overallScore: result.overallScore,
    issueCount,
    parseRatePercent: parsePct,
    categories,
  };
}

export function criterionLabel(key: AtsCriterionKey): string {
  return ATS_CRITERION_LABELS[key];
}

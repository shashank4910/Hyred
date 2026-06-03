/**
 * Experience-aware job matching — parse JD requirements, resolve candidate
 * years (resume insights + apply-profile override), and hard-filter roles
 * the candidate is clearly under-qualified for.
 */

import type { ResumeInsights } from './types';

/** Candidate may be up to this many years short; gap >= 3 is ineligible. */
export const MAX_EXPERIENCE_SHORTFALL_YEARS = 2;

export type JdSeniority =
  | 'ic'
  | 'lead'
  | 'manager'
  | 'director'
  | 'vp'
  | 'executive'
  | 'unknown';

export function parseRequiredYearsFromText(text: string | null | undefined): number {
  if (!text) return 0;

  const normalized = text.replace(/[\u2013\u2014]/g, '-');
  let maxYears = 0;

  const rangeRe =
    /(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:\+?\s*)?years?(?:\s+of)?(?:\s+(?:relevant|professional))?(?:\s+experience|\b)/gi;
  const singleRe =
    /(?:minimum|min\.?|at\s+least|least|over)\s*(\d{1,2})\+?\s*years?|(\d{1,2})\+\s*years?(?:\s+of)?(?:\s+(?:relevant|professional))?(?:\s+experience|\b)|(?:^|[^\d])(\d{1,2})\s*years?(?:\s+of)?(?:\s+(?:relevant|professional))?(?:\s+experience|\b)/gi;

  for (const m of normalized.matchAll(rangeRe)) {
    const upper = Math.max(Number(m[1]), Number(m[2]));
    if (upper >= 1 && upper <= 50) maxYears = Math.max(maxYears, upper);
  }

  for (const m of normalized.matchAll(singleRe)) {
    const n = Number(m[1] ?? m[2] ?? m[3]);
    if (n >= 1 && n <= 50) maxYears = Math.max(maxYears, n);
  }

  return maxYears;
}

export function inferJdSeniorityFromTitle(title: string | null | undefined): JdSeniority {
  const t = (title ?? '').toLowerCase();
  if (/\b(?:vp|vice president|chief|cfo|cto|ceo|evp|svp)\b/.test(t)) return 'vp';
  if (/\bhead of\b/.test(t)) return 'director';
  if (/\bdirector\b/.test(t)) return 'director';
  if (/\b(?:engineering manager|eng(?:ineering)? manager)\b/.test(t)) return 'manager';
  if (/\bmanager\b/.test(t)) return 'manager';
  if (/\b(?:tech(?:nical)? lead|team lead)\b/.test(t)) return 'lead';
  if (/\b(?:principal|staff)\b/.test(t)) return 'ic';
  return 'ic';
}

export function inferRequiredYearsFromTitle(
  title: string | null | undefined,
  jdSeniority?: JdSeniority,
): number {
  const t = (title ?? '').toLowerCase();
  const seniority = jdSeniority ?? inferJdSeniorityFromTitle(title);

  if (seniority === 'vp' || seniority === 'executive') return 15;
  if (seniority === 'director' || /\bdirector\b/.test(t) || /\bhead of\b/.test(t)) return 12;
  if (seniority === 'manager') return 8;
  if (seniority === 'lead') return 8;
  if (/\b(principal|staff)\b/.test(t)) return 10;
  return 0;
}

export function resolveRequiredYears(args: {
  jdText?: string | null;
  jobTitle?: string | null;
  llmRequiredYears?: number;
  jdSeniority?: JdSeniority;
}): number {
  const parsed = parseRequiredYearsFromText(args.jdText);
  const seniority = args.jdSeniority ?? inferJdSeniorityFromTitle(args.jobTitle);
  const inferred = inferRequiredYearsFromTitle(args.jobTitle, seniority);
  const llm = Math.max(0, Math.round(args.llmRequiredYears ?? 0));
  return Math.max(parsed, inferred, llm);
}

export function resolveCandidateYears(args: {
  insightsYears?: number | null;
  applyProfileYears?: unknown;
}): number | null {
  const applyRaw = args.applyProfileYears;
  const applyNum =
    typeof applyRaw === 'number'
      ? applyRaw
      : typeof applyRaw === 'string' && applyRaw.trim() !== ''
        ? Number(applyRaw)
        : NaN;

  if (Number.isFinite(applyNum) && applyNum > 0) {
    return Math.round(applyNum * 10) / 10;
  }

  if (typeof args.insightsYears === 'number' && args.insightsYears > 0) {
    return args.insightsYears;
  }

  return null;
}

export function mergeInsightsForScoring(
  insights: ResumeInsights | null | undefined,
  applyProfileYears?: unknown,
): ResumeInsights | null {
  const years = resolveCandidateYears({
    insightsYears: insights?.years_experience,
    applyProfileYears,
  });
  if (!insights && years == null) return null;
  if (years == null) return insights ?? null;
  return { ...(insights ?? {}), years_experience: years };
}

export function experienceGap(
  candidateYears: number | null,
  requiredYears: number,
): number | null {
  if (candidateYears == null || requiredYears <= 0) return null;
  return requiredYears - candidateYears;
}

export function isExperienceEligible(
  candidateYears: number | null,
  requiredYears: number,
): boolean {
  const gap = experienceGap(candidateYears, requiredYears);
  if (gap == null) return true;
  return gap <= MAX_EXPERIENCE_SHORTFALL_YEARS;
}

export function experienceIneligibilityReason(
  candidateYears: number,
  requiredYears: number,
): string {
  const gap = Math.round(requiredYears - candidateYears);
  return `Requires ~${requiredYears} years of experience; your profile shows ${candidateYears} years (${gap}-year gap). Not a fit for your experience level.`;
}

export function computeExperienceScoreCap(args: {
  candidateYears: number | null;
  requiredYears: number;
  candidateSeniority?: string | null;
  jdSeniority?: JdSeniority;
}): { cap: number; reason: string } {
  const { candidateYears, requiredYears, candidateSeniority, jdSeniority } = args;
  let cap = 100;
  let capReason = '';

  if (candidateYears != null && requiredYears > 0) {
    const gap = requiredYears - candidateYears;
    if (gap >= 11) {
      cap = Math.min(cap, 45);
      capReason = `experience gap of ${Math.round(gap)} years`;
    } else if (gap >= 7) {
      cap = Math.min(cap, 55);
      capReason = `experience gap of ${Math.round(gap)} years`;
    } else if (gap >= 4) {
      cap = Math.min(cap, 70);
      capReason = `experience gap of ${Math.round(gap)} years`;
    } else if (gap >= 3) {
      cap = Math.min(cap, 49);
      capReason = `experience gap of ${Math.round(gap)} years`;
    } else if (gap >= 2) {
      cap = Math.min(cap, 80);
      capReason = `slightly under JD's experience requirement`;
    }
  }

  const candIsIc =
    !candidateSeniority ||
    ['junior', 'mid', 'senior', 'staff', 'principal', 'unknown'].includes(
      candidateSeniority,
    );
  const yearsShortfall =
    candidateYears != null && requiredYears > 0
      ? Math.max(0, requiredYears - candidateYears)
      : Infinity;

  if (candIsIc && (yearsShortfall >= 4 || requiredYears === 0)) {
    if (jdSeniority === 'director') {
      cap = Math.min(cap, 55);
      if (!capReason) capReason = 'IC-level candidate vs director-level role';
    } else if (jdSeniority === 'vp' || jdSeniority === 'executive') {
      cap = Math.min(cap, 40);
      if (!capReason) capReason = `IC-level candidate vs ${jdSeniority}-level role`;
    }
  }

  return { cap, reason: capReason };
}

/**
 * ATS Fix Studio — patch model + weakness list + apply/undo.
 * Pure helpers (safe for client + server). LLM suggest lives in ats-fix-suggest.ts.
 */

import type { AtsCheckResult } from './ats-checker';

export type AtsCriterionKey = keyof AtsCheckResult['breakdown'];

export type AtsFixWeaknessId = AtsCriterionKey | `jd:${string}`;

export interface AtsFixWeakness {
  id: AtsFixWeaknessId;
  criterionKey: AtsCriterionKey | 'jdKeywords';
  label: string;
  score: number | null;
  /** 0–100 style; null for JD keyword rows */
  status: 'needs_work' | 'passing';
  priority: 'high' | 'medium' | 'low';
  feedback: string;
  /** For jd:keyword rows */
  missingKeyword?: string;
}

export interface AtsFixSuggestion {
  id: string;
  weaknessId: AtsFixWeaknessId;
  criterionKey: AtsCriterionKey | 'jdKeywords';
  title: string;
  rationale: string;
  /** Exact substring that must exist in the working resume */
  originalSnippet: string;
  proposedText: string;
}

export interface AppliedFix {
  suggestion: AtsFixSuggestion;
  /** Resume text before this apply (for undo) */
  beforeResume: string;
}

export const ATS_CRITERION_LABELS: Record<AtsCriterionKey, string> = {
  sectionStructure: 'Section Structure',
  contactInfo: 'Contact Info',
  bulletQuality: 'Bullet Points',
  quantifiableAchievements: 'Quantified Impact',
  skillsOptimization: 'Skills Optimization',
  lengthReadability: 'Length & Density',
  formatCleanliness: 'Format Cleanliness',
  dateConsistency: 'Date Formatting',
};

const NEEDS_WORK_BELOW = 75;

function priorityForScore(score: number): 'high' | 'medium' | 'low' {
  if (score < 50) return 'high';
  if (score < 65) return 'medium';
  return 'low';
}

/** Build left-rail weakness list from an ATS result. */
export function listAtsWeaknesses(result: AtsCheckResult): AtsFixWeakness[] {
  const items: AtsFixWeakness[] = [];

  for (const key of Object.keys(ATS_CRITERION_LABELS) as AtsCriterionKey[]) {
    const cr = result.breakdown[key];
    const needsWork = cr.score < NEEDS_WORK_BELOW;
    items.push({
      id: key,
      criterionKey: key,
      label: ATS_CRITERION_LABELS[key],
      score: cr.score,
      status: needsWork ? 'needs_work' : 'passing',
      priority: needsWork ? priorityForScore(cr.score) : 'low',
      feedback: cr.feedback,
    });
  }

  // Sort needs_work first (lowest score), then passing
  items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'needs_work' ? -1 : 1;
    return (a.score ?? 100) - (b.score ?? 100);
  });

  const missing = result.jdMatch?.missing?.slice(0, 8) ?? [];
  for (const kw of missing) {
    items.push({
      id: `jd:${kw.toLowerCase()}`,
      criterionKey: 'jdKeywords',
      label: `Missing keyword: ${kw}`,
      score: null,
      status: 'needs_work',
      priority: 'medium',
      feedback: `“${kw}” appears in the job description but not clearly in your resume.`,
      missingKeyword: kw,
    });
  }

  return items;
}

/**
 * Find originalSnippet in resume (exact, then whitespace-flexible).
 * Returns [start, end) or null.
 */
export function findSnippetRange(
  resume: string,
  snippet: string,
): { start: number; end: number } | null {
  if (!snippet.trim()) return null;
  const exact = resume.indexOf(snippet);
  if (exact >= 0) return { start: exact, end: exact + snippet.length };

  // Collapse whitespace for a tolerant match, map back to original indices
  const normResume = resume.replace(/\s+/g, ' ');
  const normSnippet = snippet.replace(/\s+/g, ' ').trim();
  const ni = normResume.indexOf(normSnippet);
  if (ni < 0) return null;

  // Map normalized index → original by walking both strings
  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < ni && origIdx < resume.length) {
    const rc = resume[origIdx];
    if (/\s/.test(rc)) {
      while (origIdx < resume.length && /\s/.test(resume[origIdx])) origIdx++;
      normIdx++; // one space in normalized
    } else {
      origIdx++;
      normIdx++;
    }
  }
  const start = origIdx;
  let remaining = normSnippet.length;
  while (remaining > 0 && origIdx < resume.length) {
    const rc = resume[origIdx];
    if (/\s/.test(rc)) {
      while (origIdx < resume.length && /\s/.test(resume[origIdx])) origIdx++;
      remaining--; // consumed one normalized space
    } else {
      origIdx++;
      remaining--;
    }
  }
  return { start, end: origIdx };
}

export function applySuggestion(
  resume: string,
  suggestion: Pick<AtsFixSuggestion, 'originalSnippet' | 'proposedText'>,
): { ok: true; resume: string; start: number; end: number } | { ok: false; error: string } {
  const range = findSnippetRange(resume, suggestion.originalSnippet);
  if (!range) {
    return {
      ok: false,
      error: 'Could not find that text in your resume. Try Regenerate for a fresh suggestion.',
    };
  }
  const next =
    resume.slice(0, range.start) + suggestion.proposedText + resume.slice(range.end);
  return { ok: true, resume: next, start: range.start, end: range.start + suggestion.proposedText.length };
}

export function undoLastFix(
  applied: AppliedFix[],
): { resume: string; applied: AppliedFix[] } | null {
  if (applied.length === 0) return null;
  const last = applied[applied.length - 1]!;
  return {
    resume: last.beforeResume,
    applied: applied.slice(0, -1),
  };
}

/** Stable id for a suggestion payload (client-side). */
export function makeSuggestionId(weaknessId: string, originalSnippet: string): string {
  const base = `${weaknessId}:${originalSnippet.slice(0, 40)}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return `fix_${Math.abs(h).toString(36)}`;
}

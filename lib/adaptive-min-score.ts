import type { Preferences, ScoreWidenNotice } from './types';
import { DEFAULT_DASHBOARD_MIN_SCORE } from './match-stats';

/** Target inbox richness after a scan — PO floor for "enough to browse". */
export const ADAPTIVE_MATCH_TARGET = 25;

/** Never save or widen below this — keeps obvious junk out. */
export const ADAPTIVE_MATCH_FLOOR = DEFAULT_DASHBOARD_MIN_SCORE;

/** First step down from a strict user setting (e.g. 70 → 60). */
export const ADAPTIVE_MATCH_MID = 60;

export type ScoredForAdaptive = { finalScore: number; jobId: string };

/** Thresholds to try, high → low, always including the user's setting and the floor. */
export function buildAdaptiveThresholds(userMin: number): number[] {
  const values = new Set<number>([userMin, ADAPTIVE_MATCH_MID, ADAPTIVE_MATCH_FLOOR]);
  return [...values]
    .filter((t) => t >= ADAPTIVE_MATCH_FLOOR && t <= 100)
    .sort((a, b) => b - a);
}

export function countAtOrAbove(
  pending: ScoredForAdaptive[],
  threshold: number,
): number {
  return pending.filter((m) => m.finalScore >= threshold).length;
}

/**
 * Pick the highest threshold (≤ user min) that yields enough matches,
 * or the floor when even that is sparse (best-effort).
 */
export function pickAdaptiveThreshold(
  pending: ScoredForAdaptive[],
  userMinScore: number,
  target: number = ADAPTIVE_MATCH_TARGET,
): { threshold: number; shouldWiden: boolean } {
  const userMin = Math.max(ADAPTIVE_MATCH_FLOOR, userMinScore);
  const atUser = countAtOrAbove(pending, userMin);
  if (atUser >= target) {
    return { threshold: userMin, shouldWiden: false };
  }

  const thresholds = buildAdaptiveThresholds(userMin)
    .filter((t) => t <= userMin)
    .sort((a, b) => b - a);

  let fallback = ADAPTIVE_MATCH_FLOOR;
  for (const t of thresholds) {
    const count = countAtOrAbove(pending, t);
    if (count >= target) {
      return { threshold: t, shouldWiden: t < userMin };
    }
    fallback = t;
  }

  return { threshold: fallback, shouldWiden: fallback < userMin };
}

/** Jobs to persist after widening — excludes already-saved rows. */
export function matchesToSaveAfterWiden<T extends ScoredForAdaptive>(
  pending: T[],
  userMinScore: number,
  alreadySavedJobIds: ReadonlySet<string>,
  target: number = ADAPTIVE_MATCH_TARGET,
): { threshold: number; toSave: T[]; shouldWiden: boolean; matchesAtUserMin: number } {
  const userMin = Math.max(ADAPTIVE_MATCH_FLOOR, userMinScore);
  const matchesAtUserMin = countAtOrAbove(pending, userMin);
  const { threshold, shouldWiden } = pickAdaptiveThreshold(
    pending,
    userMin,
    target,
  );

  if (!shouldWiden) {
    return { threshold: userMin, toSave: [], shouldWiden: false, matchesAtUserMin };
  }

  const toSave = pending
    .filter(
      (m) =>
        m.finalScore >= threshold &&
        !alreadySavedJobIds.has(m.jobId),
    )
    .sort((a, b) => b.finalScore - a.finalScore);

  return { threshold, toSave, shouldWiden: true, matchesAtUserMin };
}

export function buildScoreWidenNotice(args: {
  previousMin: number;
  appliedMin: number;
  matchesAtUserMin: number;
  matchesAfterWiden: number;
  scanAt?: string;
}): ScoreWidenNotice {
  return {
    previous_min_score: args.previousMin,
    applied_min_score: args.appliedMin,
    matches_at_user_min: args.matchesAtUserMin,
    matches_after_widen: args.matchesAfterWiden,
    scan_at: args.scanAt ?? new Date().toISOString(),
  };
}

export function preferencesAfterAdaptiveWiden(
  preferences: Preferences,
  notice: ScoreWidenNotice,
): Preferences {
  return {
    ...preferences,
    min_score: notice.applied_min_score,
    score_widen_notice: notice,
  };
}

export function clearScoreWidenNotice(preferences: Preferences): Preferences {
  const next = { ...preferences };
  delete next.score_widen_notice;
  return next;
}

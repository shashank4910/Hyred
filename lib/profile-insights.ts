import type { Preferences, ResumeInsights } from './types';

/** Drop cached ingest search profile so the next scan re-derives from resume. */
export function stripSearchProfile(
  insights: ResumeInsights | null | undefined,
): ResumeInsights | null {
  if (!insights || typeof insights !== 'object') return insights ?? null;
  const next = { ...(insights as Record<string, unknown>) };
  delete next.search_profile;
  return next as ResumeInsights;
}

/**
 * When the resume changes, preferences must follow the NEW resume — not stale
 * values adopted from a previous account/session (e.g. HR roles on a marketing CV).
 */
export function preferencesFromResumeInsights(
  preferences: Preferences,
  insights: ResumeInsights | null | undefined,
): Preferences {
  if (!insights) return preferences;

  let next: Preferences = { ...preferences };

  if (insights.suggested_roles?.length) {
    next = { ...next, roles: insights.suggested_roles };
  }

  if (insights.current_location) {
    const locs = new Set<string>(next.locations ?? []);
    locs.add(insights.current_location);
    if (next.remote_only) locs.add('Remote');
    next = { ...next, locations: [...locs] };
  }

  return next;
}

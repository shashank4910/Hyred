import { formatDistanceToNow, format } from 'date-fns';

export function relativeTime(date: string | null): string {
  if (!date) return '';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * Compact human-readable date stamp like "28 May 26".
 * Used on match cards next to the relative time so users can see exactly
 * how old a job is, not just a fuzzy "2 days ago".
 */
export function formatShortDate(date: string | null | undefined): string {
  if (!date) return '';
  try {
    return format(new Date(date), 'd MMM yy');
  } catch {
    return '';
  }
}

/**
 * Full date+time tooltip like "28 May 2026, 14:32".
 * Used in title attributes so hover gives the precise timestamp.
 */
export function formatFullDate(date: string | null | undefined): string {
  if (!date) return '';
  try {
    return format(new Date(date), 'd MMM yyyy, HH:mm');
  } catch {
    return '';
  }
}

export function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return 'score-band-low';
  if (score >= 90) return 'score-band-90';
  if (score >= 75) return 'score-band-75';
  if (score >= 60) return 'score-band-60';
  return 'score-band-low';
}

export function scoreLabel(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Decent';
  return 'Weak';
}

export const SOURCE_LABELS: Record<string, string> = {
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  hn: 'HN',
  arbeitnow: 'Arbeitnow',
  adzuna_in: 'Adzuna IN',
  himalayas: 'Himalayas',
  jsearch: 'JSearch',
  linkedin: 'LinkedIn',
  manual: 'Imported',
};

export const STATUS_ORDER = [
  'new',
  'viewed',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'closed',
] as const;

/** Default dashboard match ordering — best AI match score first (PR #110). */
export const DEFAULT_MATCH_SORT = 'score' as const;

export const MATCH_SORT_MODES = [
  'newest',
  'posted',
  'score',
  'activity',
  'oldest',
] as const;

export type MatchSortMode = (typeof MATCH_SORT_MODES)[number];

export function resolveMatchSort(raw: string | null | undefined): MatchSortMode {
  if (raw && (MATCH_SORT_MODES as readonly string[]).includes(raw)) {
    return raw as MatchSortMode;
  }
  return DEFAULT_MATCH_SORT;
}

/** Turn API / thrown values into a human-readable toast message (never "[object Object]"). */
export function readableError(value: unknown, fallback = 'Something went wrong'): string {
  if (value instanceof Error) {
    const msg = value.message?.trim();
    if (msg && msg !== '[object Object]') return msg;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'description']) {
      const nested = readableError(o[key], '');
      if (nested) return nested;
    }
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      return o.errors
        .slice(0, 3)
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            const row = entry as { source?: string; error?: unknown };
            if (row.source && row.error != null) {
              return `${row.source}: ${readableError(row.error, 'failed')}`;
            }
            return readableError(entry, 'Issue');
          }
          return readableError(entry, 'Issue');
        })
        .join(' · ');
    }
  }
  return fallback;
}

export function formatIngestWarnings(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return readableError({ errors }, 'Scan finished with warnings');
}

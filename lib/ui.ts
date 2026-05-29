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

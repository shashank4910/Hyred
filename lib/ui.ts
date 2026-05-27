import { formatDistanceToNow } from 'date-fns';

export function relativeTime(date: string | null): string {
  if (!date) return '';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '';
  }
}

export function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return 'score-weak';
  if (score >= 90) return 'score-excellent';
  if (score >= 75) return 'score-strong';
  if (score >= 60) return 'score-decent';
  return 'score-weak';
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
  manual: 'Imported',
};

export const STATUS_ORDER = [
  'new',
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'closed',
] as const;

'use client';

import Link from 'next/link';
import { Inbox, Loader2 } from 'lucide-react';
import { useScanUiActive } from '@/lib/scan-ui-active';

export function EmptyMatches({
  status,
  totalMatches,
  hiddenBelowThreshold,
  effectiveMinScore,
}: {
  status: string;
  totalMatches: number;
  hiddenBelowThreshold: number;
  effectiveMinScore: number;
}) {
  const scanning = useScanUiActive();

  if (hiddenBelowThreshold > 0) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest px-6 py-10 text-center shadow-card">
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="text-sm text-on-surface">
          <span className="font-semibold">{hiddenBelowThreshold}</span> match
          {hiddenBelowThreshold === 1 ? ' is' : 'es are'} hidden because{' '}
          {hiddenBelowThreshold === 1 ? 'its score is' : 'their scores are'} below your threshold of{' '}
          <span className="text-primary font-semibold">{effectiveMinScore}</span>.
        </p>
        <p className="text-xs text-on-surface-variant">
          Lower the threshold in your{' '}
          <Link href="/onboarding" className="font-medium text-primary hover:underline">
            profile
          </Link>{' '}
          to view them, or wait for the next scan to bring fresher jobs.
        </p>
        <Link href={`/?status=${status}&min=0`} className="btn inline-flex" scroll={false}>
          Show all scores anyway
        </Link>
      </div>
    );
  }

  if (scanning) {
    return (
      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-6 py-12 text-center">
        <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <p className="mt-3 text-sm font-semibold text-on-surface">
          Finding jobs that match your resume…
        </p>
        <p className="mt-1 text-xs text-on-surface-variant">
          This usually takes 1–5 minutes. You can keep browsing — matches will show up here when ready.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-container-lowest px-6 py-12 text-center shadow-card">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container text-text-muted">
        <Inbox className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm text-on-surface">
        No matches in <span className="font-medium text-primary">{status}</span> yet.
      </p>
      <p className="mt-1 text-xs text-on-surface-variant">
        {totalMatches > 0
          ? 'Try a different status or run a scan to find more.'
          : 'Click "Run scan" to find jobs matched to your resume.'}
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Copy, Lock, Sparkles } from 'lucide-react';
import { PREMIUM_UPGRADE_PATH } from '@/lib/premium-upgrade';

export type PremiumUpgradePanelProps = {
  /** Feature that hit the wall — drives headline copy. */
  feature?: 'resume_studio' | 'match_intelligence' | 'interview_prep';
  headline?: string;
  description?: string;
  /** Optional proof line, e.g. score lift from Fix Studio. */
  proof?: string | null;
  benefits?: string[];
  upgradeHref?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
  compact?: boolean;
};

const DEFAULT_BENEFITS = [
  'More Fix Studio AI rewrites on the ATS checker',
  'Job-tailored resumes in Resume Studio',
  'Same Hyred Premium plan — one credit pool',
];

export function PremiumUpgradePanel({
  feature = 'resume_studio',
  headline,
  description,
  proof,
  benefits = DEFAULT_BENEFITS,
  upgradeHref = PREMIUM_UPGRADE_PATH,
  secondaryLabel,
  onSecondary,
  className = '',
  compact = false,
}: PremiumUpgradePanelProps) {
  const resolvedHeadline =
    headline ??
    (feature === 'resume_studio'
      ? 'You’ve used your free resume fixes'
      : 'Upgrade to Hyred Premium');

  const resolvedDescription =
    description ??
    (feature === 'resume_studio'
      ? 'Free scoring stays free. Premium unlocks more AI fixes and job-tailored resumes from the same Resume Studio credit pool.'
      : 'Unlock the full Hyred Premium toolkit for stronger applications.');

  return (
    <div
      className={`rounded-[1.25rem] border border-primary/20 bg-gradient-to-br from-primary/8 via-surface-container-lowest to-secondary-container/10 ${
        compact ? 'p-4' : 'p-6'
      } ${className}`}
      role="region"
      aria-label="Upgrade to Hyred Premium"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">
            {resolvedHeadline}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {resolvedDescription}
          </p>
          {proof && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              {proof}
            </p>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-on-surface">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className={`mt-5 flex flex-col gap-2 sm:flex-row ${compact ? '' : 'sm:items-center'}`}>
        <Link
          href={upgradeHref}
          className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        >
          Upgrade to Hyred Premium
        </Link>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            <Copy className="h-4 w-4" />
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

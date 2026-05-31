import Link from 'next/link';
import { Search, Sparkles, TrendingUp, Zap } from 'lucide-react';

export function DashboardInsights({
  inboxCount,
  lastScanMatches,
  totalMatches,
  lastScanLabel,
}: {
  inboxCount: number;
  lastScanMatches: number | null;
  totalMatches: number;
  lastScanLabel: string;
}) {
  const bars = [40, 60, 45, 90, 75, Math.min(100, Math.max(20, inboxCount * 8))];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between">
          <h4 className="text-label-md font-bold uppercase tracking-wider text-text-muted">
            Match activity
          </h4>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="mb-4 flex h-32 items-end gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-lg transition-all ${i === bars.length - 1 ? 'bg-primary' : 'bg-primary/10 hover:bg-primary/30'}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="text-label-md text-text-muted">
          {inboxCount} in inbox · {totalMatches} tracked total
        </p>
      </div>

      <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-6 shadow-card">
        <h4 className="text-label-md font-bold uppercase tracking-wider text-text-muted">
          Scan insights
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-surface-container-low p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Search className="h-4 w-4" />
              </div>
              <span className="text-body-md">Last scan</span>
            </div>
            <span className="font-bold text-on-surface">{lastScanLabel}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-surface-container-low p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-match-success/20 text-match-success">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-body-md">Matches kept</span>
            </div>
            <span className="font-bold text-on-surface">
              {lastScanMatches != null && lastScanMatches > 0 ? `+${lastScanMatches}` : '—'}
            </span>
          </div>
        </div>
        <Link
          href="/onboarding"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant py-4 text-label-md font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low"
        >
          <Zap className="h-4 w-4" />
          Tune match profile
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl teal-gradient p-6 text-on-primary shadow-card">
        <div className="relative z-10">
          <h4 className="mb-2 text-headline-md font-semibold">Boost your reach</h4>
          <p className="mb-4 text-body-md leading-snug text-on-primary/85">
            Upload a sharper resume or broaden roles to improve match accuracy.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex rounded-2xl bg-on-primary px-5 py-2.5 text-label-md font-semibold text-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            Update resume
          </Link>
        </div>
        <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-on-primary/10 blur-2xl" />
      </div>
    </div>
  );
}

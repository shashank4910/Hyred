'use client';

import { CheckCircle2, SkipForward, Circle, Flag } from 'lucide-react';

/**
 * Slim progress strip for the guided Fix flow.
 * Shows how many issues are fixed / skipped / still open, plus a Finish action.
 */
export function AtsFixProgress({
  total,
  fixed,
  skipped,
  onFinish,
  canFinish,
}: {
  total: number;
  fixed: number;
  skipped: number;
  onFinish: () => void;
  canFinish: boolean;
}) {
  const remaining = Math.max(0, total - fixed - skipped);
  const done = total > 0 ? Math.round(((fixed + skipped) / total) * 100) : 0;
  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  const skippedPct = total > 0 ? (skipped / total) * 100 : 0;

  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3.5 shadow-card sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {fixed} fixed
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-on-surface-variant">
            <SkipForward className="h-4 w-4" /> {skipped} skipped
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-text-muted">
            <Circle className="h-4 w-4" /> {remaining} to review
          </span>
        </div>
        <button
          type="button"
          onClick={onFinish}
          disabled={!canFinish}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-outline-variant/50 px-3.5 text-[13px] font-semibold text-on-surface transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Flag className="h-3.5 w-3.5" />
          Review &amp; finish
        </button>
      </div>

      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${fixedPct}%` }}
        />
        <div
          className="h-full bg-slate-300 transition-all duration-500"
          style={{ width: `${skippedPct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-text-muted">
        {done}% reviewed · {total} issue{total === 1 ? '' : 's'} in this pass
      </p>
    </section>
  );
}

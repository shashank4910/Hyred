'use client';

import {
  CheckCircle2,
  Copy,
  Download,
  Save,
  ArrowLeft,
  TrendingUp,
  ListChecks,
} from 'lucide-react';
import type { AtsFixWeakness } from '@/lib/ats-fix';
import { AtsScoreRing } from './AtsScoreRing';

/**
 * Shown when the user has reviewed every flagged issue (fixed or skipped),
 * or clicks "Review & finish". Celebrates the score lift and gives clear
 * next actions, plus a way to revisit skipped items.
 */
export function AtsFinishScreen({
  baselineScore,
  currentScore,
  fixedCount,
  skippedItems,
  copied,
  saving,
  onRevisit,
  onCopy,
  onDownload,
  onSave,
  onBackToReport,
}: {
  baselineScore: number;
  currentScore: number;
  fixedCount: number;
  skippedItems: AtsFixWeakness[];
  copied: boolean;
  saving: boolean;
  onRevisit: (w: AtsFixWeakness) => void;
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void;
  onBackToReport: () => void;
}) {
  const delta = currentScore - baselineScore;

  return (
    <section className="mx-auto max-w-2xl animate-slide-up space-y-5">
      <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/25 bg-gradient-to-b from-emerald-500/[0.08] to-transparent px-6 py-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-headline text-2xl font-bold text-on-surface">
            {delta > 0 ? 'Nice work — your resume is stronger' : 'Review complete'}
          </h2>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            You reviewed every flagged issue. Here&apos;s where your ATS score landed.
          </p>

          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Before</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-text-muted">{baselineScore}</p>
            </div>
            <div className="flex flex-col items-center text-emerald-600">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm font-bold tabular-nums">
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>
            <AtsScoreRing score={currentScore} size={92} stroke={8} />
          </div>

          <p className="mt-5 text-sm font-semibold text-on-surface">
            {fixedCount} change{fixedCount === 1 ? '' : 's'} applied
            {skippedItems.length > 0 && (
              <span className="font-normal text-text-muted">
                {' '}· {skippedItems.length} skipped
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 p-5 sm:p-6">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied!' : 'Copy resume'}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Download className="h-4 w-4" />
            Download .txt
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save to profile
          </button>
        </div>
      </div>

      {skippedItems.length > 0 && (
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-on-surface-variant" />
            <h3 className="text-sm font-bold text-on-surface">Skipped issues</h3>
          </div>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            You passed on these. Fix any of them to push your score higher.
          </p>
          <div className="mt-3 space-y-2">
            {skippedItems.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onRevisit(w)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-outline-variant/40 px-3.5 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="truncate text-[13px] font-semibold text-on-surface">{w.label}</span>
                <span className="shrink-0 text-[11px] font-bold text-primary">Fix now →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onBackToReport}
        className="mx-auto flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to full report
      </button>
    </section>
  );
}

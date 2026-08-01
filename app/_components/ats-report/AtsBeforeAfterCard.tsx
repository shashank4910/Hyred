'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import type { AtsFixSuggestion, AtsFixWeakness } from '@/lib/ats-fix';
import { PremiumUpgradePanel } from '@/app/_components/PremiumUpgradePanel';

export function AtsBeforeAfterCard({
  selected,
  activeSuggestion,
  suggestions,
  activeIdx,
  loading,
  error,
  quotaBlocked,
  showSaveUpgrade,
  hasGeneratedOnce,
  meterLabel,
  scoreLiftProof,
  scoreDelta,
  onGenerate,
  onRegenerate,
  onApply,
  onPrev,
  onNext,
  onCopy,
  onDismissUpgrade,
}: {
  selected: AtsFixWeakness | null;
  activeSuggestion: AtsFixSuggestion | null;
  suggestions: AtsFixSuggestion[];
  activeIdx: number;
  loading: boolean;
  error: string | null;
  quotaBlocked: boolean;
  showSaveUpgrade: boolean;
  hasGeneratedOnce: boolean;
  meterLabel: string;
  scoreLiftProof: string | null;
  scoreDelta: number;
  onGenerate: () => void;
  onRegenerate: () => void;
  onApply: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCopy: () => void;
  onDismissUpgrade: () => void;
}) {
  if (quotaBlocked || showSaveUpgrade) {
    return (
      <section className="flex min-h-[420px] flex-col justify-center rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card sm:p-6">
        <PremiumUpgradePanel
          feature="resume_studio"
          proof={scoreLiftProof}
          secondaryLabel="Copy current resume"
          onSecondary={onCopy}
          headline={
            showSaveUpgrade && !quotaBlocked
              ? 'Saving to your Hyred resume is Premium'
              : undefined
          }
          description={
            showSaveUpgrade && !quotaBlocked
              ? 'Copy your fixes anytime for free. Premium lets you replace your master Hyred resume from Fix Studio.'
              : undefined
          }
        />
        {showSaveUpgrade && !quotaBlocked && (
          <button
            type="button"
            onClick={onDismissUpgrade}
            className="mt-3 cursor-pointer text-sm font-semibold text-on-surface-variant hover:text-primary"
          >
            Back to editing
          </button>
        )}
      </section>
    );
  }

  if (!selected) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-sm text-on-surface-variant shadow-card">
        Your resume has no issues to fix.
      </section>
    );
  }

  const priorityBadge =
    selected.status === 'passing'
      ? 'bg-emerald-500/10 text-emerald-700'
      : selected.priority === 'high'
        ? 'bg-red-500/10 text-red-700'
        : 'bg-amber-500/10 text-amber-800';

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
      <div className="border-b border-outline-variant/25 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${priorityBadge}`}>
            {selected.status === 'passing'
              ? 'Looking good'
              : selected.priority === 'high'
                ? 'High priority'
                : 'Needs work'}
          </span>
          {selected.score != null && (
            <span className="text-xs font-semibold text-text-muted">{selected.score}/100</span>
          )}
          {scoreDelta !== 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Session {scoreDelta > 0 ? '+' : ''}
              {scoreDelta} pts
            </span>
          )}
        </div>
        <h2 className="mt-2.5 font-headline text-xl font-bold tracking-tight text-on-surface sm:text-2xl">
          {selected.label}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{selected.feedback}</p>
      </div>

      {selected.status === 'passing' ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-on-surface">No change needed</h3>
          <p className="mt-1.5 max-w-sm text-sm text-on-surface-variant">
            This area already meets the ATS bar. Pick a flagged item on the left to keep improving.
          </p>
        </div>
      ) : activeSuggestion ? (
        <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                Suggested rewrite
              </p>
              <h3 className="mt-1 text-base font-semibold text-on-surface">{activeSuggestion.title}</h3>
              {activeSuggestion.rationale && (
                <p className="mt-1 text-sm text-on-surface-variant">{activeSuggestion.rationale}</p>
              )}
            </div>
            {suggestions.length > 1 && (
              <div className="flex shrink-0 items-center rounded-xl border border-outline-variant/50 p-0.5">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-35"
                  onClick={onPrev}
                  disabled={activeIdx === 0}
                  aria-label="Previous suggestion"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center text-[11px] font-semibold tabular-nums text-text-muted">
                  {activeIdx + 1}/{suggestions.length}
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-35"
                  onClick={onNext}
                  disabled={activeIdx >= suggestions.length - 1}
                  aria-label="Next suggestion"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">Before</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
                {activeSuggestion.originalSnippet}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">After</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
                {activeSuggestion.proposedText}
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              Apply this change
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Regenerate
            </button>
            <p className="ml-auto text-[11px] text-text-muted">{meterLabel}</p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          {loading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm font-medium text-on-surface">Writing safer rewrites…</p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-on-surface">Generate AI suggestions</h3>
              <p className="mt-1.5 max-w-sm text-sm text-on-surface-variant">
                We’ll propose exact text swaps for this issue. You approve each one.
              </p>
              <button
                type="button"
                onClick={onGenerate}
                className="mt-5 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" />
                Generate suggestions
              </button>
              {!hasGeneratedOnce && (
                <p className="mt-3 max-w-xs text-[11px] text-text-muted">
                  Uses 1 Resume Studio credit. Nothing saves until you copy or Save.
                </p>
              )}
              {hasGeneratedOnce && <p className="mt-3 text-[11px] text-text-muted">{meterLabel}</p>}
              {error && (
                <div
                  role="alert"
                  className="mt-4 flex max-w-md items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-left text-sm text-red-700"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

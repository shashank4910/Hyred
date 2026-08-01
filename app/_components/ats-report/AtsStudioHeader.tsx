'use client';

import { ArrowLeft, Check, Copy, Loader2, Save, Undo2 } from 'lucide-react';
import { AtsScoreRing } from './AtsScoreRing';

const STEPS = [
  { n: 1, label: 'Scan resume' },
  { n: 2, label: 'Review issues' },
  { n: 3, label: 'Apply fixes' },
  { n: 4, label: 'Copy & apply' },
] as const;

export function AtsStudioHeader({
  score,
  scoreDelta,
  meterLabel,
  appliedCount,
  canUndo,
  canSave,
  saving,
  copied,
  onBack,
  onUndo,
  onSave,
  onCopy,
}: {
  score: number;
  scoreDelta: number;
  meterLabel: string;
  appliedCount: number;
  canUndo: boolean;
  canSave: boolean;
  saving: boolean;
  copied: boolean;
  onBack: () => void;
  onUndo: () => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const activeStep = appliedCount > 0 ? 3 : 2;

  return (
    <header className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-outline-variant/50 text-on-surface-variant transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            aria-label="Back to ATS score"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline text-2xl font-bold tracking-tight text-on-surface">
                Resume Fix Studio
              </h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">
              Pick an issue, approve the rewrite, watch your score climb.
            </p>
            <p className="mt-1.5 text-[11px] font-semibold text-primary">{meterLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <AtsScoreRing score={score} size={72} stroke={7} />
            {scoreDelta !== 0 && (
              <div className="text-xs">
                <p className="font-bold text-text-muted">Session</p>
                <p
                  className={`text-lg font-extrabold tabular-nums ${
                    scoreDelta > 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {scoreDelta > 0 ? '+' : ''}
                  {scoreDelta}
                </p>
              </div>
            )}
          </div>

          <div className="hidden h-12 w-px bg-outline-variant/40 sm:block" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant transition-colors duration-150 hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || saving}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-outline-variant/50 px-3 text-sm font-semibold text-on-surface-variant transition-colors duration-150 hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy resume'}
            </button>
          </div>
        </div>
      </div>

      <nav
        aria-label="Fix Studio steps"
        className="border-t border-outline-variant/25 bg-surface-container/40 px-4 py-3 sm:px-6"
      >
        <ol className="flex flex-wrap items-center gap-2 sm:gap-0">
          {STEPS.map((step, i) => {
            const done = step.n < activeStep;
            const current = step.n === activeStep;
            return (
              <li key={step.n} className="flex items-center gap-2 sm:flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                      current
                        ? 'bg-primary text-on-primary'
                        : done
                          ? 'bg-emerald-500 text-white'
                          : 'border border-outline-variant bg-surface-container-lowest text-text-muted'
                    }`}
                  >
                    {step.n}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      current ? 'text-primary' : done ? 'text-on-surface' : 'text-text-muted'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-2 hidden h-px flex-1 sm:block ${
                      done ? 'bg-emerald-400/60' : 'bg-outline-variant/50'
                    }`}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

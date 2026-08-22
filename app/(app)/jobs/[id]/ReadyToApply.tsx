'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Minus, Radar, ScanLine, ChevronDown, ShieldCheck } from 'lucide-react';
import type { StudioAnalysis, StudioRequirement } from '@/lib/match-studio';

type Phase = 'idle' | 'loading' | 'ready' | 'error';

const LOADER_STEPS = [
  'Reading the job',
  'Grading your evidence',
  'Recruiter review',
] as const;

/** Count a number up with an exponential ease-out — arrival feels earned. */
function useCountUp(target: number | null, active: boolean, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!active || target == null) {
      setValue(target ?? 0);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(2, -8 * t);
      setValue(Math.round((target ?? 0) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target, active, durationMs]);
  return value;
}

function ScoreBlock({
  label,
  score,
  meterClass,
  textClass,
}: {
  label: string;
  score: number | null;
  meterClass: string;
  textClass: string;
}) {
  const shown = useCountUp(score, score != null);
  return (
    <div className="min-w-[8.5rem] flex-1">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className={`mt-0.5 text-[2.6rem] font-extrabold leading-none tabular-nums ${textClass}`}>
        {score == null ? '–' : shown}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8" role="img"
        aria-label={`${label} score ${score ?? 'unavailable'} of 100`}>
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${meterClass}`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function StateIcon({ state }: { state: StudioRequirement['state'] }) {
  if (state === 'proven')
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-brand">
        <Check className="h-3 w-3 text-ink" strokeWidth={3} />
      </span>
    );
  if (state === 'inferred')
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100">
        <Radar className="h-3 w-3 text-orange-700" strokeWidth={2.5} />
      </span>
    );
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/5">
      <Minus className="h-3 w-3 text-muted" strokeWidth={2.5} />
    </span>
  );
}

export function ReadyToApply({
  matchId,
  staged,
  onStage,
  onUnstage,
  onOptimize,
  generating,
}: {
  matchId: string;
  staged: string[];
  onStage: (kw: string) => void;
  onUnstage: (kw: string) => void;
  onOptimize: (keywordsOverride?: string[]) => void;
  generating: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<StudioAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const analyze = useCallback(async () => {
    setPhase('loading');
    setStep(0);
    setErrorMsg('');
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setStep(1), 1600),
      setTimeout(() => setStep(2), 4200),
    ];
    try {
      const res = await fetch(`/api/match/${matchId}/studio`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'no_resume') {
          setErrorMsg('Upload your resume first, then come back for the fit check.');
        } else {
          setErrorMsg('The fit check could not run. Try again in a moment.');
        }
        setPhase('error');
        return;
      }
      setAnalysis(data as StudioAnalysis);
      setPhase('ready');
    } catch {
      setErrorMsg('Connection dropped mid-analysis. Try again.');
      setPhase('error');
    }
  }, [matchId]);

  const isStaged = (kw: string) =>
    staged.some((k) => k.toLowerCase() === kw.toLowerCase());

  const suggestions = (analysis?.requirements ?? [])
    .filter((r) => r.state === 'inferred' && r.suggestion)
    .sort((a, b) => (a.weight === 'must' ? -1 : 1) - (b.weight === 'must' ? -1 : 1))
    .slice(0, 3);

  const missingMustHaves = (analysis?.requirements ?? []).filter(
    (r) => r.state === 'absent' && r.weight === 'must',
  );

  const verdictTone =
    analysis && analysis.humanScore != null && analysis.humanScore >= 70
      ? 'text-ink'
      : 'text-on-surface-variant';

  function generate() {
    if (!analysis) return;
    const merged = [...analysis.preselected];
    for (const k of staged) {
      if (!merged.some((m) => m.toLowerCase() === k.toLowerCase())) merged.push(k);
    }
    onOptimize(merged.length > 0 ? merged : undefined);
  }

  return (
    <section
      aria-label="Fit check"
      className="mb-5 rounded-2xl border border-primary/15 bg-lime-brand/5 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <ScanLine className="h-4 w-4 text-primary" />
            Fit Check
          </h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Grades this job against your real experience, then tells you the truth about the gaps.
          </p>
        </div>
        {phase === 'idle' && (
          <button type="button" onClick={analyze} className="btn-primary text-sm">
            Run fit check
          </button>
        )}
        {phase === 'ready' && (
          <button
            type="button"
            onClick={analyze}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Re-run
          </button>
        )}
      </div>

      {/* Loading: a step rail that fills as the pipeline works */}
      {phase === 'loading' && (
        <div className="mt-5" aria-live="polite">
          <ol className="space-y-0">
            {LOADER_STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={label} className="flex items-start gap-3">
                  <span className="relative flex w-5 justify-center">
                    {i < LOADER_STEPS.length - 1 && (
                      <span
                        aria-hidden
                        className={`absolute top-5 h-7 w-px transition-colors duration-500 ${
                          done ? 'bg-primary' : 'bg-ink/10'
                        }`}
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-500 ${
                        done
                          ? 'border-primary bg-primary'
                          : active
                            ? 'animate-pulse border-primary bg-white'
                            : 'border-ink/10 bg-white'
                      }`}
                    >
                      {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  </span>
                  <span
                    className={`pt-0.5 text-sm ${
                      done || active ? 'font-medium text-ink' : 'text-muted'
                    }`}
                  >
                    {label}
                    {active && <span className="ml-1 text-muted">…</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">{errorMsg}</p>
          <button type="button" onClick={analyze} className="btn text-xs">
            Try again
          </button>
        </div>
      )}

      {phase === 'ready' && analysis && (
        <div className="mt-5">
          {/* Score strip */}
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <ScoreBlock
              label="Robot score"
              score={analysis.robotScore}
              meterClass="bg-lime-brand"
              textClass="text-ink"
            />
            <ScoreBlock
              label="Human score"
              score={analysis.humanScore}
              meterClass="bg-primary"
              textClass="text-primary"
            />
            <div className="min-w-[12rem] flex-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Recruiter verdict
              </p>
              <p className={`mt-1 text-sm leading-snug ${verdictTone}`}>
                {analysis.verdictLine || 'No verdict recorded.'}
              </p>
              {analysis.watchOuts.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {analysis.watchOuts.map((w) => (
                    <li key={w} className="text-xs leading-snug text-muted">
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Suggestions: inferred evidence, one tap to stage */}
          {suggestions.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                Found in your work — not written in your resume
              </p>
              <ul className="mt-2 divide-y divide-ink/5">
                {suggestions.map((r) => {
                  const on = isStaged(r.keyword);
                  return (
                    <li key={r.keyword} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">{r.keyword}</p>
                          {r.evidence && (
                            <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">
                              {r.evidence}
                            </p>
                          )}
                          {r.suggestion && (
                            <p className="mt-1.5 border-l-2 border-lime-brand pl-2.5 text-xs italic leading-snug text-on-surface-variant">
                              {r.suggestion}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => (on ? onUnstage(r.keyword) : onStage(r.keyword))}
                          className={
                            on
                              ? 'inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-ink/85'
                              : 'inline-flex items-center gap-1.5 rounded-full bg-lime-brand px-3.5 py-1.5 text-xs font-bold text-ink transition-transform duration-150 hover:-translate-y-px active:translate-y-0'
                          }
                          aria-pressed={on}
                        >
                          {on ? (
                            <>
                              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Staged — undo
                            </>
                          ) : (
                            'Weave in'
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Honest flags */}
          {missingMustHaves.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-xs leading-snug text-on-surface-variant">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                Required but absent, so we left them out:{' '}
                <span className="font-semibold">
                  {missingMustHaves.map((r) => r.keyword).join(', ')}
                </span>
                . Be ready to speak to them if interviewed.
              </span>
            </p>
          )}

          {/* Full checklist drawer */}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
          >
            {showAll ? 'Hide' : 'See'} all {analysis.requirements.length} checks
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
            />
          </button>
          {showAll && (
            <ul className="mt-2 divide-y divide-ink/5 rounded-xl border border-ink/8 bg-white px-3.5">
              {analysis.requirements.map((r) => (
                <li key={r.keyword} className="flex items-start gap-2.5 py-2.5">
                  <StateIcon state={r.state} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      {r.keyword}
                      <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted">
                        {r.weight === 'must' ? 'Required' : 'Nice to have'}
                      </span>
                    </p>
                    {r.evidence && r.state === 'inferred' && (
                      <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">
                        {r.evidence}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Primary action */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate tailored resume'}
            </button>
            <p className="text-xs text-muted">
              {analysis.preselected.length} proven keywords pre-selected for you.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

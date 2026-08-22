'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Minus, Radar, ChevronDown, Wand2, ShieldCheck } from 'lucide-react';
import type { StudioAnalysis, StudioRequirement } from '@/lib/match-studio';

type Phase = 'idle' | 'analyzing' | 'error' | 'ready';

const STEPS = [
  'Reading the job',
  'Checking your experience',
  'Picking your keywords',
] as const;

/** Count a number up with an exponential ease-out - arrival feels earned. */
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

function ScoreLine({
  label,
  score,
  barClass,
}: {
  label: string;
  score: number | null;
  barClass: string;
}) {
  const shown = useCountUp(score, score != null);
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${label} ${score ?? 'unavailable'} of 100`}>
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-ink/8">
        <span
          className={`block h-full rounded-full transition-[width] duration-700 ease-out ${barClass}`}
          style={{ width: `${score ?? 0}%` }}
        />
      </span>
      <span className="text-sm font-bold tabular-nums text-ink">
        {score == null ? '-' : shown}
      </span>
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

/**
 * One door, one button. The analysis is the invisible brain behind
 * "Tailor my resume" - the user never has to understand a "fit check".
 * Before a resume exists: single CTA that analyzes, picks keywords, and
 * generates. After: the panel becomes a plain-language results header with
 * add/remove suggestions.
 */
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

  const analyze = useCallback(async (): Promise<StudioAnalysis | null> => {
    setPhase('analyzing');
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
        setErrorMsg(
          data?.error === 'no_resume'
            ? 'Upload your resume first, then come back.'
            : 'We could not analyze this job. You can still tailor your resume below.',
        );
        setPhase('error');
        return null;
      }
      setAnalysis(data as StudioAnalysis);
      setPhase('ready');
      return data as StudioAnalysis;
    } catch {
      setErrorMsg('Connection dropped mid-analysis. You can still tailor your resume below.');
      setPhase('error');
      return null;
    }
  }, [matchId]);

  /** Tailor uses the smart keyword set when the check has run. */
  function tailorNow() {
    const preselected = analysis?.preselected;
    if (preselected && preselected.length > 0) {
      onOptimize(preselected);
    } else if (staged.length > 0) {
      onOptimize(staged);
    } else {
      onOptimize();
    }
  }

  const isStaged = (kw: string) =>
    staged.some((k) => k.toLowerCase() === kw.toLowerCase());

  const suggestions = (analysis?.requirements ?? [])
    .filter((r) => r.state === 'inferred' && r.suggestion)
    .sort((a, b) => (a.weight === 'must' ? -1 : 1) - (b.weight === 'must' ? -1 : 1))
    .slice(0, 3);

  const missingMustHaves = (analysis?.requirements ?? []).filter(
    (r) => r.state === 'absent' && r.weight === 'must',
  );

  const weak = Math.min(analysis?.robotScore ?? 100, analysis?.humanScore ?? 100);
  const headline =
    weak >= 70
      ? "You're a strong fit for this job"
      : weak >= 50
        ? 'Almost there - a few quick wins below'
        : "This one's a stretch - being honest with you";

  return (
    <section
      aria-label="Tailor resume"
      className="mb-5 rounded-2xl border border-primary/15 bg-lime-brand/5 p-5"
    >
      {/* The panel is always visible and self-explanatory */}
      {phase !== 'analyzing' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Wand2 className="h-4 w-4 text-primary" />
              How well do you fit this job?
            </h3>
            <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">
              We check the job's requirements against your real experience -
              and tell you the truth about the gaps.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phase !== 'ready' && (
              <button type="button" onClick={analyze} className="btn text-xs">
                Check my fit
              </button>
            )}
            {phase === 'ready' && (
              <button
                type="button"
                onClick={analyze}
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Re-check
              </button>
            )}
            <button
              type="button"
              onClick={tailorNow}
              disabled={generating}
              className="btn-primary text-xs disabled:opacity-60"
            >
              {generating ? 'Building...' : 'Tailor my resume'}
            </button>
          </div>
        </div>
      )}

      {/* Analyzing: a step rail that fills as the pipeline works */}
      {phase === 'analyzing' && (
        <div aria-live="polite">
          <ol>
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={label} className="flex items-start gap-3">
                  <span className="relative flex w-5 justify-center">
                    {i < STEPS.length - 1 && (
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
                    {active && <span className="ml-1 text-muted">...</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {generating && (
            <p className="mt-3 text-sm font-medium text-primary">Writing your resume...</p>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-4">
          <p className="text-xs text-on-surface-variant">{errorMsg}</p>
          <button type="button" onClick={analyze} className="btn text-xs">
            Try again
          </button>
        </div>
      )}

      {/* After: plain-language results */}
      {phase === 'ready' && analysis && (
        <div className="mt-4 border-t border-primary/10 pt-4">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold tracking-tight text-ink">{headline}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <ScoreLine label="ATS match" score={analysis.robotScore} barClass="bg-lime-brand" />
              <ScoreLine label="Recruiter appeal" score={analysis.humanScore} barClass="bg-primary" />
            </div>
            {analysis.verdictLine && (
              <p className="mt-2 text-sm leading-snug text-on-surface-variant">
                {analysis.verdictLine}
              </p>
            )}
          </div>

          {/* Quick wins: add what your work already proves */}
          {suggestions.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                Quick wins - you have this experience, it's just not written down
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
                              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Added - undo
                            </>
                          ) : (
                            'Add to resume'
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {staged.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const merged = [...analysis.preselected];
                    for (const k of staged) {
                      if (!merged.some((m) => m.toLowerCase() === k.toLowerCase())) {
                        merged.push(k);
                      }
                    }
                    onOptimize(merged);
                  }}
                  disabled={generating}
                  className="btn-primary mt-3 text-sm disabled:opacity-60"
                >
                  {generating
                    ? 'Updating...'
                    : `Update resume with ${staged.length} addition${staged.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          )}

          {missingMustHaves.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-xs leading-snug text-on-surface-variant">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                The job also asks for{' '}
                <span className="font-semibold">
                  {missingMustHaves.map((r) => r.keyword).join(', ')}
                </span>
                . We left those out because your resume doesn't show them - be ready to
                speak to them in an interview.
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
          >
            {showAll ? 'Hide' : 'Show'} the full {analysis.requirements.length}-point job check
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
                    {r.evidence && (
                      <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">
                        {r.evidence}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

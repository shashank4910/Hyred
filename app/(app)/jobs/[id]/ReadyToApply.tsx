'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Wand2, ShieldCheck, Sparkles } from 'lucide-react';
import type { StudioAnalysis, ProposedChange } from '@/lib/match-studio';

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

/**
 * One door, one button. The analysis is the invisible brain behind
 * "Tailor my resume" - the user never has to understand a "fit check".
 * Before a resume exists: single CTA that analyzes, picks keywords, and
 * generates. After: the panel becomes a plain-language results header with
 * add/remove suggestions.
 */
export function ReadyToApply({
  matchId,
  onOptimize,
  generating,
  onAnalysis,
}: {
  matchId: string;
  /** Apply the tailorable resume. `selected` = keywords to weave in; `excluded` = keywords to keep OUT (skipped reframes). */
  onOptimize: (opts?: { selected?: string[]; excluded?: string[] }) => void;
  generating: boolean;
  /** Notifies the parent (KeywordManager wiring) when an analysis lands. */
  onAnalysis?: (analysis: StudioAnalysis) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<StudioAnalysis | null>(null);
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  // Accept/skip state for each reframe, keyed by change id. Missing warnings
  // are never accept-able (you don't claim a tool you lack), so only reframes
  // appear here. Default: reframes are pre-accepted; the user can skip any.
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState('');
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
      // The analysis runs several LLM calls server-side; Vercel can return a
      // non-JSON gateway error (502/504) when it's slow. Detect that so we can
      // show a truthful message instead of a generic "connection dropped".
      const rawText = await res.text();
      let data: { error?: string } | (StudioAnalysis & { changes?: ProposedChange[] }) | null = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        setErrorMsg(
          'The analysis timed out on our side. You can still tailor your resume below.',
        );
        setPhase('error');
        return null;
      }
      if (!res.ok) {
        setErrorMsg(
          (data as { error?: string } | null)?.error === 'no_resume'
            ? 'Upload your resume first, then come back.'
            : 'We could not analyze this job. You can still tailor your resume below.',
        );
        setPhase('error');
        return null;
      }
      setAnalysis(data as StudioAnalysis);
      const proposed = (data as StudioAnalysis & { changes?: ProposedChange[] }).changes ?? [];
      setChanges(proposed);
      // Pre-accept every reframe (they reflect real, unwritten experience). Missing
      // warnings are not in the map because they are never accept-able.
      setDecisions(
        Object.fromEntries(
          proposed
            .filter((c) => c.kind === 'reframe')
            .map((c) => [c.id, true]),
        ),
      );
      setPhase('ready');
      onAnalysis?.(data as StudioAnalysis);
      return data as StudioAnalysis;
    } catch {
      setErrorMsg('There was a connection problem. You can still tailor your resume below.');
      setPhase('error');
      return null;
    }
  }, [matchId, onAnalysis]);

  /** Which accepted reframes should be woven in (their keywords). */
  const acceptedReframes = changes.filter(
    (c) => c.kind === 'reframe' && decisions[c.id],
  );

  /**
   * Tailor my resume. If the analysis has succeeded, the proposed changes are
   * already on screen — the user confirms each then hits Apply. If the analysis
   * failed or hasn't run (session 46's "build anyway" promise), fall straight
   * to optimization with whatever is staged so a model hiccup can never dead-end
   * the user. We never block tailoring on a failed analysis.
   */
  function tailorNow() {
    if (analysis) return; // review is already visible; user taps Apply to confirm
    analyze();
  }

  /** Apply the accepted changes via the parent. Skipped reframes become exclusions. */
  function applyChanges() {
    const reframes = changes.filter((c) => c.kind === 'reframe');
    const selected = reframes.filter((c) => decisions[c.id]).map((c) => c.keyword);
    const excluded = reframes.filter((c) => !decisions[c.id]).map((c) => c.keyword);
    onOptimize({ selected, excluded });
  }

  const missingMustHaves = changes.filter((c) => c.kind === 'missing');

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
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={analyze} className="btn text-xs">
              Try again
            </button>
            {/* Build anyway — a failed analysis must never dead-end the user.
                Weave the staged keywords without a scored review. */}
            <button type="button" onClick={() => onOptimize()} className="btn-primary text-xs">
              Tailor anyway
            </button>
          </div>
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

          {/* Review summary: how many changes to confirm before tailoring */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
              Suggested changes
            </p>
            <ul className="mt-2 divide-y divide-ink/5">
              {changes
                .filter((c) => c.kind === 'reframe')
                .map((c) => {
                  const on = !!decisions[c.id];
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">{c.keyword}</p>
                          {c.suggested && (
                            <p className="mt-1 text-xs italic leading-snug text-on-surface-variant">
                              {c.suggested}
                            </p>
                          )}
                          {c.evidence && (
                            <p className="mt-0.5 text-xs leading-snug text-on-surface-variant">
                              Why: {c.evidence}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDecisions((prev) => ({ ...prev, [c.id]: !on }))}
                          className={
                            on
                              ? 'inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-ink/85'
                              : 'inline-flex items-center gap-1.5 rounded-full bg-surface/60 px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-ink/85 hover:text-white'
                          }
                          aria-pressed={on}
                        >
                          {on ? (
                            <>
                              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Will add
                            </>
                          ) : (
                            'Skip'
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>

            {missingMustHaves.length > 0 && (
              <p className="mt-3 flex items-start gap-2 text-xs leading-snug text-on-surface-variant">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  The job also asks for{' '}
                  <span className="font-semibold">
                    {missingMustHaves.map((c) => c.keyword).join(', ')}
                  </span>
                  . We recommend leaving those out — your resume doesn't show them, so
                  claiming them would hurt. Be ready to speak to them in an interview.
                </span>
              </p>
            )}

            <button
              type="button"
              onClick={applyChanges}
              disabled={generating}
              className="btn-primary mt-4 text-sm disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating
                ? 'Building...'
                : `Tailor my resume with ${acceptedReframes.length} change${acceptedReframes.length === 1 ? '' : 's'}`}
            </button>
            </div>
          </div>
        )}
    </section>
  );
}

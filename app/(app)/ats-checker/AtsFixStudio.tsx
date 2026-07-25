'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Sparkles,
  Undo2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import {
  checkAtsCompatibility,
  type AtsCheckResult,
} from '@/lib/ats-checker';
import {
  applySuggestion,
  findSnippetRange,
  listAtsWeaknesses,
  undoLastFix,
  type AppliedFix,
  type AtsFixSuggestion,
  type AtsFixWeakness,
} from '@/lib/ats-fix';

type PreviewMode = 'updated' | 'original';

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function ScoreChip({ score, delta }: { score: number; delta: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-2xl font-bold tabular-nums ${scoreTone(score)}`}>{score}</span>
      <span className="text-xs text-text-muted">/100</span>
      {delta !== 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            delta > 0
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-red-500/10 text-red-600'
          }`}
        >
          {delta > 0 ? '+' : ''}
          {delta}
        </span>
      )}
    </div>
  );
}

function HighlightedResume({
  text,
  highlight,
  mode,
}: {
  text: string;
  highlight: { start: number; end: number; kind: 'needs' | 'fixed' } | null;
  mode: PreviewMode;
}) {
  if (!highlight || mode === 'original') {
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-on-surface/90">
        {text}
      </pre>
    );
  }

  const before = text.slice(0, highlight.start);
  const mid = text.slice(highlight.start, highlight.end);
  const after = text.slice(highlight.end);
  const midClass =
    highlight.kind === 'fixed'
      ? 'bg-primary/15 ring-1 ring-primary/30 rounded-sm'
      : 'bg-amber-500/15 ring-1 ring-amber-500/30 rounded-sm';

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-on-surface/90">
      {before}
      <mark className={`${midClass} text-inherit px-0.5`}>{mid}</mark>
      {after}
    </pre>
  );
}

export function AtsFixStudio({
  initialResume,
  initialResult,
  jobDescription,
  onClose,
}: {
  initialResume: string;
  initialResult: AtsCheckResult;
  jobDescription?: string;
  onClose: (next?: { resume: string; result: AtsCheckResult }) => void;
}) {
  const [originalResume] = useState(initialResume);
  const [workingResume, setWorkingResume] = useState(initialResume);
  const [baselineScore] = useState(initialResult.overallScore);
  const [result, setResult] = useState(initialResult);
  const [applied, setApplied] = useState<AppliedFix[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('updated');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AtsFixSuggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [usageLabel, setUsageLabel] = useState<string | null>(null);
  const [lastHighlight, setLastHighlight] = useState<{
    start: number;
    end: number;
    kind: 'needs' | 'fixed';
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const weaknesses = useMemo(() => listAtsWeaknesses(result), [result]);
  const needsWork = weaknesses.filter((w) => w.status === 'needs_work');
  const passing = weaknesses.filter((w) => w.status === 'passing');

  const selected: AtsFixWeakness | null =
    weaknesses.find((w) => w.id === selectedId) ?? needsWork[0] ?? weaknesses[0] ?? null;

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const activeSuggestion = suggestions[activeIdx] ?? null;
  useEffect(() => {
    if (!activeSuggestion || previewMode !== 'updated') return;
    const range = findSnippetRange(workingResume, activeSuggestion.originalSnippet);
    if (range) {
      setLastHighlight({ start: range.start, end: range.end, kind: 'needs' });
    }
  }, [activeSuggestion, workingResume, previewMode]);

  const scoreDelta = result.overallScore - baselineScore;

  const rescore = useCallback(
    (text: string) => {
      const next = checkAtsCompatibility(text, undefined, jobDescription || undefined);
      setResult(next);
      return next;
    },
    [jobDescription],
  );

  const fetchSuggestions = useCallback(
    async (weakness: AtsFixWeakness, regenerate: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/ats-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resume_text: workingResume,
            weakness_id: weakness.id,
            criterion_key: weakness.criterionKey,
            feedback: weakness.feedback,
            missing_keyword: weakness.missingKeyword,
            job_description: jobDescription || undefined,
            avoid_proposed: regenerate
              ? suggestions.map((s) => s.proposedText).slice(0, 5)
              : undefined,
          }),
        });
        const data = await res.json();
        if (res.status === 402) {
          setQuotaBlocked(true);
          setError(data.message ?? 'Resume Studio quota used up.');
          setSuggestions([]);
          return;
        }
        if (!res.ok) {
          setError(data.error ?? 'Could not generate fixes.');
          return;
        }
        const list = (data.suggestions ?? []) as AtsFixSuggestion[];
        setSuggestions(list);
        setActiveIdx(0);
        if (data.usage?.limit != null) {
          setUsageLabel(`${data.usage.remaining ?? 0} of ${data.usage.limit} Resume Studio fixes left`);
        }
        if (list[0]) {
          const range = findSnippetRange(workingResume, list[0].originalSnippet);
          if (range) {
            setLastHighlight({ start: range.start, end: range.end, kind: 'needs' });
          }
        } else {
          setError('No safe fixes found for this item. Try another weakness.');
        }
      } catch (e) {
        setError((e as Error).message || 'Network error.');
      } finally {
        setLoading(false);
      }
    },
    [workingResume, jobDescription, suggestions],
  );

  const onSelectWeakness = (w: AtsFixWeakness) => {
    setSelectedId(w.id);
    setSuggestions([]);
    setActiveIdx(0);
    setError(null);
    setLastHighlight(null);
  };

  const handleApply = () => {
    if (!activeSuggestion) return;
    const before = workingResume;
    const outcome = applySuggestion(workingResume, activeSuggestion);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setApplied((prev) => [...prev, { suggestion: activeSuggestion, beforeResume: before }]);
    setWorkingResume(outcome.resume);
    rescore(outcome.resume);
    setLastHighlight({ start: outcome.start, end: outcome.end, kind: 'fixed' });
    setPreviewMode('updated');
    setSuggestions((prev) => prev.filter((s) => s.id !== activeSuggestion.id));
    setActiveIdx(0);
    setError(null);
  };

  const handleUndo = () => {
    const undone = undoLastFix(applied);
    if (!undone) return;
    setApplied(undone.applied);
    setWorkingResume(undone.resume);
    rescore(undone.resume);
    setLastHighlight(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(workingResume);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const previewText = previewMode === 'original' ? originalResume : workingResume;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/40 bg-surface-card px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => onClose({ resume: workingResume, result })}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to score
        </button>
        <div className="flex items-center gap-4">
          <ScoreChip score={result.overallScore} delta={scoreDelta} />
          {usageLabel && <span className="hidden text-[11px] text-text-muted sm:inline">{usageLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={applied.length === 0}
            className="btn-ghost text-sm disabled:opacity-40"
            title="Undo last apply"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </button>
          <button type="button" onClick={handleCopy} className="btn-ghost text-sm">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : null}
            {copied ? 'Copied' : 'Copy resume'}
          </button>
        </div>
      </div>

      {/* 3 panes */}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Left: weaknesses */}
        <aside className="rounded-2xl border border-outline-variant/40 bg-surface-card p-3 shadow-sm max-h-[70vh] overflow-y-auto">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Needs work · {needsWork.length}
          </p>
          <ul className="space-y-1">
            {needsWork.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onSelectWeakness(w)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected?.id === w.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-surface-container text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{w.label}</span>
                    {w.score != null && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                          w.priority === 'high'
                            ? 'bg-red-500/10 text-red-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {w.score}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {passing.length > 0 && (
            <>
              <p className="mt-4 px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Passing · {passing.length}
              </p>
              <ul className="space-y-1">
                {passing.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => onSelectWeakness(w)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant ${
                        selected?.id === w.id ? 'bg-emerald-500/10 text-emerald-700' : 'hover:bg-surface-container'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        {w.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        {/* Center: suggestion */}
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm flex flex-col min-h-[420px]">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
                    {selected.status === 'needs_work' ? 'Needs work' : 'Passing'}
                    {selected.priority === 'high' ? ' · High' : selected.priority === 'medium' ? ' · Medium' : ' · Low'}
                  </p>
                  <h2 className="mt-1 text-headline-md font-bold text-on-surface">{selected.label}</h2>
                  <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">{selected.feedback}</p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-surface-card to-secondary-container/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI fix for this weakness
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Uses your Resume Studio quota. Changes stay in this session until you copy them.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading || quotaBlocked}
                    onClick={() => fetchSuggestions(selected, false)}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {suggestions.length ? 'Refresh suggestions' : 'See fixes'}
                  </button>
                  {suggestions.length > 0 && (
                    <button
                      type="button"
                      disabled={loading || quotaBlocked}
                      onClick={() => fetchSuggestions(selected, true)}
                      className="btn-ghost text-sm border border-outline-variant/40 disabled:opacity-50"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Regenerate
                    </button>
                  )}
                </div>
                {quotaBlocked && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    Quota reached — upgrade Premium for more Resume Studio fixes.
                  </p>
                )}
              </div>

              {error && (
                <p className="mt-3 inline-flex items-start gap-1.5 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              {activeSuggestion && (
                <div className="mt-4 flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-on-surface">{activeSuggestion.title}</h3>
                    {suggestions.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="btn-ghost p-1.5"
                          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                          disabled={activeIdx === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs tabular-nums text-text-muted">
                          {activeIdx + 1}/{suggestions.length}
                        </span>
                        <button
                          type="button"
                          className="btn-ghost p-1.5"
                          onClick={() => setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1))}
                          disabled={activeIdx >= suggestions.length - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {activeSuggestion.rationale && (
                    <p className="text-sm text-on-surface-variant">{activeSuggestion.rationale}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1">Current</p>
                      <p className="text-xs font-mono text-on-surface/80 whitespace-pre-wrap">
                        {activeSuggestion.originalSnippet}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Suggested</p>
                      <p className="text-xs font-mono text-on-surface/80 whitespace-pre-wrap">
                        {activeSuggestion.proposedText}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={handleApply} className="btn-primary w-full sm:w-auto">
                    <Check className="h-4 w-4" />
                    Apply this fix
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">No weaknesses to fix — nice work.</p>
          )}
        </section>

        {/* Right: live preview */}
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm flex flex-col min-h-[420px] overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 px-4 py-2.5">
            <div className="inline-flex rounded-full bg-surface-container p-0.5">
              <button
                type="button"
                onClick={() => setPreviewMode('updated')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  previewMode === 'updated' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                Updated{applied.length ? ` · ${applied.length}` : ''}
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('original')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  previewMode === 'original' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                Original
              </button>
            </div>
            <span className="text-[11px] text-text-muted">In-session only</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 max-h-[62vh] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent">
            <HighlightedResume
              text={previewText}
              highlight={previewMode === 'updated' ? lastHighlight : null}
              mode={previewMode}
            />
          </div>
          <div className="flex items-center gap-4 border-t border-outline-variant/30 px-4 py-2 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Needs fixing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Fixed
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

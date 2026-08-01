'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
  AlertTriangle,
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
import { parseResumeDocument, lineIsHighlighted } from '@/lib/resume-document';
import { PremiumUpgradePanel } from '@/app/_components/PremiumUpgradePanel';
import {
  formatResumeStudioMeter,
  type ResumeStudioUsage,
} from '@/lib/premium-upgrade';

type PreviewMode = 'updated' | 'original';

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function ScoreChip({ score, delta }: { score: number; delta: number }) {
  return (
    <div className="min-w-[148px]">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-extrabold tabular-nums leading-none ${scoreTone(score)}`}>
            {score}
          </span>
          <span className="text-[11px] font-semibold text-text-muted">ATS score</span>
        </div>
        {delta !== 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
              delta > 0
                ? 'bg-emerald-500/10 text-emerald-700'
                : 'bg-red-500/10 text-red-700'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container"
        role="progressbar"
        aria-label="ATS score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function HighlightMark({
  active,
  kind,
  children,
}: {
  active: boolean;
  kind: 'needs' | 'fixed';
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  const cls =
    kind === 'fixed'
      ? 'bg-primary/12 shadow-[inset_3px_0_0_theme(colors.primary)] ring-1 ring-primary/20'
      : 'bg-amber-400/15 shadow-[inset_3px_0_0_theme(colors.amber.400)] ring-1 ring-amber-400/25';
  return (
    <mark className={`-mx-1.5 rounded-[3px] px-1.5 text-inherit ${cls}`}>{children}</mark>
  );
}

/**
 * Renders resume text as a real-looking document: name header, contact row,
 * section headings with rules, entry headings, and clean bullets. The changed
 * line stays highlighted via character-range intersection.
 */
function ResumeDocumentView({
  text,
  highlight,
  mode,
}: {
  text: string;
  highlight: { start: number; end: number; kind: 'needs' | 'fixed' } | null;
  mode: PreviewMode;
}) {
  const doc = useMemo(() => parseResumeDocument(text), [text]);
  const hl = mode === 'updated' ? highlight : null;
  const kind = highlight?.kind ?? 'fixed';

  return (
    <div className="font-serif text-[12.5px] leading-relaxed text-[#1a2433]">
      {/* Header */}
      {doc.name && (
        <h1 className="text-center text-[22px] font-bold uppercase tracking-[0.12em] text-[#0f1a2b]">
          <HighlightMark active={lineIsHighlighted(doc.name, hl)} kind={kind}>
            {doc.name.text}
          </HighlightMark>
        </h1>
      )}
      {doc.contact.length > 0 && (
        <p className="mt-1.5 text-center text-[11px] leading-relaxed text-[#4a5568]">
          {doc.contact.map((c, i) => (
            <span key={c.start}>
              {i > 0 && <span className="mx-1.5 text-[#c3ccd8]">•</span>}
              <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                {c.text}
              </HighlightMark>
            </span>
          ))}
        </p>
      )}

      {(doc.name || doc.contact.length > 0) && (
        <div className="my-4 h-px bg-[#dbe1ea]" />
      )}

      <div className="space-y-5">
        {doc.sections.map((section, si) => (
          <section key={section.heading?.start ?? `s${si}`}>
            {section.heading && (
              <h2 className="mb-2 border-b border-[#c9d2de] pb-1 text-[12px] font-bold uppercase tracking-[0.14em] text-[#0f1a2b]">
                <HighlightMark active={lineIsHighlighted(section.heading, hl)} kind={kind}>
                  {section.heading.text}
                </HighlightMark>
              </h2>
            )}
            <div className="space-y-1.5">
              {section.lines.map((line) => {
                const active = lineIsHighlighted(line, hl);
                if (line.kind === 'entryHeading') {
                  const parts = line.text.split('|').map((p) => p.trim());
                  return (
                    <div key={line.start} className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-[#16233a]">
                        <HighlightMark active={active} kind={kind}>
                          {parts[0]}
                          {parts.length > 1 && (
                            <span className="font-normal text-[#3c4a60]"> · {parts.slice(1, -1).join(' · ')}</span>
                          )}
                        </HighlightMark>
                      </span>
                      {parts.length > 1 && (
                        <span className="text-[11px] italic text-[#5a6678]">{parts[parts.length - 1]}</span>
                      )}
                    </div>
                  );
                }
                if (line.kind === 'bullet') {
                  return (
                    <div key={line.start} className="flex gap-2 pl-1">
                      <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[#7a8698]" aria-hidden="true" />
                      <p className="flex-1">
                        <HighlightMark active={active} kind={kind}>
                          {line.content}
                        </HighlightMark>
                      </p>
                    </div>
                  );
                }
                if (line.kind === 'skill') {
                  return (
                    <p key={line.start} className="leading-relaxed">
                      <HighlightMark active={active} kind={kind}>
                        {line.label ? (
                          <>
                            <span className="font-semibold text-[#16233a]">{line.label}:</span>{' '}
                            <span>{line.value}</span>
                          </>
                        ) : (
                          line.text
                        )}
                      </HighlightMark>
                    </p>
                  );
                }
                return (
                  <p key={line.start} className="leading-relaxed text-[#2a3547]">
                    <HighlightMark active={active} kind={kind}>
                      {line.text}
                    </HighlightMark>
                  </p>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function AtsFixStudio({
  initialResume,
  initialResult,
  jobDescription,
  originalFile = null,
  originalFilename = null,
  onClose,
}: {
  initialResume: string;
  initialResult: AtsCheckResult;
  jobDescription?: string;
  /** The real uploaded CV so the Original tab shows the true document. */
  originalFile?: { url: string; kind: 'pdf' | 'image' } | null;
  originalFilename?: string | null;
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
  const [usage, setUsage] = useState<ResumeStudioUsage | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showSaveUpgrade, setShowSaveUpgrade] = useState(false);
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
  const meterLabel = usage ? formatResumeStudioMeter(usage, plan) : 'Checking credits…';
  const scoreLiftProof =
    applied.length > 0
      ? `Your score moved ${baselineScore} → ${result.overallScore} with ${applied.length} applied change${applied.length === 1 ? '' : 's'}`
      : null;

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/premium/usage');
      if (!res.ok) return;
      const data = await res.json();
      setPlan(data.plan ?? 'free');
      if (data.resume_studio) {
        setUsage(data.resume_studio);
        if (
          data.resume_studio.remaining != null &&
          data.resume_studio.remaining <= 0
        ) {
          setQuotaBlocked(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

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
      setShowSaveUpgrade(false);
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
          setSuggestions([]);
          if (data.usage) setUsage(data.usage);
          return;
        }
        if (!res.ok) {
          setError(data.error ?? 'Could not generate fixes.');
          return;
        }
        const list = (data.suggestions ?? []) as AtsFixSuggestion[];
        setSuggestions(list);
        setActiveIdx(0);
        setHasGeneratedOnce(true);
        if (data.usage) setUsage(data.usage);
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
    setShowSaveUpgrade(false);
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

  const handleSaveToProfile = async () => {
    setSaveMessage(null);
    setShowSaveUpgrade(false);
    if (plan === 'free') {
      setShowSaveUpgrade(true);
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/profile/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: workingResume }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setShowSaveUpgrade(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not save resume.');
      setSaveMessage(data.message ?? 'Resume saved to your Hyred profile.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const previewText = previewMode === 'original' ? originalResume : workingResume;

  return (
    <div className="space-y-5 animate-slide-up">
      <header className="overflow-hidden rounded-[1.5rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => onClose({ resume: workingResume, result })}
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
              aria-label="Back to ATS score"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-headline text-xl font-bold tracking-tight text-on-surface">
                  Resume Fix Studio
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" />
                  AI assisted
                </span>
              </div>
              <p className="mt-1 max-w-xl text-sm text-on-surface-variant">
                Review each weakness, approve only the changes you want, and watch your score improve.
              </p>
              <p className="mt-2 text-[11px] font-semibold text-primary">{meterLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <ScoreChip score={result.overallScore} delta={scoreDelta} />
            <div className="h-10 w-px bg-outline-variant/50" aria-hidden="true" />
            <button
              type="button"
              onClick={handleUndo}
              disabled={applied.length === 0}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant transition-colors duration-200 hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
              title="Undo last applied fix"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </button>
            <button
              type="button"
              onClick={handleSaveToProfile}
              disabled={savingProfile || workingResume === originalResume}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
              title="Save to Hyred profile (Premium)"
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary px-4 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy updated resume'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-outline-variant/30 bg-surface-container/45 px-5 py-2.5 text-[11px] font-medium text-on-surface-variant sm:px-6">
          <span className="inline-flex items-center gap-1.5 text-primary">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">1</span>
            Choose an issue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-[10px] font-bold">2</span>
            Review the rewrite
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-[10px] font-bold">3</span>
            Apply and re-score
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Apply never uses a credit · session only until you copy or save
          </span>
        </div>
      </header>

      {saveMessage && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          {saveMessage}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card xl:sticky xl:top-24">
          <div className="border-b border-outline-variant/30 px-4 py-3.5">
            <p className="text-sm font-bold text-on-surface">Resume health</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {needsWork.length} {needsWork.length === 1 ? 'area needs' : 'areas need'} attention
            </p>
          </div>
          <div className="max-h-[58vh] overflow-y-auto p-2.5">
            <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
              Improve first
            </p>
            <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
              {needsWork.map((w) => {
                const isActive = selected?.id === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => onSelectWeakness(w)}
                      aria-pressed={isActive}
                      className={`group relative w-full cursor-pointer rounded-xl px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-on-surface hover:bg-surface-container'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold">{w.label}</span>
                        {w.score != null && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                              w.priority === 'high'
                                ? 'bg-red-500/10 text-red-700'
                                : 'bg-amber-500/10 text-amber-700'
                            }`}
                          >
                            {w.score}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 truncate text-[11px] ${isActive ? 'text-primary/75' : 'text-text-muted'}`}>
                        {w.priority === 'high' ? 'High impact' : w.priority === 'medium' ? 'Medium impact' : 'Quick polish'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            {passing.length > 0 && (
              <>
                <p className="mt-4 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                  Already strong
                </p>
                <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-1">
                  {passing.map((w) => {
                    const isActive = selected?.id === w.id;
                    return (
                      <li key={w.id}>
                        <button
                          type="button"
                          onClick={() => onSelectWeakness(w)}
                          aria-pressed={isActive}
                          className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-800'
                              : 'text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                              <span className="truncate">{w.label}</span>
                            </span>
                            {w.score != null && (
                              <span className="text-[10px] font-bold tabular-nums text-emerald-700">{w.score}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </aside>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
          <section className="flex min-h-[500px] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card">
            {quotaBlocked || showSaveUpgrade ? (
              <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
                <PremiumUpgradePanel
                  feature="resume_studio"
                  proof={scoreLiftProof}
                  secondaryLabel="Copy current resume"
                  onSecondary={handleCopy}
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
                    onClick={() => setShowSaveUpgrade(false)}
                    className="mt-3 text-sm font-semibold text-on-surface-variant hover:text-primary"
                  >
                    Back to editing
                  </button>
                )}
              </div>
            ) : selected ? (
              <>
                <div className="border-b border-outline-variant/30 px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        selected.status === 'needs_work'
                          ? selected.priority === 'high'
                            ? 'bg-red-500/10 text-red-700'
                            : 'bg-amber-500/10 text-amber-700'
                          : 'bg-emerald-500/10 text-emerald-700'
                      }`}
                    >
                      {selected.status === 'needs_work'
                        ? `${selected.priority} impact`
                        : 'Looking good'}
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
                  <h2 className="mt-2 font-headline text-xl font-bold tracking-tight text-on-surface">
                    {selected.label}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                    {selected.feedback}
                  </p>
                </div>

                {selected.status === 'passing' ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 font-semibold text-on-surface">No change needed here</h3>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-on-surface-variant">
                      This section already meets the ATS benchmark. Choose an issue under “Improve first” to keep working.
                    </p>
                  </div>
                ) : activeSuggestion ? (
                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                          Suggested improvement
                        </p>
                        <h3 className="mt-1 font-semibold text-on-surface">{activeSuggestion.title}</h3>
                      </div>
                      {suggestions.length > 1 && (
                        <div className="flex shrink-0 items-center rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-0.5">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-35"
                            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
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
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-35"
                            onClick={() => setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1))}
                            disabled={activeIdx >= suggestions.length - 1}
                            aria-label="Next suggestion"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {activeSuggestion.rationale && (
                      <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                        {activeSuggestion.rationale}
                      </p>
                    )}

                    <div className="mt-5 space-y-3">
                      <div className="rounded-xl border border-red-500/15 bg-red-500/[0.035] p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">
                          Before
                        </p>
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-on-surface/75 line-through decoration-red-400/50">
                          {activeSuggestion.originalSnippet}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.045] p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                          After
                        </p>
                        <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-on-surface">
                          {activeSuggestion.proposedText}
                        </p>
                      </div>
                    </div>

                    {error && (
                      <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    <div className="mt-auto flex flex-col-reverse gap-2 border-t border-outline-variant/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => fetchSuggestions(selected, true)}
                        className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        Try another rewrite
                      </button>
                      <button
                        type="button"
                        onClick={handleApply}
                        className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                      >
                        <Check className="h-4 w-4" />
                        Apply this change
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
                    </div>
                    <h3 className="mt-4 font-semibold text-on-surface">
                      {loading ? 'Building a safe rewrite…' : 'See a stronger version'}
                    </h3>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-on-surface-variant">
                      {loading
                        ? 'Hyred is finding a focused improvement without changing the facts in your resume.'
                        : 'Hyred will suggest a small, truth-preserving edit for this exact weakness.'}
                    </p>
                    {!loading && (
                      <button
                        type="button"
                        onClick={() => fetchSuggestions(selected, false)}
                        className="mt-5 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate suggestions
                      </button>
                    )}
                    {!hasGeneratedOnce && !loading && (
                      <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-text-muted">
                        Uses 1 Resume Studio credit. Changes stay in this session until you copy or save them.
                      </p>
                    )}
                    {hasGeneratedOnce && !loading && (
                      <p className="mt-3 text-[11px] text-text-muted">{meterLabel}</p>
                    )}
                    {error && (
                      <div role="alert" className="mt-4 flex max-w-md items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-left text-sm text-red-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {error}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-on-surface-variant">
                Your resume has no issues to fix.
              </div>
            )}
          </section>

          <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Resume preview</h3>
                  <p className="text-[10px] text-text-muted">
                    {previewMode === 'original' && originalFile
                      ? `Your uploaded file${originalFilename ? ` · ${originalFilename}` : ''}`
                      : 'Live preview · ATS-safe text'}
                  </p>
                </div>
              </div>
              <div className="inline-flex rounded-xl border border-outline-variant/50 bg-surface-container p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode('updated')}
                  aria-pressed={previewMode === 'updated'}
                  className={`cursor-pointer rounded-[0.6rem] px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    previewMode === 'updated'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Updated{applied.length ? ` (${applied.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('original')}
                  aria-pressed={previewMode === 'original'}
                  className={`cursor-pointer rounded-[0.6rem] px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    previewMode === 'original'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Original
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#eef1f6] p-3 sm:p-6 2xl:max-h-[68vh]">
              {previewMode === 'original' && originalFile ? (
                originalFile.kind === 'pdf' ? (
                  <div className="mx-auto min-h-full max-w-[680px] overflow-hidden rounded-[2px] border border-black/10 bg-white shadow-[0_1px_2px_rgba(17,28,45,0.08),0_12px_36px_rgba(17,28,45,0.10)]">
                    <iframe
                      src={`${originalFile.url}#toolbar=0&navpanes=0&view=FitH`}
                      title="Your original resume"
                      className="h-[72vh] w-full"
                    />
                  </div>
                ) : (
                  <div className="mx-auto min-h-full max-w-[680px] overflow-hidden rounded-[2px] border border-black/10 bg-white p-2 shadow-[0_1px_2px_rgba(17,28,45,0.08),0_12px_36px_rgba(17,28,45,0.10)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={originalFile.url} alt="Your original resume" className="w-full" />
                  </div>
                )
              ) : (
                <div className="mx-auto min-h-full max-w-[680px] rounded-[2px] border border-black/5 bg-white px-7 py-9 shadow-[0_1px_2px_rgba(17,28,45,0.08),0_12px_36px_rgba(17,28,45,0.10)] sm:px-11 sm:py-12">
                  <ResumeDocumentView
                    text={previewText}
                    highlight={previewMode === 'updated' ? lastHighlight : null}
                    mode={previewMode}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-outline-variant/30 px-4 py-2.5 text-[10px] font-medium text-text-muted sm:px-5">
              {previewMode === 'original' && originalFile ? (
                <span>Your original file, exactly as uploaded. Switch to Updated to see AI fixes.</span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-400/15" />
                    Suggested text
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/15" />
                    Applied change
                  </span>
                  <span className="ml-auto">Session only · copy or save when finished</span>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

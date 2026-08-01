'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { AtsReportRail } from '@/app/_components/ats-report/AtsReportRail';
import { AtsResumeTwinPreview } from '@/app/_components/ats-report/AtsResumeTwinPreview';
import { AtsStudioHeader } from '@/app/_components/ats-report/AtsStudioHeader';
import { AtsBeforeAfterCard } from '@/app/_components/ats-report/AtsBeforeAfterCard';
import { HyredResumePreview } from '@/app/_components/ats-report/HyredResumePreview';
import { useSetPreviewFocusMode } from '@/app/_components/ats-report/preview-focus';
import { buildAtsReport, type AtsReportCheck } from '@/lib/ats-report';
import {
  formatResumeStudioMeter,
  type ResumeStudioUsage,
} from '@/lib/premium-upgrade';

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
  originalFile?: { url: string; kind: 'pdf' | 'image' } | null;
  originalFilename?: string | null;
  onClose: (next?: { resume: string; result: AtsCheckResult }) => void;
}) {
  // Give previews the full width — hide the app left menu while Fix Studio is open.
  useSetPreviewFocusMode(true);
  const [originalResume] = useState(initialResume);
  const [workingResume, setWorkingResume] = useState(initialResume);
  const [baselineScore] = useState(initialResult.overallScore);
  const [result, setResult] = useState(initialResult);
  const [applied, setApplied] = useState<AppliedFix[]>([]);
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
  const isPremium = plan !== 'free';
  const report = useMemo(
    () => buildAtsReport(result, workingResume, { isPremium }),
    [result, workingResume, isPremium],
  );

  const selected: AtsFixWeakness | null =
    weaknesses.find((w) => w.id === selectedId) ?? needsWork[0] ?? weaknesses[0] ?? null;

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const activeSuggestion = suggestions[activeIdx] ?? null;
  useEffect(() => {
    if (!activeSuggestion) return;
    const range = findSnippetRange(workingResume, activeSuggestion.originalSnippet);
    if (range) {
      setLastHighlight({ start: range.start, end: range.end, kind: 'needs' });
    }
  }, [activeSuggestion, workingResume]);

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
        if (data.resume_studio.remaining != null && data.resume_studio.remaining <= 0) {
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
          if (range) setLastHighlight({ start: range.start, end: range.end, kind: 'needs' });
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

  const onSelectReportCheck = (check: AtsReportCheck) => {
    if (!check.weaknessId) return;
    const w = weaknesses.find((item) => item.id === check.weaknessId);
    if (w) onSelectWeakness(w);
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

  return (
    <div className="-mx-1 space-y-5 animate-slide-up sm:mx-0">
      <AtsStudioHeader
        score={result.overallScore}
        scoreDelta={scoreDelta}
        meterLabel={meterLabel}
        appliedCount={applied.length}
        canUndo={applied.length > 0}
        canSave={workingResume !== originalResume}
        saving={savingProfile}
        copied={copied}
        onBack={() => onClose({ resume: workingResume, result })}
        onUndo={handleUndo}
        onSave={handleSaveToProfile}
        onCopy={handleCopy}
      />

      {saveMessage && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          {saveMessage}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-24">
          <AtsReportRail
            report={report}
            selectedWeaknessId={selected?.id ?? null}
            onSelectCheck={onSelectReportCheck}
            showUpgrade={!isPremium}
          />
        </div>

        <AtsBeforeAfterCard
          selected={selected}
          activeSuggestion={activeSuggestion}
          suggestions={suggestions}
          activeIdx={activeIdx}
          loading={loading}
          error={error}
          quotaBlocked={quotaBlocked}
          showSaveUpgrade={showSaveUpgrade}
          hasGeneratedOnce={hasGeneratedOnce}
          meterLabel={meterLabel}
          scoreLiftProof={scoreLiftProof}
          scoreDelta={scoreDelta}
          onGenerate={() => selected && fetchSuggestions(selected, false)}
          onRegenerate={() => selected && fetchSuggestions(selected, true)}
          onApply={handleApply}
          onPrev={() => setActiveIdx((i) => Math.max(0, i - 1))}
          onNext={() => setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1))}
          onCopy={handleCopy}
          onDismissUpgrade={() => setShowSaveUpgrade(false)}
        />
      </div>

      <AtsResumeTwinPreview
        originalLabel="Original resume"
        originalMeta={originalFilename ?? undefined}
        hyredLabel="Hyred layout"
        hyredMeta={
          applied.length
            ? `${applied.length} fix${applied.length === 1 ? '' : 'es'} applied`
            : 'Premium visual · ATS-safe text'
        }
        original={
          originalFile ? (
            originalFile.kind === 'pdf' ? (
              <div className="overflow-hidden rounded-[3px] border border-slate-300/80 bg-white shadow-sm">
                <iframe
                  src={`${originalFile.url}#toolbar=0&navpanes=0&view=FitH`}
                  title="Your original resume"
                  className="h-[60vh] w-full lg:h-full lg:min-h-[480px]"
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-[3px] border border-slate-300/80 bg-white p-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalFile.url} alt="Your original resume" className="w-full" />
              </div>
            )
          ) : (
            <HyredResumePreview text={originalResume} showHighlights={false} />
          )
        }
        hyred={
          <HyredResumePreview text={workingResume} highlight={lastHighlight} showHighlights />
        }
      />
    </div>
  );
}

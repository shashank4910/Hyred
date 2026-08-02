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
  pickWorstWeakness,
  suggestionOverlapsHandled,
  undoLastFix,
  type AppliedFix,
  type AtsFixSuggestion,
  type AtsFixWeakness,
} from '@/lib/ats-fix';
import { AtsReportRail } from '@/app/_components/ats-report/AtsReportRail';
import { AtsResumeTwinPreview } from '@/app/_components/ats-report/AtsResumeTwinPreview';
import { AtsStudioHeader } from '@/app/_components/ats-report/AtsStudioHeader';
import { AtsBeforeAfterCard } from '@/app/_components/ats-report/AtsBeforeAfterCard';
import { AtsFixProgress } from '@/app/_components/ats-report/AtsFixProgress';
import { AtsFinishScreen } from '@/app/_components/ats-report/AtsFinishScreen';
import { HyredResumePreview } from '@/app/_components/ats-report/HyredResumePreview';
import { useSetPreviewFocusMode } from '@/app/_components/ats-report/preview-focus';
import {
  buildAtsReport,
  findUnquantifiedBullets,
  findThinBullets,
  type AtsReportCheck,
} from '@/lib/ats-report';
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
  // CTA decision: always land on the worst open issue first.
  const [selectedId, setSelectedId] = useState<string | null>(
    () => pickWorstWeakness(initialResult)?.id ?? null,
  );
  const [statusById, setStatusById] = useState<Record<string, 'fixed' | 'skipped'>>({});
  const [initialIssueIds] = useState<string[]>(() =>
    listAtsWeaknesses(initialResult)
      .filter((w) => w.status === 'needs_work')
      .map((w) => w.id),
  );
  // How many applied fixes turn a section green (drives the red→amber→green rail).
  const [fixTargets] = useState<Record<string, number>>(() => {
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const targets: Record<string, number> = {};
    for (const w of listAtsWeaknesses(initialResult)) {
      if (w.status !== 'needs_work') continue;
      if (w.id.startsWith('jd:')) {
        targets[w.id] = 1;
        continue;
      }
      const gap = Math.max(0, 75 - (w.score ?? 0));
      const byGap = clamp(Math.ceil(gap / 20), 1, 3);
      if (w.id === 'quantifiableAchievements') {
        targets[w.id] = clamp(Math.max(findUnquantifiedBullets(initialResume, 6).length, byGap), 1, 4);
      } else if (w.id === 'bulletQuality') {
        targets[w.id] = clamp(Math.max(findThinBullets(initialResume, 6).length, byGap), 1, 4);
      } else {
        targets[w.id] = byGap;
      }
    }
    return targets;
  });
  const [finished, setFinished] = useState(false);
  const [justFixed, setJustFixed] = useState<{
    label: string;
    delta: number;
    complete: boolean;
    applied?: number;
    target?: number;
  } | null>(null);
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
  const pending = needsWork.filter((w) => !statusById[w.id]);
  const fixedCount = Object.values(statusById).filter((s) => s === 'fixed').length;
  const skippedCount = Object.values(statusById).filter((s) => s === 'skipped').length;
  const skippedItems = weaknesses.filter((w) => statusById[w.id] === 'skipped');
  const isPremium = plan !== 'free';

  // Applied-fix count per section → progress ratio for the rail color.
  const appliedBySection = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of applied) {
      const id = a.suggestion.weaknessId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [applied]);

  const progressByWeaknessId = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, target] of Object.entries(fixTargets)) {
      const done = appliedBySection[id] ?? 0;
      if (done > 0) out[id] = Math.min(1, done / Math.max(1, target));
    }
    return out;
  }, [appliedBySection, fixTargets]);
  const report = useMemo(
    () => buildAtsReport(result, workingResume, { isPremium }),
    [result, workingResume, isPremium],
  );

  const selected: AtsFixWeakness | null =
    weaknesses.find((w) => w.id === selectedId) ?? pending[0] ?? needsWork[0] ?? weaknesses[0] ?? null;

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

  useEffect(() => {
    if (!justFixed) return;
    const t = setTimeout(() => setJustFixed(null), 2600);
    return () => clearTimeout(t);
  }, [justFixed]);

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
            avoid_proposed: [
              ...(regenerate ? suggestions.map((s) => s.proposedText) : []),
              ...applied
                .filter((a) => a.suggestion.weaknessId === weakness.id)
                .flatMap((a) => [a.suggestion.proposedText, a.suggestion.originalSnippet]),
            ].slice(0, 10),
            avoid_originals: applied
              .filter((a) => a.suggestion.weaknessId === weakness.id)
              .map((a) => a.suggestion.originalSnippet)
              .slice(0, 10),
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
        const handled = applied
          .filter((a) => a.suggestion.weaknessId === weakness.id)
          .flatMap((a) => [a.suggestion.originalSnippet, a.suggestion.proposedText]);
        const list = ((data.suggestions ?? []) as AtsFixSuggestion[]).filter(
          (s) => !suggestionOverlapsHandled(s, handled),
        );
        setSuggestions(list);
        setActiveIdx(0);
        setHasGeneratedOnce(true);
        if (data.usage) setUsage(data.usage);
        if (list[0]) {
          const range = findSnippetRange(workingResume, list[0].originalSnippet);
          if (range) setLastHighlight({ start: range.start, end: range.end, kind: 'needs' });
        } else {
          setError('No more safe fixes we can auto-write here. Use Skip to move to the next section.');
        }
      } catch (e) {
        setError((e as Error).message || 'Network error.');
      } finally {
        setLoading(false);
      }
    },
    [workingResume, jobDescription, suggestions, applied],
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

  /** Mark an item done/skipped and move focus to the next open section. */
  const advanceAfter = (
    id: string,
    mark: 'fixed' | 'skipped',
    freshWeaknesses?: AtsFixWeakness[],
  ) => {
    const nextStatus = { ...statusById, [id]: mark };
    setStatusById(nextStatus);
    const list = freshWeaknesses ?? weaknesses;
    const remaining = list.filter(
      (w) => w.status === 'needs_work' && !nextStatus[w.id],
    );
    if (remaining.length === 0) {
      setFinished(true);
    } else {
      onSelectWeakness(remaining[0]!);
    }
  };

  const handleApply = () => {
    if (!activeSuggestion || !selected) return;
    const before = workingResume;
    const outcome = applySuggestion(workingResume, activeSuggestion);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    const section = selected;
    const appliedSuggestion = activeSuggestion;
    setApplied((prev) => [...prev, { suggestion: appliedSuggestion, beforeResume: before }]);
    setWorkingResume(outcome.resume);
    const next = rescore(outcome.resume);
    const delta = next.overallScore - result.overallScore;
    setLastHighlight({ start: outcome.start, end: outcome.end, kind: 'fixed' });
    setError(null);

    // A section is "done" when its planned fixes are applied, or the engine already passes it.
    const freshWeaknesses = listAtsWeaknesses(next);
    const enginePassing = !freshWeaknesses.some(
      (w) => w.id === section.id && w.status === 'needs_work',
    );
    const target = fixTargets[section.id] ?? 1;
    const doneCount = (appliedBySection[section.id] ?? 0) + 1;
    const complete = enginePassing || doneCount >= target;

    if (complete) {
      // Section is now green → mark fixed and jump to the next open one.
      setJustFixed({ label: section.label, delta, complete: true, applied: doneCount, target });
      setSuggestions([]);
      setActiveIdx(0);
      advanceAfter(section.id, 'fixed', freshWeaknesses);
    } else {
      // Still work to do here → stay on the section, drop any leftover that retargets this line.
      setJustFixed({ label: section.label, delta, complete: false, applied: doneCount, target });
      const handled = [
        appliedSuggestion.originalSnippet,
        appliedSuggestion.proposedText,
      ];
      setSuggestions((prev) =>
        prev.filter(
          (s) => s.id !== appliedSuggestion.id && !suggestionOverlapsHandled(s, handled),
        ),
      );
      setActiveIdx(0);
    }
  };

  const handleSkip = () => {
    if (!selected) return;
    setJustFixed(null);
    advanceAfter(selected.id, 'skipped');
  };

  const handleDownload = () => {
    const blob = new Blob([workingResume], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (originalFilename || 'resume').replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${base}-hyred.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

      {finished ? (
        <AtsFinishScreen
          baselineScore={baselineScore}
          currentScore={result.overallScore}
          fixedCount={applied.length}
          skippedItems={skippedItems}
          copied={copied}
          saving={savingProfile}
          onRevisit={(w) => {
            setFinished(false);
            onSelectWeakness(w);
          }}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onSave={handleSaveToProfile}
          onBackToReport={() => setFinished(false)}
        />
      ) : (
        <>
          {initialIssueIds.length > 0 && (
            <AtsFixProgress
              total={initialIssueIds.length}
              fixed={fixedCount}
              skipped={skippedCount}
              onFinish={() => setFinished(true)}
              canFinish={fixedCount + skippedCount > 0}
            />
          )}

          {justFixed && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800 animate-slide-up">
              <span className="text-lg leading-none">✓</span>
              {justFixed.complete ? (
                <>“{justFixed.label}” is done — moving to the next section.</>
              ) : (
                <>
                  Applied to “{justFixed.label}”
                  {justFixed.applied != null && justFixed.target != null && (
                    <> · {Math.min(justFixed.applied, justFixed.target)}/{justFixed.target} fixes</>
                  )}
                  . Keep going to turn it green.
                </>
              )}
              {justFixed.delta > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold">
                  +{justFixed.delta} pts
                </span>
              )}
            </div>
          )}

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-24">
          <AtsReportRail
            report={report}
            selectedWeaknessId={selected?.id ?? null}
            onSelectCheck={onSelectReportCheck}
            showUpgrade={!isPremium}
            statusByWeaknessId={statusById}
            progressByWeaknessId={progressByWeaknessId}
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
          onSkip={handleSkip}
          onPrev={() => setActiveIdx((i) => Math.max(0, i - 1))}
          onNext={() => setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1))}
          onCopy={handleCopy}
          onDismissUpgrade={() => setShowSaveUpgrade(false)}
        />
      </div>
        </>
      )}

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

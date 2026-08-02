'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Printer,
  RefreshCcw,
  Save,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import { planAtsUpgrade, type AtsUpgradePlan } from '@/lib/ats-upgrade';
import { AtsResumeTwinPreview } from '@/app/_components/ats-report/AtsResumeTwinPreview';
import { AtsResumeTemplatePicker } from '@/app/_components/ats-report/AtsResumeTemplatePicker';
import { HyredResumePreview } from '@/app/_components/ats-report/HyredResumePreview';
import { AtsScoreRing } from '@/app/_components/ats-report/AtsScoreRing';
import { useSetPreviewFocusMode } from '@/app/_components/ats-report/preview-focus';
import { PremiumUpgradePanel } from '@/app/_components/PremiumUpgradePanel';
import {
  formatResumeStudioMeter,
  type ResumeStudioUsage,
} from '@/lib/premium-upgrade';
import {
  DEFAULT_ATS_TEMPLATE_ID,
  resolveResumeTheme,
  type ResumeTemplateId,
} from '@/lib/resume-template-theme';
import { extractResumePhoto, toCircularPhotoDataUrl } from '@/lib/resume-photo';

/**
 * One-click Resume Upgrade Studio (replaces step-by-step section fixing).
 * Score decides AI intensity → one Upgrade → downloadable/printable PDF.
 */
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
  useSetPreviewFocusMode(true);

  const [originalResume] = useState(initialResume);
  const [workingResume, setWorkingResume] = useState(initialResume);
  const [baselineScore] = useState(initialResult.overallScore);
  const [result, setResult] = useState(initialResult);
  const [upgraded, setUpgraded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [usage, setUsage] = useState<ResumeStudioUsage | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showSaveUpgrade, setShowSaveUpgrade] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(DEFAULT_ATS_TEMPLATE_ID);
  const templateName = resolveResumeTheme(templateId).name;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!originalFile) {
      setPhotoUrl(null);
      return;
    }
    (async () => {
      try {
        const extracted = await extractResumePhoto({
          dataUrl: originalFile.url,
          kind: originalFile.kind,
        });
        if (!extracted || cancelled) return;
        const circular = await toCircularPhotoDataUrl(extracted);
        if (!cancelled) setPhotoUrl(circular);
      } catch {
        /* no photo found — keep initials avatar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [originalFile]);

  const upgradePlan: AtsUpgradePlan = useMemo(
    () => planAtsUpgrade(initialResult),
    [initialResult],
  );

  const scoreDelta = result.overallScore - baselineScore;
  const meterLabel = usage ? formatResumeStudioMeter(usage, plan) : 'Checking credits…';

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

  const runUpgrade = async () => {
    setLoading(true);
    setError(null);
    setShowSaveUpgrade(false);
    try {
      const res = await fetch('/api/ats-fix/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: originalResume,
          job_description: jobDescription || undefined,
          result: initialResult,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setQuotaBlocked(true);
        if (data.usage) setUsage(data.usage);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? 'Could not upgrade resume.');
        return;
      }
      setWorkingResume(data.upgradedResume);
      setResult(data.afterResult as AtsCheckResult);
      setUpgraded(true);
      if (data.usage) setUsage(data.usage);
    } catch (e) {
      setError((e as Error).message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(workingResume);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setError(null);
    try {
      const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
      const doc = generateBeautifulPdf(workingResume, templateId, { photoDataUrl: photoUrl });
      const base = (originalFilename || 'resume').replace(/\.[^.]+$/, '');
      const filename = `${base}-hyred-${templateId}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message || 'PDF download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    // Print the Hyred preview panel if present; otherwise open a print window.
    const el = document.getElementById('hyred-upgrade-print');
    if (!el) {
      void handleDownloadPdf();
      return;
    }
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
    if (!w) {
      void handleDownloadPdf();
      return;
    }
    w.document.write(`<!doctype html><html><head><title>Resume</title>
      <style>
        @page { margin: 12mm; size: A4; }
        body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 0; }
        pre { white-space: pre-wrap; font-family: inherit; font-size: 11pt; line-height: 1.45; }
      </style></head><body><pre>${escapeHtml(workingResume)}</pre></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 250);
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

  const handleReset = () => {
    setWorkingResume(originalResume);
    setResult(initialResult);
    setUpgraded(false);
    setError(null);
  };

  return (
    <div className="-mx-1 space-y-5 animate-slide-up sm:mx-0">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3.5 shadow-card sm:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onClose({ resume: workingResume, result })}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Close
          </button>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              Resume Upgrade
            </p>
            <p className="text-sm font-semibold text-on-surface">
              One-click AI fix · {upgradePlan.label}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-text-muted">{meterLabel}</p>
      </header>

      {saveMessage && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
          {saveMessage}
        </div>
      )}

      {quotaBlocked || showSaveUpgrade ? (
        <PremiumUpgradePanel
          feature="resume_studio"
          proof={
            upgraded
              ? `Score moved ${baselineScore} → ${result.overallScore}`
              : undefined
          }
          secondaryLabel="Copy current resume"
          onSecondary={handleCopy}
          headline={
            showSaveUpgrade && !quotaBlocked
              ? 'Saving to your Hyred resume is Premium'
              : undefined
          }
        />
      ) : !upgraded ? (
        <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
          <div className="grid gap-6 p-5 sm:grid-cols-[140px_1fr] sm:p-7">
            <div className="flex flex-col items-center justify-center">
              <AtsScoreRing score={baselineScore} size={120} stroke={10} />
              <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Current score
              </p>
            </div>
            <div>
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                {upgradePlan.label} · {upgradePlan.creditCost} credit
                {upgradePlan.creditCost === 1 ? '' : 's'}
              </span>
              <h2 className="mt-3 font-headline text-2xl font-bold text-on-surface">
                Upgrade your whole resume in one click
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                {upgradePlan.summary}
              </p>
              <ul className="mt-4 space-y-2">
                {upgradePlan.willDo.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-on-surface">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void runUpgrade()}
                disabled={loading}
                className="mt-6 inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-on-primary shadow-primary-glow transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Upgrading with AI…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Upgrade my resume
                  </>
                )}
              </button>
              <p className="mt-2 text-[11px] text-text-muted">
                Uses {upgradePlan.creditCost} Resume Studio credit
                {upgradePlan.creditCost === 1 ? '' : 's'}. No inventing employers or metrics.
              </p>
              {error && (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card">
            <div className="border-b border-outline-variant/25 bg-gradient-to-b from-emerald-500/[0.08] to-transparent px-5 py-6 text-center sm:px-7">
              <div className="flex flex-wrap items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Before
                  </p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-text-muted">
                    {baselineScore}
                  </p>
                </div>
                <div className="flex flex-col items-center text-emerald-600">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-sm font-bold tabular-nums">
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                  </span>
                </div>
                <AtsScoreRing score={result.overallScore} size={100} stroke={9} />
              </div>
              <p className="mt-4 text-sm font-semibold text-on-surface">
                Upgrade complete · {upgradePlan.label}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloading}
                className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary shadow-primary-glow hover:opacity-90 disabled:opacity-60 sm:flex-none"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface hover:border-primary/40 hover:text-primary"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface hover:border-primary/40 hover:text-primary"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied!' : 'Copy text'}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveToProfile()}
                disabled={savingProfile}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface hover:border-primary/40 hover:text-primary disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save to profile
              </button>
              <button
                type="button"
                onClick={() => void runUpgrade()}
                disabled={loading}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Undo upgrade
              </button>
            </div>
            {error && (
              <p className="px-5 pb-4 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      )}

      <div id="hyred-upgrade-print">
        <AtsResumeTwinPreview
          originalLabel="Original resume"
          originalMeta={originalFilename ?? undefined}
          hyredLabel={upgraded ? 'Upgraded Hyred resume' : 'Hyred layout (preview)'}
          hyredMeta={
            upgraded
              ? `Score ${result.overallScore} · ${templateName} · ready to download`
              : `${templateName} · click Upgrade to generate`
          }
          hyredHeaderExtra={
            <AtsResumeTemplatePicker selectedId={templateId} onSelect={setTemplateId} />
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
              <HyredResumePreview
                text={originalResume}
                showHighlights={false}
                templateId={templateId}
                photoUrl={photoUrl}
              />
            )
          }
          hyred={
            <HyredResumePreview
              text={workingResume}
              showHighlights={false}
              templateId={templateId}
              photoUrl={photoUrl}
            />
          }
        />
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

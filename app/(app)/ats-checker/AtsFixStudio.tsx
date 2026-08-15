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
  const [downloaded, setDownloaded] = useState(false);
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
      setDownloaded(true);
    } catch (e) {
      setError((e as Error).message || 'PDF download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
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
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('');
    w.document.write(
      `<!doctype html><html><head><title>Hyred resume</title>${styles}</head><body class="bg-white p-6">${el.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 400);
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
    setDownloaded(false);
    setError(null);
  };

  const requestClose = () => {
    if (upgraded && !downloaded) {
      const leave = window.confirm(
        'Leave without downloading the upgraded PDF? This tab will not keep the AI resume.',
      );
      if (!leave) return;
    }
    onClose({ resume: workingResume, result });
  };

  const requestRegenerate = () => {
    const ok = window.confirm('Regenerate uses another Resume Studio credit. Continue?');
    if (!ok) return;
    void runUpgrade();
  };

  return (
    <div className="-mx-1 space-y-5 animate-slide-up sm:mx-0">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3.5 shadow-card sm:px-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={requestClose} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Close
          </button>
          <div>
            <h1 className="text-sm font-semibold text-on-surface">Fix Studio</h1>
            <p className="text-label-md text-text-muted">
              One-click AI fix · {upgradePlan.label}
            </p>
          </div>
        </div>
        <p className="text-label-md text-on-surface-variant">{meterLabel}</p>
      </header>

      {saveMessage && (
        <div className="rounded-xl bg-match-success/10 px-4 py-3 text-sm text-on-primary-container">
          {saveMessage}
        </div>
      )}

      {quotaBlocked || showSaveUpgrade ? (
        <PremiumUpgradePanel
          compact
          feature="resume_studio"
          proof={
            upgraded
              ? `Score moved ${baselineScore} → ${result.overallScore}`
              : undefined
          }
          secondaryLabel={upgraded ? 'Copy current resume' : undefined}
          onSecondary={upgraded ? handleCopy : undefined}
          headline={
            showSaveUpgrade && !quotaBlocked
              ? 'Saving to your Hyred resume is Premium'
              : undefined
          }
          description={
            showSaveUpgrade && !quotaBlocked
              ? 'Download PDF is still free. Saving this version as your Hyred profile resume needs Premium.'
              : 'Stripe checkout is not live yet. You can still download the PDF from this tab, then check Settings for credit status.'
          }
        />
      ) : null}

      {!upgraded && (
        <section className="overflow-hidden rounded-2xl bg-surface-container-lowest p-5 shadow-card sm:p-7">
          <div className="grid gap-6 sm:grid-cols-[140px_1fr]">
            <div className="flex flex-col items-center justify-center">
              <AtsScoreRing score={baselineScore} size={120} stroke={10} />
              <p className="mt-2 text-center text-label-md font-bold text-text-muted">
                Current score
              </p>
            </div>
            <div>
              <span className="badge-primary">
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
                disabled={loading || quotaBlocked}
                className="btn-primary mt-6 h-12"
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
              <p className="mt-2 text-label-md text-text-muted">
                {meterLabel}. Uses {upgradePlan.creditCost} credit
                {upgradePlan.creditCost === 1 ? '' : 's'}. No inventing employers or metrics.
              </p>
              {error && (
                <p className="mt-3 text-sm text-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {upgraded && (
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card">
            <div className="border-b border-outline-variant/25 px-5 py-6 text-center sm:px-7">
              <div className="flex flex-wrap items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-label-md font-bold text-text-muted">Before</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-text-muted">
                    {baselineScore}
                  </p>
                </div>
                <div className="flex flex-col items-center text-match-success">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-sm font-bold tabular-nums">
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                  </span>
                </div>
                <AtsScoreRing score={result.overallScore} size={100} stroke={9} />
              </div>
              <p className="mt-4 text-sm font-semibold text-on-surface">
                Upgrade complete. Download the PDF to keep this version.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloading}
                className="btn-primary h-11 flex-1 sm:flex-none"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download PDF
              </button>
              <button type="button" onClick={handlePrint} className="btn h-11">
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button type="button" onClick={() => void handleCopy()} className="btn h-11">
                <Copy className="h-4 w-4" />
                {copied ? 'Copied!' : 'Copy text'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-outline-variant/25 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => void handleSaveToProfile()}
                disabled={savingProfile}
                className="btn-ghost"
              >
                <Save className="h-4 w-4" />
                Save to profile
              </button>
              <button
                type="button"
                onClick={requestRegenerate}
                disabled={loading}
                className="btn-ghost"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Regenerate
              </button>
              <button type="button" onClick={handleReset} className="btn-ghost">
                Undo upgrade
              </button>
            </div>
            {error && (
              <p className="px-5 pb-4 text-sm text-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Twin preview only after upgrade — showing Hyred layout of raw text before
          Upgrade reads as a fake "already improved" resume. */}
      {upgraded ? (
        <div id="hyred-upgrade-print">
          <AtsResumeTwinPreview
            originalLabel="Original resume"
            originalMeta={originalFilename ?? undefined}
            hyredLabel="Upgraded Hyred resume"
            hyredMeta={`Score ${result.overallScore} · ${templateName} · ready to download`}
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
      ) : (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container/30 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">Improved preview unlocks after Upgrade</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-text-muted">
            We won’t show a Hyred layout of your old text — that looks like the upgrade already ran.
            Click <span className="font-semibold text-on-surface">Upgrade my resume</span> above, then
            download the PDF.
          </p>
          {originalFile && (
            <div className="mx-auto mt-5 max-w-xl overflow-hidden rounded-xl bg-surface-container-lowest text-left shadow-card">
              <p className="border-b border-outline-variant/25 px-3 py-2 text-label-md font-bold text-text-muted">
                Your original (reference)
              </p>
              {originalFile.kind === 'pdf' ? (
                <iframe
                  src={`${originalFile.url}#toolbar=0&navpanes=0&view=FitH`}
                  title="Your original resume"
                  className="h-[42vh] w-full min-h-[280px]"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={originalFile.url} alt="Your original resume" className="w-full p-2" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useTransition, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Copy,
  Download,
  CheckCircle2,
  ExternalLink,
  RotateCw,
  Pencil,
  FileText,
  Rocket,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react';
import { STATUS_ORDER } from '@/lib/ui';
import { CollapsibleCard } from '../../_components/CollapsibleCard';
import { KeywordManager, type GenResult } from './KeywordManager';
import { ReadyToApply } from './ReadyToApply';
import { ResumePreviewModal, type ResumePreviewKind } from './ResumePreviewModal';
import { ResumeTemplatePicker, DEFAULT_RESUME_TEMPLATE_ID } from './ResumeTemplatePicker';
import { ResumeTemplateSamplePreview } from './ResumeTemplateSamplePreview';
import { RESUME_TEMPLATE_SAMPLE_TEXT } from '@/lib/resume-template-previews';
import { createResumePdfObjectUrl, revokeResumePdfObjectUrl } from '@/lib/resume-pdf-preview';
import { getResumeTemplate } from '@/lib/resume-templates';
import type { ResumeVersionSummary } from '@/lib/types';

export function JobActions({
  matchId,
  status,
  bookmarked: initialBookmarked,
  coverLetter,
  applyUrl,
  hasTailoredResume: initialHasTailored = false,
  initialResumeText = '',
  initialResumeVersions = [],
  isPremium = false,
}: {
  matchId: string;
  status: string;
  bookmarked: boolean;
  coverLetter: string | null;
  applyUrl: string;
  hasTailoredResume?: boolean;
  initialResumeText?: string;
  initialResumeVersions?: ResumeVersionSummary[];
  isPremium?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Bookmark state
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [savingBookmark, setSavingBookmark] = useState(false);

  // Cover letter state
  const [letter, setLetter] = useState(coverLetter ?? '');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ATS Resume state
  const [atsResume, setAtsResume] = useState(initialResumeText);
  const [editedResume, setEditedResume] = useState(initialResumeText);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumeCopied, setResumeCopied] = useState(false);
  const [filenameBase, setFilenameBase] = useState<string>('Shashank_Performance_7.7');
  const [keywords, setKeywords] = useState<GenResult>(null);
  // Change in ATS score vs the previous optimize (for the +N / -N badge).
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const [hasTailoredResume, setHasTailoredResume] = useState(initialHasTailored);

  // Keyword state. jdKeywords = the stable JD keyword universe (from GET).
  // alreadyHaveKeywords = exact phrase hits in the master resume (green).
  // closeHaveKeywords = close/near wording (amber) — not counted in ATS score.
  // selectedKeywords = the user's current "weave these in" intent (staged).
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [alreadyHaveKeywords, setAlreadyHaveKeywords] = useState<string[]>([]);
  const [closeHaveKeywords, setCloseHaveKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  // Synchronous mirror — optimize() reads this so Add-all → Optimize never
  // posts a stale selectedKeywords snapshot before React re-renders.
  const selectedKeywordsRef = useRef<string[]>([]);
  // LLM-decided keyword types (tool vs activity), keyed by keyword. Ferried back
  // to the POST so placement is driven by the model's judgement, not a heuristic.
  const [keywordTypes, setKeywordTypes] = useState<Record<string, string>>({});
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  // Resume versions (saved history from the DB, updated live when a new one is generated)
  const [resumeVersions, setResumeVersions] = useState<ResumeVersionSummary[]>(initialResumeVersions);
  const [showVersions, setShowVersions] = useState(initialResumeVersions.length > 0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('Resume preview');
  const [previewSubtitle, setPreviewSubtitle] = useState<string | undefined>();
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewVisual, setPreviewVisual] = useState<ReactNode | undefined>();
  const [previewKind, setPreviewKind] = useState<ResumePreviewKind>('resume');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = useState<string | null>(null);
  const [resumeTemplateId, setResumeTemplateId] = useState<string>(DEFAULT_RESUME_TEMPLATE_ID);

  function closePreviewModal() {
    setPreviewOpen(false);
    setPreviewPdfUrl((prev) => {
      revokeResumePdfObjectUrl(prev);
      return null;
    });
    setPreviewVisual(undefined);
    setPreviewPdfLoading(false);
    setPreviewKind('resume');
    setPreviewTemplateId(null);
  }

  async function openPdfPreview(args: {
    title: string;
    subtitle?: string;
    resumeText: string;
    kind?: ResumePreviewKind;
    templateId?: string;
  }) {
    setPreviewPdfUrl((prev) => {
      revokeResumePdfObjectUrl(prev);
      return null;
    });
    setPreviewVisual(undefined);
    setPreviewTitle(args.title);
    setPreviewSubtitle(args.subtitle);
    setPreviewKind(args.kind ?? 'resume');
    setPreviewTemplateId(args.templateId ?? null);
    setPreviewPdfLoading(true);
    setPreviewOpen(true);
    try {
      const url = await createResumePdfObjectUrl(
        args.resumeText,
        args.templateId ?? resumeTemplateId,
      );
      setPreviewPdfUrl(url);
    } catch (e) {
      closePreviewModal();
      toast.error(`PDF preview failed: ${(e as Error).message}`);
    } finally {
      setPreviewPdfLoading(false);
    }
  }

  // Load JD keywords for the keyword panel
  useEffect(() => {
    let cancelled = false;
    setLoadingKeywords(true);
    fetch(`/api/match/${matchId}/resume`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.keywords) {
          setJdKeywords(d.keywords);
          setAlreadyHaveKeywords(d.alreadyHave ?? []);
          setCloseHaveKeywords(d.closeHave ?? []);
          setKeywordTypes(d.keywordTypes ?? {});
          setSelectedKeywords([]);
          selectedKeywordsRef.current = [];
          setKeywordsLoaded(true);
        }
        if (Array.isArray(d?.versions)) {
          setResumeVersions(d.versions);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingKeywords(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  async function previewSavedVersion(version: ResumeVersionSummary) {
    setVersionPreviewLoading(version.id);
    const tid = toast.loading('Loading version…');
    try {
      const res = await fetch(`/api/match/${matchId}/resume/versions/${version.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load version');
      const resumeText = data.version?.resume_text ?? '';
      if (!resumeText.trim()) throw new Error('This version has no resume text');
      toast.dismiss(tid);
      await openPdfPreview({
        title: version.label ?? 'Saved resume',
        subtitle:
          version.ats_match_score != null
            ? `ATS ${version.ats_match_score}% · PDF preview (same as download)`
            : 'PDF preview (same as download)',
        resumeText,
      });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setVersionPreviewLoading(null);
    }
  }

  function previewSelectedTemplateStyle() {
    previewTemplateLayout(resumeTemplateId);
  }

  async function previewTemplateLayout(templateId: string) {
    const meta = getResumeTemplate(templateId);
    setPreviewKind('template');
    setPreviewTemplateId(templateId);

    if (meta?.available) {
      await openPdfPreview({
        title: meta.name,
        subtitle: meta.blurb,
        resumeText: RESUME_TEMPLATE_SAMPLE_TEXT,
        kind: 'template',
        templateId,
      });
      return;
    }

    setPreviewPdfUrl((prev) => {
      revokeResumePdfObjectUrl(prev);
      return null;
    });
    setPreviewPdfLoading(false);
    setPreviewTitle(meta?.name ?? 'Template style');
    setPreviewSubtitle(meta?.blurb ?? 'Coming soon — layout sample only');
    setPreviewVisual(
      <ResumeTemplateSamplePreview templateId={templateId} sampleText={RESUME_TEMPLATE_SAMPLE_TEXT} />,
    );
    setPreviewOpen(true);
  }

  async function generate() {
    setGenerating(true);
    const id = toast.loading('Drafting cover letter...');
    try {
      const res = await fetch(`/api/coverletter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ match_id: matchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLetter(data.cover_letter);
      toast.success('Cover letter ready', { id });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(next: string) {
    const id = toast.loading('Updating...');
    try {
      const res = await fetch(`/api/match/${matchId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      toast.success(`Marked as ${next}`, { id });
      if (next === 'interviewing') {
        toast('Interview stage — open Interview prep from the dashboard for this job.');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message, { id });
    }
  }

  async function toggleBookmark() {
    if (savingBookmark) return;
    setSavingBookmark(true);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const res = await fetch(`/api/match/${matchId}/bookmark`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookmarked: next }),
      });
      if (!res.ok) {
        setBookmarked(!next);
        toast.error('Failed to update bookmark');
      } else {
        toast.success(next ? 'Bookmarked!' : 'Bookmark removed');
      }
    } catch {
      setBookmarked(!next);
      toast.error('Failed to update bookmark');
    } finally {
      setSavingBookmark(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(letter);
    toast.success('Copied to clipboard');
  }

  function download() {
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }


  // The single action. Generates (or regenerates in-place) the resume, weaving
  // in exactly the staged keywords. Keeps the current resume visible while it
  // runs, and reports the score change.
  function mergeKeywordLists(base: string[], add: string[]): string[] {
    const have = new Set(base.map((k) => k.toLowerCase()));
    const next = [...base];
    for (const kw of add) {
      const lc = kw.toLowerCase();
      if (!have.has(lc)) {
        have.add(lc);
        next.push(kw);
      }
    }
    return next;
  }

  async function optimize(keywordsOverride?: string[]) {
    setGeneratingResume(true);
    const firstRun = !atsResume;
    const id = toast.loading(firstRun ? 'Optimizing your resume...' : 'Re-optimizing...');
    const oldScore = keywords?.ats_match_score ?? null;
    const keywordsToWeave =
      keywordsOverride && keywordsOverride.length > 0
        ? keywordsOverride
        : selectedKeywordsRef.current;
    try {
      const res = await fetch(`/api/match/${matchId}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedKeywords: keywordsToWeave.length > 0 ? keywordsToWeave : undefined,
          jdKeywords: jdKeywords.length > 0 ? jdKeywords : undefined,
          keywordTypes: Object.keys(keywordTypes).length > 0 ? keywordTypes : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        toast.error('Resume Studio credits used up. Upgrade for more tailored resumes and Fix Studio rewrites.', {
          id,
          action: {
            label: 'Upgrade',
            onClick: () => {
              window.location.href = '/settings?upgrade=resume_studio';
            },
          },
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAtsResume(data.resume);
      setEditedResume(data.resume);
      if (data.keywords) {
        const newScore = data.keywords.ats_match_score ?? 0;
        setScoreDelta(oldScore != null ? newScore - oldScore : null);
        setKeywords(data.keywords);
      }
      if (data.filename_base) setFilenameBase(data.filename_base);
      if (data.version) {
        setResumeVersions((prev) => {
          const without = prev.filter((v) => v.id !== data.version.id);
          return [data.version as ResumeVersionSummary, ...without].slice(0, 10);
        });
        setShowVersions(true);
      }
      setHasTailoredResume(true);
      notifyExtensionApplyHandoff(true);
      const newScore = data.keywords?.ats_match_score ?? 0;
      toast.success(`ATS Match Score: ${newScore}%`, { id });
    } catch (e) {
      toast.error((e as Error).message, { id });
    } finally {
      setGeneratingResume(false);
    }
  }

  // Stage a keyword to be woven in on the next optimize (case-insensitive).
  function onStage(kw: string) {
    setSelectedKeywords((prev) => {
      if (prev.some((k) => k.toLowerCase() === kw.toLowerCase())) return prev;
      const next = [...prev, kw];
      selectedKeywordsRef.current = next;
      return next;
    });
  }

  // Un-stage a keyword. Because every optimize regenerates from the MASTER
  // resume, dropping a keyword from the staged set is all that's needed to
  // remove it on the next optimize — no separate "exclude" list required.
  function onUnstage(kw: string) {
    setSelectedKeywords((prev) => {
      const next = prev.filter((k) => k.toLowerCase() !== kw.toLowerCase());
      selectedKeywordsRef.current = next;
      return next;
    });
  }

  // Stage every keyword in a list (used by "Add all" on the Missing bucket).
  function onStageMany(kws: string[]) {
    const next = mergeKeywordLists(selectedKeywordsRef.current, kws);
    selectedKeywordsRef.current = next;
    setSelectedKeywords(next);
  }

  async function copyResume() {
    await navigator.clipboard.writeText(editedResume || atsResume);
    setResumeCopied(true);
    toast.success('Resume copied to clipboard');
    setTimeout(() => setResumeCopied(false), 2000);
  }

  function downloadResumeTxt() {
    const text = editedResume || atsResume;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadResumePdf() {
    const id = toast.loading('Generating beautiful PDF...');
    try {
      const { generateBeautifulPdf } = await import('@/lib/pdf-resume');
      const text = editedResume || atsResume;
      const doc = generateBeautifulPdf(text, resumeTemplateId);
      const filename = `${filenameBase}.pdf`;

      // iOS Safari (iPhone/iPad) often ignores jsPDF doc.save(); blob + anchor
      // opens the system PDF preview reliably with the same bytes as desktop.
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

      toast.success('PDF downloaded!', { id });
    } catch (e) {
      toast.error(`PDF generation failed: ${(e as Error).message}`, { id });
    }
  }


  function notifyExtensionApplyHandoff(useTailored: boolean) {
    try {
      window.postMessage(
        {
          source: 'hyred-app',
          type: 'apply-handoff',
          matchId,
          resumeVariant: useTailored ? 'tailored' : 'default',
          hasTailoredResume: useTailored,
        },
        window.location.origin,
      );
    } catch {
      /* extension not installed */
    }
  }

  return (
    <div className="space-y-3">
      {/* Apply CTA */}
      <div
        id="apply"
        className="card scroll-mt-24 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" /> Ready to apply?
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Opens the original posting. Generate your ATS resume + cover letter first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bookmark toggle */}
            <button
              onClick={toggleBookmark}
              disabled={savingBookmark}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark this job'}
              className={[
                'btn',
                bookmarked ? 'border-primary text-primary bg-primary/10 hover:bg-primary/20' : '',
              ].join(' ')}
            >
              <Bookmark
                className="h-4 w-4"
                fill={bookmarked ? 'currentColor' : 'none'}
              />
              {bookmarked ? 'Bookmarked' : 'Bookmark'}
            </button>
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                const useTailored = hasTailoredResume || !!atsResume.trim();
                notifyExtensionApplyHandoff(useTailored);
                if (status !== 'applied' && status !== 'interviewing' && status !== 'offer') {
                  fetch(`/api/match/${matchId}/status`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ status: 'applied' }),
                  })
                    .then(() => startTransition(() => router.refresh()))
                    .catch(() => {});
                }
              }}
              className="btn-primary text-base px-5 py-2.5"
            >
              <ExternalLink className="h-4 w-4" />
              Apply on job site
            </a>
          </div>
        </div>
      </div>

      {/* Status tracker */}
      <div className="card">
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              disabled={s === status}
              onClick={() => setStatus(s)}
              className={
                s === status
                  ? 'rounded-xl bg-primary-container text-on-primary-container px-3 py-1.5 text-xs font-semibold'
                  : 'rounded-xl border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface hover:border-primary/40 hover:bg-primary/5 transition-colors'
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>


      {/* Cover letter — collapsed until generated */}
      <CollapsibleCard
        title="Cover letter"
        icon={<Pencil className="h-4 w-4 text-primary" />}
        summary={letter ? `${letter.slice(0, 80).trim()}…` : 'Generate a tailored cover letter'}
        defaultOpen={!!letter}
      >
        <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
          {letter && (
            <>
              <button onClick={copy} className="btn">
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button onClick={download} className="btn">
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              <button onClick={() => setEditing((v) => !v)} className="btn">
                {editing ? 'Done' : 'Edit'}
              </button>
            </>
          )}
          <button onClick={generate} disabled={generating} className="btn-primary">
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : letter ? (
              <RotateCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? 'Drafting...' : letter ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {generating && !letter && (
          <div className="space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-10/12" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        )}
        {letter ? (
          editing ? (
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="input min-h-[260px] font-sans text-sm leading-relaxed"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-on-surface-variant font-sans leading-relaxed max-h-[320px] overflow-y-auto">
              {letter}
            </pre>
          )
        ) : (
          !generating && (
            <p className="text-sm text-on-surface-variant">
              Click <span className="text-primary font-medium">Generate</span> to draft a
              tailored cover letter using your resume and this JD.
            </p>
          )
        )}
      </CollapsibleCard>


      {/* Resume Studio */}
      <div id="ats-resume" className="card scroll-mt-24">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Resume Studio
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Tailor keywords, pick a style, then export PDF. Preview each saved version below.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={previewSelectedTemplateStyle}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              title="Preview the selected PDF template style"
            >
              <Eye className="h-4 w-4" />
              Style preview
            </button>
            {atsResume.trim() && (
              <>
                <button onClick={copyResume} className="btn">
                  <Copy className="h-3.5 w-3.5" /> {resumeCopied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadResumeTxt} className="btn">
                  <Download className="h-3.5 w-3.5" /> .txt
                </button>
                <button onClick={downloadResumePdf} className="btn">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
              </>
            )}
          </div>
        </div>

        <ResumeTemplatePicker
          selectedId={resumeTemplateId}
          onSelect={setResumeTemplateId}
          onPreviewTemplate={previewTemplateLayout}
          isPremium={isPremium}
        />

        {/* One door: analysis runs invisibly behind the single Tailor button.
            The advanced keyword manager appears only after a tailored resume
            exists, so first-time users see exactly one way forward. */}
        <ReadyToApply
          matchId={matchId}
          staged={selectedKeywords}
          onStage={onStage}
          onUnstage={onUnstage}
          onOptimize={optimize}
          generating={generatingResume}
        />

        {/* Keyword manager — advanced control, shown once a tailored resume
            exists. Before that, ReadyToApply's single Tailor button is the
            only path (one door, no competing choices). */}
        {(loadingKeywords || keywordsLoaded) && !!atsResume && (
          <>
            {loadingKeywords && !keywordsLoaded && (
              <div className="space-y-2">
                <div className="skeleton h-4 w-1/3" />
                <div className="flex gap-2">
                  <div className="skeleton h-7 w-20 rounded-full" />
                  <div className="skeleton h-7 w-24 rounded-full" />
                  <div className="skeleton h-7 w-16 rounded-full" />
                  <div className="skeleton h-7 w-28 rounded-full" />
                  <div className="skeleton h-7 w-20 rounded-full" />
                </div>
              </div>
            )}
            {keywordsLoaded && (
              <KeywordManager
                jdKeywords={jdKeywords}
                originalPresent={alreadyHaveKeywords}
                closePresent={closeHaveKeywords}
                result={keywords}
                staged={selectedKeywords}
                generating={generatingResume}
                hasResume={!!atsResume}
                scoreDelta={scoreDelta}
                onStage={onStage}
                onUnstage={onUnstage}
                onStageMany={onStageMany}
                onOptimize={optimize}
              />
            )}
          </>
        )}

        {/* Resume Studio Pro — saved version history */}
        {resumeVersions.length > 0 && (
          <div className="mt-3 border-t border-outline-variant pt-3">
            <button
              onClick={() => setShowVersions((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {showVersions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Resume Studio — {resumeVersions.length} saved version{resumeVersions.length !== 1 ? 's' : ''}
            </button>
            {showVersions && (
              <div className="mt-2 space-y-1.5">
                {resumeVersions.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-low border border-outline-variant px-3 py-2.5 text-xs sm:flex-nowrap"
                  >
                    <span className="text-on-surface font-medium truncate min-w-0 flex-1 basis-full sm:basis-auto">
                      {v.label ?? 'Resume'}
                    </span>
                    <button
                      type="button"
                      onClick={() => previewSavedVersion(v)}
                      disabled={versionPreviewLoading === v.id}
                      className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold order-first sm:order-none sm:ml-auto"
                      title="Preview this version as PDF (same as download)"
                    >
                      {versionPreviewLoading === v.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      Preview PDF
                    </button>
                    {v.ats_match_score != null && (
                      <span className="text-on-surface-variant whitespace-nowrap">
                        ATS <span className="font-semibold text-on-surface">{v.ats_match_score}%</span>
                      </span>
                    )}
                    <span className="text-on-surface-variant/60 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {generatingResume && !atsResume && (
          <div className="space-y-2 mt-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-10/12" />
          </div>
        )}

        {atsResume.trim() && !generatingResume && resumeVersions.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant border-t border-outline-variant pt-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-match-success shrink-0" />
            Use <span className="font-semibold text-primary">Preview PDF</span> on a saved version to see the colorful PDF (same as download).
          </p>
        )}
      </div>

      <ResumePreviewModal
        open={previewOpen}
        onClose={closePreviewModal}
        title={previewTitle}
        subtitle={previewSubtitle}
        kind={previewKind}
        templateMeta={previewTemplateId ? getResumeTemplate(previewTemplateId) : undefined}
        templateId={previewTemplateId ?? undefined}
        onTemplateNavigate={previewKind === 'template' ? previewTemplateLayout : undefined}
        pdfUrl={previewPdfUrl}
        pdfLoading={previewPdfLoading}
        visualPreview={previewVisual}
      />
    </div>
  );
}

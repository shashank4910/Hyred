'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  Search,
  FileCheck,
  AtSign,
  ListChecks,
  Target,
  Ruler,
  Calendar,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type View = 'input' | 'loading' | 'results';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-emerald-500';
  if (score >= 50) return 'stroke-amber-500';
  return 'stroke-red-500';
}

/* ------------------------------------------------------------------ */
/*  Criteria config (icon, label, key mapping)                         */
/* ------------------------------------------------------------------ */

interface CriterionMeta {
  key: keyof AtsCheckResult['breakdown'];
  label: string;
  icon: React.ReactNode;
  description: string;
}

const CRITERIA: CriterionMeta[] = [
  {
    key: 'sectionStructure',
    label: 'Section Structure',
    icon: <ListChecks className="h-4 w-4" />,
    description: 'Standard sections (Experience, Education, Skills) that ATS parsers recognize.',
  },
  {
    key: 'contactInfo',
    label: 'Contact Info',
    icon: <AtSign className="h-4 w-4" />,
    description: 'Name, email, phone, LinkedIn, and location clearly at the top.',
  },
  {
    key: 'bulletQuality',
    label: 'Bullet Points',
    icon: <FileText className="h-4 w-4" />,
    description: 'Consistent formatting and sufficient detail in experience bullets.',
  },
  {
    key: 'quantifiableAchievements',
    label: 'Quantified Impact',
    icon: <Target className="h-4 w-4" />,
    description: 'Numbers, percentages, and metrics that show measurable results.',
  },
  {
    key: 'skillsOptimization',
    label: 'Skills Optimization',
    icon: <Sparkles className="h-4 w-4" />,
    description: 'Concrete technical keywords, organized and contextualized in experience.',
  },
  {
    key: 'lengthReadability',
    label: 'Length & Density',
    icon: <Ruler className="h-4 w-4" />,
    description: 'Appropriate length (1–2 pages) with good content density.',
  },
  {
    key: 'formatCleanliness',
    label: 'Format Cleanliness',
    icon: <FileCheck className="h-4 w-4" />,
    description: 'Clean ASCII text — no smart quotes, unicode bullets, or special characters.',
  },
  {
    key: 'dateConsistency',
    label: 'Date Formatting',
    icon: <Calendar className="h-4 w-4" />,
    description: 'Consistent and complete date ranges with month-level granularity.',
  },
];

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function AtsCheckerPage() {
  const [view, setView] = useState<View>('input');
  const [resumeText, setResumeText] = useState('');
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload / paste handler ──────────────────────────────────────

  const handleCheck = useCallback(async (text?: string, file?: File) => {
    setView('loading');
    setError(null);

    try {
      let payload: BodyInit;
      let headers: Record<string, string> = {};
      let displayFilename: string | null = file?.name ?? null;

      if (file) {
        const form = new FormData();
        form.append('resume', file);
        payload = form;
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify({ resume_text: text ?? resumeText });
      }

      const res = await fetch('/api/ats-checker', {
        method: 'POST',
        headers,
        body: payload,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to analyze resume.');
        setView('input');
        return;
      }

      setResult(data as AtsCheckResult);
      setFilename(displayFilename);
      setView('results');
    } catch (e) {
      setError((e as Error).message || 'Network error. Please try again.');
      setView('input');
    }
  }, [resumeText]);

  // ── File drop / select ──────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    const validExt = /\.(pdf|docx?|txt)$/i.test(file.name);

    if (!validExt && !validTypes.includes(file.type)) {
      setError('Please upload a .pdf, .doc, .docx, or .txt file.');
      return;
    }

    setFilename(file.name);
    handleCheck(undefined, file);
  }, [handleCheck]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Paste text check ────────────────────────────────────────────

  const handlePasteCheck = useCallback(() => {
    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setError('Please enter at least 50 characters of resume text.');
      return;
    }
    setError(null);
    handleCheck(resumeText);
  }, [resumeText, handleCheck]);

  const handleReset = useCallback(() => {
    setView('input');
    setResult(null);
    setError(null);
    setFilename(null);
    setResumeText('');
  }, []);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-headline text-heading-sm font-bold text-on-background flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          ATS Resume Checker
        </h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          Analyze your resume for Applicant Tracking System (ATS) compatibility. 
          Free, instant, no AI — fully private.
        </p>
      </div>

      {/* ── INPUT VIEW ─────────────────────────────────────────── */}
      {view === 'input' && (
        <div className="space-y-5">
          {/* Drag & drop area */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
              dragOver
                ? 'border-primary bg-primary/5 shadow-primary-glow'
                : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-lowest'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={onFileSelect}
            />
            <Upload className="mx-auto h-10 w-10 text-text-muted mb-3" />
            <p className="text-body-md font-semibold text-on-surface mb-1">
              Upload your resume
            </p>
            <p className="text-sm text-text-muted">
              Drop a .pdf, .doc, .docx, or .txt file here, or click to browse
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-outline-variant" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              or paste your resume
            </span>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          {/* Text area */}
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume text here..."
            className="w-full min-h-[200px] rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface placeholder:text-text-muted outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15 resize-y"
            rows={8}
          />

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Check button */}
          <button
            type="button"
            onClick={handlePasteCheck}
            disabled={resumeText.trim().length < 50}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-6 py-3.5 text-body-md font-semibold text-on-primary shadow-card transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileCheck className="h-5 w-5" />
            Check My Resume
          </button>

          <p className="text-center text-xs text-text-muted">
            Your resume is processed in-memory and never stored. Fully private.
          </p>
        </div>
      )}

      {/* ── LOADING VIEW ───────────────────────────────────────── */}
      {view === 'loading' && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <p className="text-body-md font-semibold text-on-surface">
            Analyzing your resume...
          </p>
          <p className="text-sm text-text-muted">
            {filename ? `Reading ${filename}` : 'Running ATS compatibility checks'}
          </p>
          <div className="w-48 h-1.5 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full teal-gradient rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* ── RESULTS VIEW ───────────────────────────────────────── */}
      {view === 'results' && result && (
        <div className="space-y-6">
          {/* Score ring card */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Score ring */}
              <div className="relative w-28 h-28 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60" cy="60" r="52"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-surface-container"
                  />
                  <circle
                    cx="60" cy="60" r="52"
                    fill="none"
                    strokeWidth="8"
                    strokeDasharray={`${Math.round(2 * Math.PI * 52)} ${Math.round(2 * Math.PI * 52)}`}
                    strokeDashoffset={Math.round((2 * Math.PI * 52) * (1 - result.overallScore / 100))}
                    strokeLinecap="round"
                    className={scoreRingColor(result.overallScore)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold ${scoreColor(result.overallScore)}`}>
                    {result.overallScore}
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    / 100
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-headline-sm font-bold text-on-surface">
                  {result.overallScore >= 80
                    ? 'Great ATS Compatibility'
                    : result.overallScore >= 50
                      ? 'Room for Improvement'
                      : 'Needs Significant Work'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {result.overallScore >= 80
                    ? 'Your resume is well-optimized for ATS systems.'
                    : result.overallScore >= 50
                      ? 'Some areas need attention to pass ATS filters reliably.'
                      : 'Major changes recommended for ATS compatibility.'}
                </p>
                {filename && (
                  <div className="inline-flex items-center gap-1.5 mt-2 text-xs text-text-muted bg-surface-container rounded-lg px-2.5 py-1">
                    <FileText className="h-3.5 w-3.5" />
                    {filename}
                  </div>
                )}
              </div>
            </div>

            {/* File hints */}
            {result.fileHints && (
              <div className="mt-4 flex flex-wrap gap-2">
                {result.fileHints.isPdf && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-surface-container text-text-muted">
                    PDF format
                  </span>
                )}
                {result.fileHints.isDocx && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
                    DOCX — best ATS format
                  </span>
                )}
                {result.fileHints.isTxt && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium">
                    TXT — limited formatting
                  </span>
                )}
                {result.fileHints.mightBeScanned && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    May be a scanned/image PDF
                  </span>
                )}
              </div>
            )}

            {/* Quick stats row */}
            {result.goodPractices.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">What you&apos;re doing well</p>
                {result.goodPractices.slice(0, 3).map((g, i) => (
                  <p key={i} className="text-xs text-on-surface-variant flex items-start gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    {g}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Top improvements */}
          {result.topImprovements.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Top improvements needed
              </h3>
              <ul className="space-y-2">
                {result.topImprovements.map((imp, i) => (
                  <li key={i} className="text-sm text-on-surface-variant flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed breakdown */}
          <div className="card p-5">
            <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-4">
              <ListChecks className="h-4 w-4 text-primary" />
              Detailed breakdown
            </h3>
            <div className="space-y-3">
              {CRITERIA.map((c) => {
                const criterion = result.breakdown[c.key];
                const pct = criterion.score;
                return (
                  <details key={c.key} className="group">
                    <summary className="flex items-center justify-between cursor-pointer list-none py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={scoreColor(pct)}>{c.icon}</span>
                        <span className="text-sm font-medium text-on-surface truncate">
                          {c.label}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          pct >= 80
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : pct >= 50
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-red-500/10 text-red-600'
                        }`}>
                          {pct}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-text-muted group-open:hidden" />
                      <ChevronUp className="h-4 w-4 text-text-muted hidden group-open:block" />
                    </summary>
                    <div className="ml-7 mt-1 space-y-2 pb-2">
                      {/* Score bar */}
                      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBgColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed">
                        {c.description}
                      </p>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {criterion.feedback}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          {/* Action button */}
          <button
            type="button"
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-3 text-body-md font-semibold text-on-surface transition-all hover:bg-surface-container"
          >
            <RefreshCcw className="h-4 w-4" />
            Check another resume
          </button>
        </div>
      )}
    </div>
  );
}

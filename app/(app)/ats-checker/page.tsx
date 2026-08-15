'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileText,
  XCircle,
  FileCheck,
  AtSign,
  ListChecks,
  Target,
  Calendar,
  Sparkles,
  Loader2,
  Check,
  History,
  BookOpen,
  TrendingUp,
  Shield,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import type { AtsReport } from '@/lib/ats-report';
import { blobUrlToDataUrl, writeAtsFixSession } from '@/lib/ats-fix-session';
import { AtsScanReport } from '@/app/_components/ats-report/AtsScanReport';

/* ------------------------------------------------------------------ */
/*  Sample data                                                        */
/* ------------------------------------------------------------------ */

const SAMPLE_RESUME = `JOHN SMITH
john.smith@email.com | +1 (555) 123-4567
linkedin.com/in/johnsmith | github.com/johnsmith
San Francisco, CA

PROFESSIONAL SUMMARY
Senior Software Engineer with 8+ years of experience building scalable web applications and distributed systems. Passionate about clean architecture, performance optimization, and mentoring junior engineers.

TECHNICAL SKILLS
Languages: JavaScript, TypeScript, Python, Java, SQL
Frontend: React, Next.js, Vue.js, HTML5, CSS3, Tailwind CSS
Backend: Node.js, Express, Django, Spring Boot, GraphQL, REST APIs
Databases: PostgreSQL, MongoDB, Redis, Elasticsearch
Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, Terraform, CI/CD
Testing: Jest, Vitest, Cypress, Playwright, Selenium
Tools: Git, Linux, Webpack, Vite, Datadog, Prometheus

PROFESSIONAL EXPERIENCE

Senior Software Engineer | TechCorp Inc. | Jan 2021 - Present
- Led a team of 5 engineers to redesign the core platform, resulting in 40% improvement in page load times and 25% increase in user engagement
- Designed and implemented a real-time data processing pipeline using Kafka and Redis, handling 2M+ events per day
- Reduced infrastructure costs by 30% by migrating 15 microservices from EC2 to AWS Lambda
- Built an internal developer portal using React and Node.js that automated deployment workflows, saving 100+ engineering hours per month
- Mentored 4 junior engineers through code reviews, pair programming, and technical workshops

Software Engineer | StartupXYZ | Mar 2018 - Dec 2020
- Developed RESTful APIs serving 500K+ daily active users using Node.js and PostgreSQL
- Implemented CI/CD pipeline with GitHub Actions and Docker, reducing deployment time from 2 hours to 15 minutes
- Built real-time dashboard using React and WebSockets, improving team visibility into system health
- Optimized database queries reducing average response time from 800ms to 120ms
- Collaborated with product team to launch 3 major features on schedule

Junior Developer | WebAgency | Jun 2016 - Feb 2018
- Built responsive web applications using React, TypeScript, and Tailwind CSS for 10+ client projects
- Wrote unit and integration tests achieving 90% code coverage
- Participated in agile sprints and daily standups, consistently meeting sprint commitments

EDUCATION
Bachelor of Science in Computer Science | University of California, Berkeley | 2012 - 2016
- GPA: 3.8/4.0 | Dean's List | Teaching Assistant for Data Structures

CERTIFICATIONS
- AWS Certified Solutions Architect - Associate (2023)
- Kubernetes Administrator (CKA) - In Progress

PROJECTS
- Open Source Contributor: Contributed to Next.js documentation and React Testing Library
- Personal Blog: Technical blog on software engineering with 5K+ monthly readers`;

const SAMPLE_JD = `Senior Software Engineer

We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable distributed systems that power our core product.

Requirements:
- 5+ years of experience in software engineering
- Strong proficiency in TypeScript, Node.js, and React
- Experience with AWS, Docker, and Kubernetes
- Deep understanding of PostgreSQL and Redis
- Experience building RESTful APIs and GraphQL services
- Familiarity with CI/CD pipelines and infrastructure as code
- Strong problem-solving and communication skills

Nice to have:
- Experience with Kafka or similar event streaming platforms
- Knowledge of Kubernetes (CKA preferred)
- Open source contributions
- Experience mentoring junior engineers`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type View = 'input' | 'loading' | 'results';

interface ScoreHistoryItem {
  date: string;
  score: number;
  label: string;
}

const HISTORY_KEY = 'ats-checker-history';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-match-success';
  if (score >= 50) return 'text-primary';
  return 'text-error';
}

const BREAKDOWN_COPY_LABELS: { key: keyof AtsCheckResult['breakdown']; label: string }[] = [
  { key: 'sectionStructure', label: 'Section Structure' },
  { key: 'contactInfo', label: 'Contact Info' },
  { key: 'bulletQuality', label: 'Bullet Points' },
  { key: 'quantifiableAchievements', label: 'Quantified Impact' },
  { key: 'skillsOptimization', label: 'Skills Optimization' },
  { key: 'lengthReadability', label: 'Length & Density' },
  { key: 'formatCleanliness', label: 'Format Cleanliness' },
  { key: 'dateConsistency', label: 'Date Formatting' },
];

function loadHistory(): ScoreHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(item: ScoreHistoryItem) {
  const history = loadHistory();
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function AtsCheckerPage() {
  const [view, setView] = useState<View>('input');
  const [resumeText, setResumeText] = useState('');
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [serverReport, setServerReport] = useState<AtsReport | null>(null);
  const [studioResume, setStudioResume] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  // Original uploaded file so Fix Studio can show the real CV, not a re-render.
  const [originalFile, setOriginalFile] = useState<
    { url: string; kind: 'pdf' | 'image' } | null
  >(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openingFix, setOpeningFix] = useState(false);
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [showJdInput, setShowJdInput] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [intakeMode, setIntakeMode] = useState<'upload' | 'paste'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [pendingResult, setPendingResult] = useState<AtsCheckResult | null>(null);
  const pendingResumeRef = useRef<string>('');
  const pendingReportRef = useRef<AtsReport | null>(null);
  const displayFilenameRef = useRef<string | null>(null);
  const [completedMilestones, setCompletedMilestones] = useState<number[]>([]);
  const [milestonesDone, setMilestonesDone] = useState(false);
  const [resumeWordCount, setResumeWordCount] = useState(0);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Keyboard shortcut: Cmd+Enter to submit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (view === 'input') {
          e.preventDefault();
          handlePasteCheck();
        }
      }
      if (e.key === 'Escape' && view === 'results') {
        handleReset();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  // ── Check handler ─────────────────────────────────────────────

  const handleCheck = useCallback(async (text: string, file?: File, jd?: string) => {
    setView('loading');
    setError(null);

    try {
      let payload: BodyInit;
      let headers: Record<string, string> = {};
      let displayFilename: string | null = file?.name ?? null;

      if (file) {
        const form = new FormData();
        form.append('resume', file);
        if (jd) form.append('job_description', jd);
        payload = form;
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify({
          resume_text: text,
          job_description: jd || undefined,
        });
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

      displayFilenameRef.current = displayFilename || 'Pasted text';
      const payloadData = data as AtsCheckResult & {
        resume_text?: string;
        report?: AtsReport;
      };
      pendingResumeRef.current =
        (payloadData.resume_text && String(payloadData.resume_text)) ||
        text ||
        '';
      pendingReportRef.current = payloadData.report ?? null;
      setPendingResult(payloadData);
      // View transitions to 'results' via useEffect when milestones complete
    } catch (e) {
      setError((e as Error).message || 'Network error. Please try again.');
      setView('input');
    }
  }, []);

  // ── File handlers ─────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const validExt = /\.(pdf|docx?|txt)$/i.test(file.name);
    if (!validExt) {
      setError('Please upload a .pdf, .doc, .docx, or .txt file.');
      return;
    }
    setResumeWordCount(500);
    setFilename(file.name);
    // Keep a viewable copy of the real document for the Original preview.
    setOriginalFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      if (isPdf) return { url: URL.createObjectURL(file), kind: 'pdf' };
      if (isImage) return { url: URL.createObjectURL(file), kind: 'image' };
      return null; // doc/docx/txt have no faithful client render
    });
    handleCheck(undefined as unknown as string, file, jobDescriptionText);
  }, [handleCheck, jobDescriptionText]);

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

  // ── Paste check ───────────────────────────────────────────────

  const handlePasteCheck = useCallback(() => {
    if (!resumeText.trim() || resumeText.trim().length < 50) {
      setError('Please enter at least 50 characters of resume text.');
      return;
    }
    setError(null);
    const wc = resumeText.trim().split(/\s+/).filter(Boolean).length;
    setResumeWordCount(wc);
    handleCheck(resumeText, undefined, jobDescriptionText);
  }, [resumeText, jobDescriptionText, handleCheck]);

  // ── Sample resume ─────────────────────────────────────────────

  const loadSample = useCallback(() => {
    setResumeText(SAMPLE_RESUME);
    setJobDescriptionText(SAMPLE_JD);
    setShowJdInput(true);
    setIntakeMode('paste');
    setError(null);
    textAreaRef.current?.focus();
  }, []);

  // ── Reset ──────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setView('input');
    setResult(null);
    setServerReport(null);
    setStudioResume('');
    setError(null);
    setFilename(null);
    setOriginalFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setCopied(false);
  }, []);

  // ── Copy results ──────────────────────────────────────────────

  const copyResults = useCallback(() => {
    if (!result) return;
    const text = [
      `ATS Resume Score: ${result.overallScore}/100`,
      '',
      'Breakdown:',
      ...BREAKDOWN_COPY_LABELS.map((c) => {
        const cr = result.breakdown[c.key];
        return `  ${c.label}: ${cr.score}/100 - ${cr.feedback}`;
      }),
      '',
      'Top Improvements:',
      ...result.topImprovements.map((imp, i) => `  ${i + 1}. ${imp}`),
      '',
      ...(result.jdMatch ? [
        `JD Keyword Match: ${result.jdMatch.matchScore}%`,
        `Matched: ${result.jdMatch.matched.length} keywords`,
        `Missing: ${result.jdMatch.missing.length} keywords`,
      ] : []),
    ].join('\n');

    const copyToClipboard = async (txt: string) => {
      try {
        await navigator.clipboard.writeText(txt);
      } catch {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    };
    copyToClipboard(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  // ── Milestone config ──────────────────────────────────────────

  const MILESTONES = [
    { id: 'parsing', label: 'Structure', icon: <FileText className="h-4 w-4" /> },
    { id: 'contact', label: 'Contact', icon: <AtSign className="h-4 w-4" /> },
    { id: 'bullets', label: 'Bullets', icon: <ListChecks className="h-4 w-4" /> },
    { id: 'metrics', label: 'Metrics', icon: <Target className="h-4 w-4" /> },
    { id: 'skills', label: 'Skills', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'format', label: 'Format', icon: <FileCheck className="h-4 w-4" /> },
    { id: 'dates', label: 'Dates', icon: <Calendar className="h-4 w-4" /> },
    { id: 'score', label: 'Score', icon: <TrendingUp className="h-4 w-4" /> },
  ] as const;

  function quickAnalyze(id: string): string {
    const text = resumeText;

    // For file uploads, resumeText is empty — show generic messages
    if (!text.trim()) {
      const fallbacks: Record<string, string> = {
        parsing: 'Processing file data…',
        contact: 'Extracting contact fields…',
        bullets: 'Reading bullet points…',
        metrics: 'Scanning for metrics…',
        skills: 'Identifying keywords…',
        format: 'Checking formatting…',
        dates: 'Validating dates…',
        score: 'Computing score…',
      };
      return fallbacks[id] || '';
    }

    // ── All-CAPS headers + Title Case headers (matching findSectionHeaders logic) ──
    function countHeaders(t: string): number {
      const lines = t.split('\n');
      return lines.filter((l) => {
        const tr = l.trim();
        if (!tr || tr.length < 5) return false;
        // ALL-CAPS: "PROFESSIONAL EXPERIENCE", "EDUCATION"
        if (/^[A-Z][A-Z\s&/.-]+$/.test(tr)) return true;
        // Title Case: "Professional Experience", "Technical Skills"
        if (/^[A-Z][A-Za-z0-9\/#&.'\-+_]*(?:\s+[A-Z][A-Za-z0-9\/#&.'\-+_]*)*$/.test(tr) &&
            /[a-z]/.test(tr) && tr.split(/\s+/).length >= 2) return true;
        return false;
      }).length;
    }

    // ── Bullet detection matching findBulletLines in lib/ats-checker.ts ──
    function countBullets(t: string): number {
      const bulletChars = '-•*→⁃▪▸▹►‣⁌⁍∙○●';
      const bulletRe = new RegExp(`^\\s*[${bulletChars}]`);
      return t.split('\n').filter((l) => {
        const tr = l.trim();
        if (!tr) return false;
        if (bulletRe.test(tr)) return true;
        if (/^\d+[.)]\s/.test(tr)) return true;
        if (/^[\[|]/.test(tr) && tr.length > 10) return true;
        return false;
      }).length;
    }

    switch (id) {
      case 'parsing': {
        const n = countHeaders(text);
        if (n === 0) return 'No standard headers detected';
        return `${n} section${n !== 1 ? 's' : ''} identified`;
      }
      case 'contact': {
        const parts: string[] = [];
        if (/@/.test(text)) parts.push('email');
        if (/linkedin/i.test(text)) parts.push('LinkedIn');
        if (/\+\d|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text)) parts.push('phone');
        if (parts.length > 0) return `Detected ${parts.join(' · ')}`;
        return 'Checking identity fields…';
      }
      case 'bullets': {
        const n = countBullets(text);
        if (n === 0) {
          // Check if there are any dash-prefixed lines that the bullet regex might have missed
          const dashLines = text.split('\n').filter(l => l.trim().startsWith('-')).length;
          if (dashLines > 0) return `${dashLines} bullet${dashLines !== 1 ? 's' : ''} detected`;
          return 'No bullet points found';
        }
        return `${n} bullet point${n !== 1 ? 's' : ''} parsed`;
      }
      case 'metrics': {
        const pct = (text.match(/%/g) || []).length;
        const dollars = (text.match(/\$/g) || []).length;
        if (pct > 0 && dollars > 0) return `${pct}x percentages · ${dollars}x monetary values`;
        if (pct > 0) return `${pct} percentage-based metrics`;
        if (dollars > 0) return `${dollars} monetary values`;
        return 'Scanning for quantified data…';
      }
      case 'skills': {
        const tech = ['javascript','typescript','python','react','node.js','docker','aws','sql','graphql','kubernetes','terraform','redis','postgresql','mongodb','kafka','next.js','vue.js','git','linux','jenkins','circleci','github actions','postgresql','mysql','ci/cd','machine learning','nlp','openai'];
        const lower = text.toLowerCase();
        const found = tech.filter(t => lower.includes(t));
        if (found.length > 0) return `${found.length} matched (${found.slice(0,3).join(', ')}${found.length > 3 ? '…' : ''})`;
        return 'Identifying technical keywords…';
      }
      case 'format': {
        const smart = (text.match(/[\u2018\u2019\u201C\u201D\u2013\u2014]/g) || []).length;
        if (smart > 0) return `${smart} special character${smart !== 1 ? 's' : ''} found`;
        return 'Format is clean';
      }
      case 'dates': {
        const years = text.match(/\b(19|20)\d{2}\b/g) || [];
        const unique = [...new Set(years)];
        if (unique.length > 0) return `${unique.length} year${unique.length !== 1 ? 's' : ''} referenced`;
        return 'Checking date consistency…';
      }
      case 'score':
        return 'Weighing all 8 criteria…';
      default:
        return '';
    }
  }

  // ── Milestone timing effect (word-count-based) ────────────────

  useEffect(() => {
    if (view !== 'loading') {
      setCompletedMilestones([]);
      setMilestonesDone(false);
      return;
    }

    // Slow enough to feel deliberate (~8–14s typical), not a flash checklist.
    const count = Math.max(resumeWordCount, 1);
    const base = count < 300 ? 700 : count < 800 ? 900 : count < 1500 ? 1100 : 1300;
    const durations = [1.0, 1.15, 0.95, 1.2, 1.1, 0.9, 1.0, 1.35].map((v) => Math.round(base * v));

    let currentStep = 0;
    let timer: ReturnType<typeof setTimeout>;

    const advance = () => {
      if (currentStep < MILESTONES.length) {
        setCompletedMilestones(prev => [...prev, currentStep]);
        currentStep++;
        const delay = durations[Math.min(currentStep - 1, durations.length - 1)];
        timer = setTimeout(advance, delay);
      } else {
        setMilestonesDone(true);
      }
    };

    timer = setTimeout(advance, durations[0] || 400);
    return () => clearTimeout(timer);
  }, [view, resumeWordCount]);

  // ── Show results when both milestones done AND API ready ───────

  useEffect(() => {
    if (milestonesDone && pendingResult && view === 'loading') {
      const data = pendingResult;
      setPendingResult(null);
      setResult(data);
      setServerReport(pendingReportRef.current);
      pendingReportRef.current = null;
      setStudioResume(pendingResumeRef.current || '');
      if (pendingResumeRef.current && !resumeText.trim()) {
        setResumeText(pendingResumeRef.current);
      }
      setFilename(displayFilenameRef.current);
      setView('results');

      const item: ScoreHistoryItem = {
        date: formatDate(),
        score: data.overallScore,
        label: displayFilenameRef.current || 'Pasted text',
      };
      saveHistory(item);
      setHistory(loadHistory());

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [milestonesDone, pendingResult, view]);

  const openFixStudioInNewTab = useCallback(async () => {
    if (!result || studioResume.trim().length < 50) return;
    setOpeningFix(true);
    try {
      let originalFileDataUrl: string | null = null;
      let originalFileKind: 'pdf' | 'image' | null = null;
      if (originalFile) {
        originalFileDataUrl = await blobUrlToDataUrl(originalFile.url);
        originalFileKind = originalFileDataUrl ? originalFile.kind : null;
      }
      writeAtsFixSession({
        resume: studioResume,
        result,
        jobDescription: jobDescriptionText || undefined,
        filename,
        originalFileDataUrl,
        originalFileKind,
      });
      const win = window.open('/ats-checker/fix', '_blank');
      if (!win) {
        // Popup blocked — same-tab fallback so Fix still works
        window.location.href = '/ats-checker/fix';
      }
    } finally {
      setOpeningFix(false);
    }
  }, [result, studioResume, originalFile, jobDescriptionText, filename]);

  return (
    <div className="mx-auto max-w-page space-y-8 animate-fade-in">
      {view === 'input' && (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface">
              ATS Resume Checker
            </h1>
            <p className="mt-2 max-w-xl text-body-md text-on-surface-variant">
              See how an applicant tracking system parses your resume, then fix gaps before you apply.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadSample} className="btn">
              <BookOpen className="h-4 w-4" />
              Try a sample
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className={showHistory ? 'btn-primary' : 'btn'}
                aria-expanded={showHistory}
              >
                <History className="h-4 w-4" />
                Recent ({history.length})
              </button>
            )}
          </div>
        </header>
      )}

      {view === 'input' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-start">
          <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-card">
            <div
              className="mb-5 flex gap-1 rounded-xl bg-surface-container-low p-1"
              role="tablist"
              aria-label="How to add your resume"
            >
              <button
                type="button"
                role="tab"
                aria-selected={intakeMode === 'upload'}
                onClick={() => setIntakeMode('upload')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  intakeMode === 'upload'
                    ? 'bg-surface-container-lowest text-on-surface shadow-card'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload file
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={intakeMode === 'paste'}
                onClick={() => setIntakeMode('paste')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                  intakeMode === 'paste'
                    ? 'bg-surface-container-lowest text-on-surface shadow-card'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <FileText className="h-4 w-4" />
                Paste text
              </button>
            </div>

            {intakeMode === 'upload' ? (
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border border-dashed p-10 text-center transition-colors ${
                  dragOver
                    ? 'border-primary bg-surface-container-low'
                    : 'border-outline-variant hover:border-primary/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={onFileSelect}
                />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-low text-primary">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-4 text-body-md font-semibold text-on-surface">Drop your resume here</p>
                <p className="mt-1 text-sm text-on-surface-variant">PDF, Word, or text · click to browse</p>
              </div>
            ) : (
              <textarea
                ref={textAreaRef}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste the full resume text…"
                className="input min-h-[280px] resize-y font-sans"
                rows={12}
              />
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-error-container p-3.5 text-sm text-on-error-container">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {intakeMode === 'paste' && (
              <button
                type="button"
                onClick={handlePasteCheck}
                disabled={resumeText.trim().length < 50}
                className="btn-primary mt-5 w-full"
              >
                <FileCheck className="h-5 w-5" />
                Check resume
                <span className="hidden text-label-md font-medium text-on-primary/70 sm:inline">
                  Ctrl+Enter
                </span>
              </button>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label htmlFor="ats-jd" className="text-sm font-semibold text-on-surface">
                  Job description
                </label>
                <button
                  type="button"
                  onClick={() => setShowJdInput((v) => !v)}
                  className="btn-ghost px-2 py-1 text-label-md"
                >
                  {showJdInput ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mb-3 text-sm text-on-surface-variant">
                Optional. Paste a JD to see keyword gaps against this resume.
              </p>
              {showJdInput && (
                <textarea
                  id="ats-jd"
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  placeholder="Paste the job description…"
                  className="input min-h-[140px] resize-y"
                  rows={5}
                />
              )}
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-card">
              <ul className="space-y-3 text-sm text-on-surface-variant">
                <li className="flex items-start gap-2.5">
                  <FileCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Eight structural checks: sections, contact, bullets, metrics, skills, format, dates, score.
                </li>
                <li className="flex items-start gap-2.5">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Processed in memory and not saved to your profile.
                </li>
              </ul>
            </section>

            {showHistory && history.length > 0 && (
              <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-on-surface">Recent checks</h2>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(HISTORY_KEY);
                      setHistory([]);
                    }}
                    className="btn-ghost px-2 py-1 text-label-md text-error"
                  >
                    Clear
                  </button>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {history.map((item, i) => (
                    <li
                      key={`${item.date}-${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-2"
                    >
                      <span className={`text-sm font-bold tabular-nums ${scoreColor(item.score)}`}>
                        {item.score}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
                        {item.label}
                      </span>
                      <span className="shrink-0 text-label-md text-text-muted">{item.date}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {view === 'loading' && (
        <div className="rounded-2xl bg-surface-container-lowest shadow-card overflow-hidden animate-fade-in">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="relative border-b border-outline-variant/30 px-6 py-7 sm:border-b-0 sm:border-r">
              <div className="mb-5">
                <h2 className="text-headline-md font-semibold text-on-surface">Scanning resume</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {resumeWordCount > 0 ? `${resumeWordCount.toLocaleString()} words · ` : ''}
                  {MILESTONES.length} checks
                </p>
              </div>

              <div className="relative mx-auto max-w-[200px] aspect-[3/4] overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-low">
                <div className="absolute inset-x-4 top-4 space-y-2.5">
                  <div className="h-2 w-2/3 rounded-full ats-scan-line-skeleton" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-70" />
                  <div className="h-1.5 w-5/6 rounded-full ats-scan-line-skeleton opacity-60" />
                  <div className="mt-4 h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-50" />
                  <div className="h-1.5 w-4/5 rounded-full ats-scan-line-skeleton opacity-50" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-40" />
                  <div className="h-1.5 w-3/5 rounded-full ats-scan-line-skeleton opacity-40" />
                </div>
                <div className="pointer-events-none absolute inset-x-0 h-10 ats-scan-beam">
                  <div className="h-px w-full bg-primary/80" />
                  <div className="h-8 w-full bg-gradient-to-b from-primary/20 to-transparent" />
                </div>
              </div>
            </div>

            <div className="flex flex-col px-6 py-6">
              <div className="flex-1 space-y-0.5">
                {MILESTONES.map((m, i) => {
                  const isComplete = completedMilestones.includes(i);
                  const isActive = i === completedMilestones.length && !isComplete;
                  const isPending = !isComplete && !isActive;

                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 py-1.5 ${
                        isActive ? 'opacity-100' : isPending ? 'opacity-40' : 'opacity-90'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          isComplete
                            ? 'bg-match-success/15 text-match-success'
                            : isActive
                              ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                              : 'bg-surface-container text-text-muted'
                        }`}
                      >
                        {isComplete ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : isActive ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span className="text-label-md font-bold">{i + 1}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`text-sm ${
                              isComplete || isActive
                                ? 'font-semibold text-on-surface'
                                : 'text-text-muted'
                            }`}
                          >
                            {m.label}
                          </span>
                          {(isComplete || isActive) && (
                            <span
                              className={`truncate text-label-md ${
                                isComplete ? 'text-on-surface-variant' : 'text-text-muted'
                              }`}
                            >
                              {quickAnalyze(m.id)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-container">
                  <div
                    className="h-full rounded-full teal-gradient transition-all duration-700 ease-out"
                    style={{
                      width: `${
                        completedMilestones.length > 0
                          ? Math.round((completedMilestones.length / MILESTONES.length) * 100)
                          : 4
                      }%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-label-md text-text-muted">
                  <span>
                    {completedMilestones.length > 0
                      ? `${Math.round((completedMilestones.length / MILESTONES.length) * 100)}%`
                      : 'Starting…'}
                  </span>
                  <span>
                    {completedMilestones.length}/{MILESTONES.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS VIEW ───────────────────────────────────────── */}
      {view === 'results' && result && (
        <div ref={resultRef}>
          <AtsScanReport
            result={result}
            report={serverReport}
            filename={filename}
            studioResume={studioResume}
            openingFix={openingFix}
            copied={copied}
            onUpgrade={() => void openFixStudioInNewTab()}
            onCopy={copyResults}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}



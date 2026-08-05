'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileText,
  XCircle,
  Search,
  FileCheck,
  AtSign,
  ListChecks,
  Target,
  Calendar,
  Sparkles,
  Loader2,
  Check,
  Keyboard,
  History,
  BookOpen,
  TrendingUp,
  Briefcase,
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
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
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
  const [showJdInput, setShowJdInput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* Marketing header — input only so results own the screen */}
      {view === 'input' && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-surface-card to-surface-card p-6 border border-outline-variant/40 shadow-sm">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <h1 className="font-headline text-heading-sm font-bold text-on-background flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-on-primary shadow-sm">
                <Search className="h-5 w-5" />
              </span>
              ATS Resume Checker
            </h1>
            <p className="text-body-md text-on-surface-variant mt-2 max-w-xl">
              See how ATS systems read your resume — then fix weak spots before you apply.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
                <FileCheck className="h-3.5 w-3.5 text-primary" />
                8 ATS checks
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                Not stored
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── INPUT VIEW ─────────────────────────────────────────── */}
      {view === 'input' && (
        <div className="space-y-5">
          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadSample}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/8 rounded-full px-3.5 py-1.5 border border-primary/20 hover:bg-primary/15 transition-all"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Try sample resume
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted bg-surface-container rounded-full px-3.5 py-1.5 border border-outline-variant/40 hover:bg-surface-container-higher transition-all"
              >
                <History className="h-3.5 w-3.5" />
                History ({history.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowJdInput(!showJdInput)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3.5 py-1.5 border transition-all ${
                showJdInput
                  ? 'text-primary bg-primary/8 border-primary/20'
                  : 'text-text-muted bg-surface-container border-outline-variant/40 hover:bg-surface-container-higher'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              {showJdInput ? 'JD comparison on' : 'Add JD comparison'}
            </button>
          </div>

          {/* History panel */}
          {showHistory && history.length > 0 && (
            <div className="rounded-2xl border border-outline-variant/40 bg-surface-card p-4 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Recent checks
                </h3>
                <button
                  type="button"
                  onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}
                  className="text-[11px] text-text-muted hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold tabular-nums ${scoreColor(item.score)}`}>
                        {item.score}
                      </span>
                      <span className="text-xs text-on-surface-variant truncate">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-text-muted shrink-0">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drag & drop area */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
              dragOver
                ? 'border-primary bg-primary/5 shadow-primary-glow scale-[1.01]'
                : 'border-outline-variant hover:border-primary/40 hover:bg-surface-container-lowest'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={onFileSelect}
            />
            <div className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              dragOver ? 'bg-primary/15 scale-110' : 'bg-surface-container'
            }`}>
              <Upload className={`h-6 w-6 transition-colors ${
                dragOver ? 'text-primary' : 'text-text-muted'
              }`} />
            </div>
            <p className="text-body-md font-semibold text-on-surface mt-4 mb-1">
              Upload your resume
            </p>
            <p className="text-sm text-text-muted">
              Drop a .pdf, .doc, .docx, or .txt file here, or click to browse
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-outline-variant/60" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
              or paste your resume
            </span>
            <div className="flex-1 h-px bg-outline-variant/60" />
          </div>

          {/* Text area */}
          <textarea
            ref={textAreaRef}
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume text here..."
            className="w-full min-h-[200px] rounded-2xl border border-outline-variant bg-surface-card p-4 text-sm text-on-surface placeholder:text-text-muted/60 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/12 resize-y shadow-sm"
            rows={8}
          />

          {/* JD comparison input */}
          {showJdInput && (
            <div className="space-y-2 animate-fade-in">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Job Description{' '}
                <span className="text-text-muted/60 font-normal normal-case">(optional — for keyword gap analysis)</span>
              </label>
              <textarea
                value={jobDescriptionText}
                onChange={(e) => setJobDescriptionText(e.target.value)}
                placeholder="Paste the job description here to see which keywords your resume matches..."
                className="w-full min-h-[120px] rounded-2xl border border-outline-variant bg-surface-card p-4 text-sm text-on-surface placeholder:text-text-muted/60 outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/12 resize-y shadow-sm"
                rows={4}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-500/8 p-3.5 text-sm text-red-600 border border-red-500/15 animate-fade-in">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Check button */}
          <button
            type="button"
            onClick={handlePasteCheck}
            disabled={resumeText.trim().length < 50}
            className="group relative w-full flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-6 py-3.5 text-body-md font-semibold text-on-primary shadow-card transition-all hover:bg-primary/90 hover:shadow-primary-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 disabled:hidden" />
            <FileCheck className="h-5 w-5" />
            Check My Resume
            <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1.5 text-[10px] text-on-primary/60 bg-white/10 rounded-md px-1.5 py-0.5 font-mono">
              <Keyboard className="h-2.5 w-2.5" />⌘⏎
            </kbd>
          </button>

          <p className="text-center text-[11px] text-text-muted">
            Your resume is processed in-memory and never stored. Fully private.
          </p>
        </div>
      )}

      {/* ── LOADING VIEW ───────────────────────────────────────── */}
      {view === 'loading' && (
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm overflow-hidden animate-fade-in">
          <div className="grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-0">
            {/* Document scan visual */}
            <div className="relative px-6 pt-7 pb-6 border-b sm:border-b-0 sm:border-r border-outline-variant/20 bg-gradient-to-b from-primary/[0.04] to-transparent">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-body-md font-semibold text-on-surface">
                    Scanning resume
                  </h2>
                  <p className="text-xs text-text-muted">
                    {resumeWordCount > 0 ? `${resumeWordCount.toLocaleString()} words · ` : ''}
                    {MILESTONES.length} checks
                  </p>
                </div>
              </div>

              <div className="relative mx-auto max-w-[220px] aspect-[3/4] rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-sm overflow-hidden">
                <div className="absolute inset-x-4 top-4 space-y-2.5">
                  <div className="h-2 w-2/3 rounded-full ats-scan-line-skeleton" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-70" />
                  <div className="h-1.5 w-5/6 rounded-full ats-scan-line-skeleton opacity-60" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-50 mt-4" />
                  <div className="h-1.5 w-4/5 rounded-full ats-scan-line-skeleton opacity-50" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-40" />
                  <div className="h-1.5 w-3/5 rounded-full ats-scan-line-skeleton opacity-40" />
                  <div className="h-1.5 w-full rounded-full ats-scan-line-skeleton opacity-35 mt-4" />
                  <div className="h-1.5 w-5/6 rounded-full ats-scan-line-skeleton opacity-35" />
                  <div className="h-1.5 w-2/3 rounded-full ats-scan-line-skeleton opacity-30" />
                </div>
                {/* Scan beam */}
                <div className="pointer-events-none absolute inset-x-0 h-10 ats-scan-beam">
                  <div className="h-px w-full bg-primary/80 shadow-[0_0_12px_2px_rgba(0,106,101,0.45)]" />
                  <div className="h-8 w-full bg-gradient-to-b from-primary/25 to-transparent ats-scan-glow" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-container-lowest/80" />
              </div>
            </div>

            {/* Milestone timeline */}
            <div className="px-5 py-5 flex flex-col">
              <div className="space-y-0.5 flex-1">
                {MILESTONES.map((m, i) => {
                  const isComplete = completedMilestones.includes(i);
                  const isActive = i === completedMilestones.length && !isComplete;
                  const isPending = !isComplete && !isActive;

                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2.5 py-1.5 transition-all duration-700 ${
                        isActive ? 'opacity-100' : isPending ? 'opacity-30' : 'opacity-90'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-700 ${
                        isComplete
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : isActive
                            ? 'bg-primary/12 text-primary ring-2 ring-primary/20'
                            : 'bg-surface-container text-text-muted'
                      }`}>
                        {isComplete ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : isActive ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <span className="text-[10px] font-bold">{i + 1}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm transition-colors duration-500 ${
                            isComplete
                              ? 'text-on-surface'
                              : isActive
                                ? 'text-on-surface font-semibold'
                                : 'text-text-muted'
                          }`}>
                            {m.label}
                          </span>
                          {(isComplete || isActive) && (
                            <span className={`text-[11px] truncate ${
                              isComplete ? 'text-emerald-600' : 'text-text-muted'
                            }`}>
                              {quickAnalyze(m.id)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 mt-2">
                <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#006a65] via-[#2cc9c0] to-[#006a65] transition-all duration-700 ease-out"
                    style={{
                      width: `${completedMilestones.length > 0
                        ? Math.round((completedMilestones.length / MILESTONES.length) * 100)
                        : 4}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-text-muted">
                    {completedMilestones.length > 0
                      ? `${Math.round((completedMilestones.length / MILESTONES.length) * 100)}%`
                      : 'Starting…'}
                  </span>
                  <span className="text-[10px] text-text-muted">
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



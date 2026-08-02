'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCcw,
  Search,
  FileCheck,
  AtSign,
  ListChecks,
  Target,
  Ruler,
  Calendar,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Keyboard,
  History,
  BookOpen,
  TrendingUp,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Zap,
  Shield,
  Lightbulb,
} from 'lucide-react';
import type { AtsCheckResult, ResumeStats, JdMatchResult } from '@/lib/ats-checker';
import { blobUrlToDataUrl, writeAtsFixSession } from '@/lib/ats-fix-session';

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

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreRing(score: number): string {
  if (score >= 80) return 'stroke-emerald-500';
  if (score >= 50) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
/*  Criteria config                                                    */
/* ------------------------------------------------------------------ */

interface CriterionMeta {
  key: keyof AtsCheckResult['breakdown'];
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  description: string;
  tip: string;
}

const CRITERIA: CriterionMeta[] = [
  {
    key: 'sectionStructure',
    label: 'Section Structure',
    shortLabel: 'Sections',
    icon: <ListChecks className="h-4 w-4" />,
    description: 'Standard sections (Experience, Education, Skills) that ATS parsers recognize.',
    tip: 'Include at minimum: Experience, Education, and Skills sections.',
  },
  {
    key: 'contactInfo',
    label: 'Contact Info',
    shortLabel: 'Contact',
    icon: <AtSign className="h-4 w-4" />,
    description: 'Name, email, phone, LinkedIn, and location clearly at the top.',
    tip: 'Put your name, email, phone, LinkedIn, and location in the top 5 lines.',
  },
  {
    key: 'bulletQuality',
    label: 'Bullet Points',
    shortLabel: 'Bullets',
    icon: <FileText className="h-4 w-4" />,
    description: 'Consistent formatting and sufficient detail in experience bullets.',
    tip: 'Use "- " for all bullets. Aim for 10-15 total across your resume.',
  },
  {
    key: 'quantifiableAchievements',
    label: 'Quantified Impact',
    shortLabel: 'Metrics',
    icon: <Target className="h-4 w-4" />,
    description: 'Numbers, percentages, and metrics that show measurable results.',
    tip: 'Add numbers: % improvements, $ amounts, time saved, people managed.',
  },
  {
    key: 'skillsOptimization',
    label: 'Skills Optimization',
    shortLabel: 'Skills',
    icon: <Sparkles className="h-4 w-4" />,
    description: 'Concrete technical keywords, organized and contextualized in experience.',
    tip: 'List 10-15 concrete skills and mention them in experience bullets too.',
  },
  {
    key: 'lengthReadability',
    label: 'Length & Density',
    shortLabel: 'Length',
    icon: <Ruler className="h-4 w-4" />,
    description: 'Appropriate length (1–2 pages) with good content density.',
    tip: 'Aim for 400-1000 words. This is roughly 1-2 pages.',
  },
  {
    key: 'formatCleanliness',
    label: 'Format Cleanliness',
    shortLabel: 'Format',
    icon: <FileCheck className="h-4 w-4" />,
    description: 'Clean ASCII text — no smart quotes, unicode bullets, or special characters.',
    tip: 'Use plain ASCII: " for quotes, - for bullets, -- for dashes.',
  },
  {
    key: 'dateConsistency',
    label: 'Date Formatting',
    shortLabel: 'Dates',
    icon: <Calendar className="h-4 w-4" />,
    description: 'Consistent and complete date ranges with month-level granularity.',
    tip: 'Format dates as "Mon YYYY - Mon YYYY" for each role.',
  },
];

/* ------------------------------------------------------------------ */
/*  Radar Chart Component                                              */
/* ------------------------------------------------------------------ */

function RadarChart({ breakdown }: { breakdown: AtsCheckResult['breakdown'] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 85;
  const levels = 5;

  const values = CRITERIA.map((c) => breakdown[c.key].score / 100);
  const angleStep = (2 * Math.PI) / values.length;

  const gridPoints = (level: number) => {
    const r = (radius / levels) * level;
    return values
      .map((_, i) => {
        const a = angleStep * i - Math.PI / 2;
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      })
      .join(' ');
  };

  const dataPoints = values
    .map((v, i) => {
      const a = angleStep * i - Math.PI / 2;
      const r = radius * v;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {/* Grid rings */}
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={gridPoints(level)}
          fill="none"
          className="stroke-surface-container-highest"
          strokeWidth={1}
        />
      ))}

      {/* Axis lines */}
      {values.map((_, i) => {
        const a = angleStep * i - Math.PI / 2;
        const x2 = cx + radius * Math.cos(a);
        const y2 = cy + radius * Math.sin(a);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            className="stroke-surface-container-highest"
            strokeWidth={1}
          />
        );
      })}

      {/* Data area */}
      <polygon
        points={dataPoints}
        fill="url(#radarGradient)"
        fillOpacity={0.35}
        className="transition-all duration-700"
      />              <polygon
                    points={dataPoints}
                    fill="none"
                    className="stroke-primary transition-all duration-700"
                    strokeWidth={2}
                    strokeLinejoin="round"
      />

      {/* Data points */}
      {values.map((v, i) => {
        const a = angleStep * i - Math.PI / 2;
        const r = radius * v;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3.5}
            className="fill-primary stroke-surface-bright stroke-[2px] transition-all duration-700"
          />
        );
      })}

      {/* Labels */}
      {CRITERIA.map((c, i) => {
        const a = angleStep * i - Math.PI / 2;
        const labelR = radius + 18;
        const x = cx + labelR * Math.cos(a);
        const y = cy + labelR * Math.sin(a);
        const anchor =
          Math.abs(Math.cos(a)) < 0.1 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        const dy = Math.abs(Math.sin(a)) < 0.3 ? '0.35em' : Math.sin(a) > 0 ? '1em' : '-0.2em';
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor={anchor}
            dy={dy}
            className="fill-text-muted"
            fontSize={10}
            fontWeight={500}
          >
            {c.shortLabel}
          </text>
        );
      })}

      <defs>
        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#006a65" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#2cc9c0" stopOpacity={0.3} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated Score Ring                                                 */
/* ------------------------------------------------------------------ */

function AnimatedScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = score / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.round(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [score]);

  const offset = circ * (1 - animatedScore / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-surface-container"
          strokeWidth={7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={7}
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={scoreRing(score)}
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${scoreColor(score)} tabular-nums`}>
          {animatedScore}
        </span>
        <span className="text-[9px] font-semibold text-text-muted uppercase tracking-widest">
          / 100
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-container/50 px-3 py-2.5 border border-outline-variant/30">
      <span className="text-text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-text-muted truncate">{label}</p>
        <p className="text-sm font-semibold text-on-surface tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function AtsCheckerPage() {
  const [view, setView] = useState<View>('input');
  const [resumeText, setResumeText] = useState('');
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [result, setResult] = useState<AtsCheckResult | null>(null);
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
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [pendingResult, setPendingResult] = useState<AtsCheckResult | null>(null);
  const pendingResumeRef = useRef<string>('');
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
      const payloadData = data as AtsCheckResult & { resume_text?: string };
      pendingResumeRef.current =
        (payloadData.resume_text && String(payloadData.resume_text)) ||
        text ||
        '';
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
    setStudioResume('');
    setError(null);
    setFilename(null);
    setOriginalFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setCopied(false);
    setExpandedCriterion(null);
  }, []);

  // ── Copy results ──────────────────────────────────────────────

  const copyResults = useCallback(() => {
    if (!result) return;
    const text = [
      `ATS Resume Score: ${result.overallScore}/100`,
      '',
      'Breakdown:',
      ...CRITERIA.map((c) => {
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
    { id: 'parsing', label: 'Parsing resume structure', icon: <FileText className="h-4 w-4" /> },
    { id: 'contact', label: 'Checking contact information', icon: <AtSign className="h-4 w-4" /> },
    { id: 'bullets', label: 'Evaluating bullet point quality', icon: <ListChecks className="h-4 w-4" /> },
    { id: 'metrics', label: 'Scanning for quantified metrics', icon: <Target className="h-4 w-4" /> },
    { id: 'skills', label: 'Analyzing skills optimization', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'format', label: 'Checking formatting cleanliness', icon: <FileCheck className="h-4 w-4" /> },
    { id: 'dates', label: 'Validating date formatting', icon: <Calendar className="h-4 w-4" /> },
    { id: 'score', label: 'Computing ATS compatibility score', icon: <TrendingUp className="h-4 w-4" /> },
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

    const count = Math.max(resumeWordCount, 1);
    const base = count < 300 ? 250 : count < 800 ? 400 : count < 1500 ? 550 : 750;
    const durations = [1.0, 1.2, 0.9, 1.3, 1.1, 0.8, 1.0, 1.5].map(v => Math.round(base * v));

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
      {/* Header */}
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
            Analyze your resume for Applicant Tracking System compatibility. 
            Free, instant, no AI — fully private and processed in-memory.
          </p>
          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
              <FileCheck className="h-3.5 w-3.5 text-primary" />
              8 criteria checked
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Instant results
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              100% private
            </span>
          </div>
        </div>
      </div>

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
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-outline-variant/20">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/3 rounded-full blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-container animate-pulse flex items-center justify-center">
                <Search className="h-5 w-5 text-on-primary" />
              </div>
              <div>
                <h2 className="text-body-md font-semibold text-on-surface">
                  Analyzing your resume
                </h2>
                <p className="text-xs text-text-muted">
                  {resumeWordCount > 0 && `${resumeWordCount} words`}
                  {resumeWordCount > 0 && ' · '}
                  {MILESTONES.length} checks
                </p>
              </div>
            </div>
          </div>

          {/* Milestone timeline */}
          <div className="px-6 py-4 space-y-0.5">
            {MILESTONES.map((m, i) => {
              const isComplete = completedMilestones.includes(i);
              const isActive = i === completedMilestones.length && !isComplete;
              const isPending = !isComplete && !isActive;

              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 py-2 transition-all duration-500 ${
                    isActive ? 'opacity-100' : isPending ? 'opacity-35' : 'opacity-85'
                  }`}
                >
                  {/* Status bubble */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                    isComplete
                      ? 'bg-emerald-500/15 text-emerald-500 scale-100'
                      : isActive
                        ? 'bg-primary/12 text-primary'
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

                  {/* Icon */}
                  <span className={`shrink-0 transition-colors duration-500 ${
                    isComplete ? 'text-emerald-500' : isActive ? 'text-primary' : 'text-text-muted'
                  }`}>
                    {m.icon}
                  </span>

                  {/* Label + detail */}
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className={`text-sm transition-colors duration-500 ${
                      isComplete
                        ? 'text-on-surface'
                        : isActive
                          ? 'text-on-surface font-semibold'
                          : 'text-text-muted'
                    }`}>
                      {m.label}
                    </span>
                    {isComplete && (
                      <span className="text-xs text-emerald-600 truncate animate-slide-up">
                        {quickAnalyze(m.id)}
                      </span>
                    )}
                    {isActive && (
                      <span className="text-xs text-text-muted truncate animate-pulse-dot">
                        {quickAnalyze(m.id)}
                      </span>
                    )}
                  </div>

                  {/* Active pulse dot */}
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-ping" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="px-6 pb-6 pt-1">
            <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#006a65] via-[#2cc9c0] to-[#006a65] transition-all duration-500 ease-out"
                style={{
                  width: `${completedMilestones.length > 0
                    ? Math.round((completedMilestones.length / MILESTONES.length) * 100)
                    : 2}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-text-muted">
                {completedMilestones.length > 0
                  ? `${Math.round((completedMilestones.length / MILESTONES.length) * 100)}% complete`
                  : 'Starting…'}
              </span>
              <span className="text-[10px] text-text-muted">
                {completedMilestones.length}/{MILESTONES.length} steps
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS VIEW ───────────────────────────────────────── */}
      {view === 'results' && result && (
        <div ref={resultRef} className="space-y-5">
          {/* Score hero card */}
          <div
            className="rounded-2xl border border-outline-variant/40 bg-surface-card p-6 shadow-sm overflow-hidden relative animate-slide-up"
            style={{ animationDelay: '0ms', animationFillMode: 'both' }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/3 rounded-full blur-3xl" />
            <div className="relative flex flex-col sm:flex-row items-center gap-6">
              <AnimatedScoreRing score={result.overallScore} size={130} />

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-headline-md font-bold text-on-surface">
                  {result.overallScore >= 80
                    ? 'Excellent — ATS Ready 🚀'
                    : result.overallScore >= 60
                      ? 'Good — Minor Tweaks Needed 👍'
                      : result.overallScore >= 40
                        ? 'Fair — Several Improvements Required ⚠️'
                        : 'Needs Significant Work 🚨'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1.5">
                  {result.overallScore >= 80
                    ? 'Your resume is well-optimized for ATS systems. You should have no trouble getting parsed.'
                    : result.overallScore >= 60
                      ? 'Solid foundation with a few areas to polish. ATS parsers will mostly read you correctly.'
                      : result.overallScore >= 40
                        ? 'Some key areas need attention. ATS systems may struggle to extract your information reliably.'
                        : 'Major changes recommended. Your resume may be getting filtered out before a human sees it.'}
                </p>

                {/* Filename badge */}
                {filename && (
                  <div className="inline-flex items-center gap-1.5 mt-2.5 text-xs text-text-muted bg-surface-container rounded-full px-3 py-1">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    {filename}
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 pt-5 border-t border-outline-variant/30 animate-slide-up"
              style={{ animationDelay: '50ms', animationFillMode: 'both' }}
            >
              <StatCard icon={<FileText className="h-4 w-4" />} label="Words" value={result.stats.wordCount.toLocaleString()} />
              <StatCard icon={<ListChecks className="h-4 w-4" />} label="Bullets" value={result.stats.bulletCount} />
              <StatCard icon={<FileCheck className="h-4 w-4" />} label="Sections" value={result.stats.sectionCount} />
              <StatCard icon={<Calendar className="h-4 w-4" />} label="Chars" value={result.stats.charCount.toLocaleString()} />
            </div>

            {/* File hints */}
            {result.fileHints && (
              <div
                className="flex flex-wrap gap-2 mt-4 animate-slide-up"
                style={{ animationDelay: '100ms', animationFillMode: 'both' }}
              >
                {result.fileHints.isPdf && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-surface-container text-text-muted border border-outline-variant/20">
                    PDF format
                  </span>
                )}
                {result.fileHints.isDocx && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/8 text-emerald-600 font-medium border border-emerald-500/15">
                    DOCX — best ATS format
                  </span>
                )}
                {result.fileHints.isTxt && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/8 text-amber-600 font-medium border border-amber-500/15">
                    TXT — limited formatting
                  </span>
                )}
                {result.fileHints.mightBeScanned && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-red-500/8 text-red-600 font-medium border border-red-500/15">
                    <AlertTriangle className="h-3 w-3" />
                    May be a scanned/image PDF
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Good practices & Top improvements row */}
          <div
            className="grid sm:grid-cols-2 gap-5 animate-slide-up"
            style={{ animationDelay: '100ms', animationFillMode: 'both' }}
          >
            {/* Good practices */}
            {result.goodPractices.length > 0 && (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm">
                <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  What you&apos;re doing well
                </h3>
                <ul className="space-y-2">
                  {result.goodPractices.map((g, i) => (
                    <li key={i} className="text-sm text-on-surface-variant flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 shrink-0 mt-0.5">
                        <Check className="h-3 w-3" />
                      </span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top improvements */}
            {result.topImprovements.length > 0 && (
              <div className="rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm">
                <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  Top improvements needed
                </h3>
                <ul className="space-y-2.5">
                  {result.topImprovements.map((imp, i) => (
                    <li key={i} className="text-sm text-on-surface-variant flex items-start gap-2">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 mt-0.5 ${
                        i === 0
                          ? 'bg-red-500/10 text-red-600'
                          : i === 1
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-amber-500/8 text-amber-600'
                      }`}>
                        {i + 1}
                      </span>
                      <span>{imp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* JD Match section */}
          {result.jdMatch && (
            <div
              className="rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm animate-slide-up"
              style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            >
              <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-4">
                <Briefcase className="h-4 w-4 text-primary" />
                Job Description Keyword Match
              </h3>

              <div className="flex items-center gap-4 mb-4">
                <AnimatedScoreRing score={result.jdMatch.matchScore} size={72} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-on-surface">
                    {result.jdMatch.matchScore >= 70
                      ? 'Strong keyword match!'
                      : result.jdMatch.matchScore >= 40
                        ? 'Moderate keyword match'
                        : 'Low keyword match'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {result.jdMatch.matched.length} keywords matched · {result.jdMatch.missing.length} missing
                    {result.jdMatch.extra.length > 0 && ` · ${result.jdMatch.extra.length} extra skills`}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {result.jdMatch.matched.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-emerald-600 mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3" />
                      Matched keywords ({result.jdMatch.matched.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.jdMatch.matched.map((kw, i) => (
                        <span key={i} className="text-[11px] bg-emerald-500/8 text-emerald-600 rounded-full px-2.5 py-0.5 border border-emerald-500/15 font-medium">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.jdMatch.missing.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1.5 flex items-center gap-1.5">
                      <XCircle className="h-3 w-3" />
                      Missing from resume ({result.jdMatch.missing.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.jdMatch.missing.map((kw, i) => (
                        <span key={i} className="text-[11px] bg-red-500/8 text-red-600 rounded-full px-2.5 py-0.5 border border-red-500/15">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.jdMatch.extra.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-600 mb-1.5 flex items-center gap-1.5">
                      <ArrowUp className="h-3 w-3" />
                      Extra skills ({result.jdMatch.extra.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.jdMatch.extra.map((kw, i) => (
                        <span key={i} className="text-[11px] bg-amber-500/8 text-amber-600 rounded-full px-2.5 py-0.5 border border-amber-500/15">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Radar + Detailed breakdown */}
          <div
            className="grid md:grid-cols-5 gap-5 animate-slide-up"
            style={{ animationDelay: '300ms', animationFillMode: 'both' }}
          >
            {/* Radar chart */}
            <div className="md:col-span-2 rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm flex flex-col items-center justify-center">
              <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-3 self-start">
                <Target className="h-4 w-4 text-primary" />
                Score overview
              </h3>
              <RadarChart breakdown={result.breakdown} />
              <p className="text-xs text-text-muted text-center mt-3 max-w-[200px]">
                Each axis represents one of the 8 ATS criteria checked
              </p>
            </div>

            {/* Breakdown accordion */}
            <div className="md:col-span-3 rounded-2xl border border-outline-variant/40 bg-surface-card p-5 shadow-sm">
              <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-4">
                <ListChecks className="h-4 w-4 text-primary" />
                Detailed breakdown
              </h3>
              <div className="space-y-0.5">
                {CRITERIA.map((c) => {
                  const criterion = result.breakdown[c.key];
                  const pct = criterion.score;
                  const isOpen = expandedCriterion === c.key;

                  return (
                    <div key={c.key} className="border-b border-outline-variant/20 last:border-0">
                      <button
                        type="button"
                        onClick={() => setExpandedCriterion(isOpen ? null : c.key)}
                        className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={scoreColor(pct)}>{c.icon}</span>
                          <span className="text-sm font-medium text-on-surface truncate">
                            {c.label}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${
                            pct >= 80
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : pct >= 40
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-red-500/10 text-red-600'
                          }`}>
                            {pct}
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-text-muted shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="pb-3 px-1 space-y-2.5 animate-fade-in">
                          {/* Score bar */}
                          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${scoreBg(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-text-muted leading-relaxed">
                            {c.description}
                          </p>
                          <div className="flex items-start gap-2 rounded-lg bg-surface-container/50 p-2.5">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              <span className="font-medium">Tip: </span>
                              {c.tip}
                            </p>
                          </div>
                          <p className="text-xs text-text-muted leading-relaxed italic">
                            &ldquo;{criterion.feedback}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div
            className="flex flex-col sm:flex-row gap-3 animate-slide-up"
            style={{ animationDelay: '400ms', animationFillMode: 'both' }}
          >
            {studioResume.trim().length >= 50 && (
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => void openFixStudioInNewTab()}
                  disabled={openingFix}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-body-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary/90 hover:shadow-primary-glow disabled:opacity-60"
                >
                  {openingFix ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {result.overallScore < 80
                    ? 'Upgrade resume with AI — new tab'
                    : 'Polish resume with AI — new tab'}
                </button>
                <p className="text-center text-[11px] text-text-muted">
                  Your report stays here. One-click AI upgrade opens in a new tab
                  (effort scales with your score). Download PDF when done.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={copyResults}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/40 bg-surface-card px-6 py-3 text-body-md font-semibold text-on-surface transition-all hover:bg-surface-container hover:shadow-sm"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy results
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/40 bg-surface-card px-6 py-3 text-body-md font-semibold text-on-surface transition-all hover:bg-surface-container hover:shadow-sm"
            >
              <RefreshCcw className="h-4 w-4" />
              Check another
              <kbd className="hidden sm:inline-flex items-center text-[10px] text-on-surface-variant/60 bg-surface-container rounded-md px-1.5 py-0.5 font-mono">
                Esc
              </kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



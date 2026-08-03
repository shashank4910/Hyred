'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  AtSign,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCcw,
  Ruler,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import { AtsScoreRing } from './AtsScoreRing';

/* ------------------------------------------------------------------ */
/*  Criteria meta (appendix)                                           */
/* ------------------------------------------------------------------ */

const CRITERIA: {
  key: keyof AtsCheckResult['breakdown'];
  label: string;
  icon: ReactNode;
  description: string;
  tip: string;
}[] = [
  {
    key: 'sectionStructure',
    label: 'Section Structure',
    icon: <ListChecks className="h-3.5 w-3.5" />,
    description: 'Standard sections (Experience, Education, Skills) that ATS parsers recognize.',
    tip: 'Include at minimum: Experience, Education, and Skills sections.',
  },
  {
    key: 'contactInfo',
    label: 'Contact Info',
    icon: <AtSign className="h-3.5 w-3.5" />,
    description: 'Name, email, phone, LinkedIn, and location clearly at the top.',
    tip: 'Put your name, email, phone, LinkedIn, and location in the top 5 lines.',
  },
  {
    key: 'bulletQuality',
    label: 'Bullet Points',
    icon: <FileText className="h-3.5 w-3.5" />,
    description: 'Consistent formatting and sufficient detail in experience bullets.',
    tip: 'Use "- " for all bullets. Aim for 10-15 total across your resume.',
  },
  {
    key: 'quantifiableAchievements',
    label: 'Quantified Impact',
    icon: <Target className="h-3.5 w-3.5" />,
    description: 'Numbers, percentages, and metrics that show measurable results.',
    tip: 'Add numbers: % improvements, $ amounts, time saved, people managed.',
  },
  {
    key: 'skillsOptimization',
    label: 'Skills Optimization',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    description: 'Concrete technical keywords, organized and contextualized in experience.',
    tip: 'List 10-15 concrete skills and mention them in experience bullets too.',
  },
  {
    key: 'lengthReadability',
    label: 'Length & Density',
    icon: <Ruler className="h-3.5 w-3.5" />,
    description: 'Appropriate length (1–2 pages) with good content density.',
    tip: 'Aim for 400-1000 words. This is roughly 1-2 pages.',
  },
  {
    key: 'formatCleanliness',
    label: 'Format Cleanliness',
    icon: <FileCheck className="h-3.5 w-3.5" />,
    description: 'Clean ASCII text — no smart quotes, unicode bullets, or special characters.',
    tip: 'Use plain ASCII: " for quotes, - for bullets, -- for dashes.',
  },
  {
    key: 'dateConsistency',
    label: 'Date Formatting',
    icon: <Calendar className="h-3.5 w-3.5" />,
    description: 'Consistent and complete date ranges with month-level granularity.',
    tip: 'Format dates as "Mon YYYY - Mon YYYY" for each role.',
  },
];

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBar(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function verdictFor(score: number): { title: string; body: string; short: string } {
  if (score >= 80) {
    return {
      title: 'ATS-ready',
      body: 'Parsers should read this cleanly. Small polish can still help.',
      short: 'ATS-ready',
    };
  }
  if (score >= 60) {
    return {
      title: 'Almost there',
      body: 'Most fields parse fine — fix the gaps below before you apply.',
      short: 'Almost there',
    };
  }
  if (score >= 40) {
    return {
      title: 'Needs work',
      body: 'Several fields may parse poorly. Fix the top issues first.',
      short: 'Needs work',
    };
  }
  return {
    title: 'High risk of ATS filter',
    body: 'Key fields look missing or hard to parse. Start with the priority findings.',
    short: 'High risk',
  };
}

function workingWellItems(result: AtsCheckResult): string[] {
  if (result.goodPractices.length > 0) return result.goodPractices;
  return [
    result.fileHints?.isDocx
      ? 'DOCX is a strong ATS-friendly format'
      : result.stats.wordCount > 0
        ? 'Text extracted from your file'
        : 'File uploaded',
    result.breakdown.formatCleanliness.score >= 70
      ? 'Formatting mostly clean'
      : result.breakdown.contactInfo.score >= 50
        ? 'Some contact details found'
        : null,
  ].filter((g): g is string => Boolean(g));
}

function formatLabel(result: AtsCheckResult): string | null {
  if (!result.fileHints) return null;
  if (result.fileHints.mightBeScanned) return 'May be scanned PDF';
  if (result.fileHints.isDocx) return 'DOCX';
  if (result.fileHints.isPdf) return 'PDF';
  if (result.fileHints.isTxt) return 'TXT';
  return null;
}

/* ------------------------------------------------------------------ */
/*  Upgrade button (shared)                                            */
/* ------------------------------------------------------------------ */

function UpgradeButton({
  score,
  opening,
  disabled,
  size = 'lg',
  onClick,
}: {
  score: number;
  opening: boolean;
  disabled: boolean;
  size?: 'lg' | 'sm';
  onClick: () => void;
}) {
  const label = score < 80 ? 'Upgrade with AI' : 'Polish with AI';
  const sizeCls =
    size === 'lg'
      ? 'h-12 px-6 text-sm rounded-xl'
      : 'h-10 px-4 text-sm rounded-lg';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={opening || disabled}
      title={disabled ? 'Need extractable resume text (scanned/image PDFs may fail)' : undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold text-on-primary bg-primary shadow-sm transition-all hover:bg-primary/90 hover:shadow-primary-glow disabled:cursor-not-allowed disabled:opacity-50 ${sizeCls}`}
    >
      {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main report                                                        */
/* ------------------------------------------------------------------ */

export function AtsScanReport({
  result,
  filename,
  studioResume,
  openingFix,
  copied,
  onUpgrade,
  onCopy,
  onReset,
}: {
  result: AtsCheckResult;
  filename: string | null;
  studioResume: string;
  openingFix: boolean;
  copied: boolean;
  onUpgrade: () => void;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSticky, setShowSticky] = useState(false);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const quietRowRef = useRef<HTMLDivElement>(null);

  const canUpgrade = studioResume.trim().length >= 50;
  const verdict = verdictFor(result.overallScore);
  const strengths = workingWellItems(result);
  const fmt = formatLabel(result);
  const upgradeLabel = result.overallScore < 80 ? 'Upgrade with AI' : 'Polish with AI';

  useEffect(() => {
    const hero = heroCtaRef.current;
    const quiet = quietRowRef.current;
    if (!hero) return;

    let heroVisible = true;
    let quietVisible = false;

    const sync = () => {
      setShowSticky(!heroVisible && !quietVisible);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) heroVisible = entry.isIntersecting;
          if (entry.target === quiet) quietVisible = entry.isIntersecting;
        }
        sync();
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    io.observe(hero);
    if (quiet) io.observe(quiet);
    return () => io.disconnect();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in pb-24 lg:pb-8">
      {/* ── 1. Single report surface ─────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-transparent to-transparent pointer-events-none" />

        <div className="relative px-5 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
          {/* Report chrome */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span className="text-primary">ATS Scan Report</span>
            <span className="text-outline-variant">·</span>
            <span className="inline-flex items-center gap-1.5 normal-case tracking-normal font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Scan complete
            </span>
            {filename && (
              <>
                <span className="text-outline-variant">·</span>
                <span className="normal-case tracking-normal font-medium text-on-surface-variant truncate max-w-[220px]">
                  {filename}
                </span>
              </>
            )}
            {fmt && (
              <>
                <span className="text-outline-variant">·</span>
                <span className="normal-case tracking-normal font-medium text-on-surface-variant">
                  {fmt}
                </span>
              </>
            )}
          </div>

          <p className="mt-2 text-xs text-text-muted">
            {result.stats.wordCount.toLocaleString()} words
            {' · '}
            {result.stats.bulletCount} bullets
            {' · '}
            {result.stats.sectionCount} sections
          </p>

          {result.fileHints?.mightBeScanned && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Little text extracted — this may be a scanned or image PDF.
            </p>
          )}

          {/* Verdict */}
          <div className="mt-7 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <AtsScoreRing score={result.overallScore} size={128} stroke={9} />
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h2 className="font-headline text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
                {verdict.title}
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto sm:mx-0">
                {verdict.body}
              </p>
            </div>
          </div>

          {/* Hero CTA */}
          <div ref={heroCtaRef} className="mt-7 flex flex-col items-stretch sm:items-start gap-1.5">
            <UpgradeButton
              score={result.overallScore}
              opening={openingFix}
              disabled={!canUpgrade}
              onClick={onUpgrade}
            />
            <p className="text-[11px] text-text-muted sm:pl-0.5">
              {canUpgrade
                ? 'Opens in a new tab'
                : 'Needs readable text — paste text or upload a text PDF / DOCX.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Priority findings ─────────────────────────────────── */}
      {result.topImprovements.length > 0 && (
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 pb-2">
            <h3 className="text-sm font-bold text-on-surface tracking-tight">
              Priority findings
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Fix these first — they hurt ATS parsing the most.
            </p>
          </div>

          <ol className="px-2 sm:px-4 pb-2">
            {result.topImprovements.map((imp, i) => {
              const accent =
                i === 0
                  ? 'border-l-red-500/70'
                  : i === 1
                    ? 'border-l-amber-500/70'
                    : 'border-l-amber-400/50';
              const numCls =
                i === 0
                  ? 'bg-red-500/10 text-red-600'
                  : 'bg-amber-500/10 text-amber-700';

              return (
                <li
                  key={i}
                  className={`border-l-[3px] ${accent} mx-3 sm:mx-4 my-1 pl-4 py-3.5 animate-slide-up`}
                  style={{ animationDelay: `${80 + i * 80}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${numCls}`}
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm text-on-surface leading-snug pt-0.5">{imp}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {strengths.length > 0 && (
            <div className="border-t border-outline-variant/25 px-5 sm:px-7 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                Working well
              </p>
              <div className="flex flex-wrap gap-2">
                {strengths.map((g, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-500/8 px-2.5 py-1 rounded-md"
                  >
                    <Check className="h-3 w-3 shrink-0" />
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 3. Quiet next-step row ───────────────────────────────── */}
      <div
        ref={quietRowRef}
        className="flex flex-wrap items-center justify-between gap-3 px-1"
      >
        <p className="text-sm text-on-surface-variant">Ready to fix these?</p>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={openingFix || !canUpgrade}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {openingFix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {upgradeLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── JD match (if present) ────────────────────────────────── */}
      {result.jdMatch && (
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-card p-5 sm:p-6 shadow-sm">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
            <Briefcase className="h-4 w-4 text-primary" />
            Job description match
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <AtsScoreRing score={result.jdMatch.matchScore} size={72} stroke={7} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {result.jdMatch.matchScore >= 70
                  ? 'Strong keyword match'
                  : result.jdMatch.matchScore >= 40
                    ? 'Moderate keyword match'
                    : 'Low keyword match'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {result.jdMatch.matched.length} matched · {result.jdMatch.missing.length} missing
                {result.jdMatch.extra.length > 0 && ` · ${result.jdMatch.extra.length} extra`}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {result.jdMatch.matched.length > 0 && (
              <div>
                <p className="text-xs font-medium text-emerald-600 mb-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Matched ({result.jdMatch.matched.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.jdMatch.matched.map((kw) => (
                    <span
                      key={kw}
                      className="text-[11px] bg-emerald-500/8 text-emerald-700 rounded-md px-2 py-0.5 font-medium"
                    >
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
                  Missing ({result.jdMatch.missing.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.jdMatch.missing.map((kw) => (
                    <span
                      key={kw}
                      className="text-[11px] bg-red-500/8 text-red-700 rounded-md px-2 py-0.5"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.jdMatch.extra.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1.5">
                  <ArrowUp className="h-3 w-3" />
                  Extra ({result.jdMatch.extra.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.jdMatch.extra.map((kw) => (
                    <span
                      key={kw}
                      className="text-[11px] bg-amber-500/8 text-amber-800 rounded-md px-2 py-0.5"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 4. Detailed findings appendix ─────────────────────────── */}
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-card/80 px-5 py-5 sm:px-6 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
          Detailed findings
        </h3>

        {/* Compact bars */}
        <div className="space-y-2 mb-5">
          {CRITERIA.map((c) => {
            const pct = result.breakdown[c.key].score;
            return (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[11px] text-on-surface-variant truncate">
                  {c.label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${scoreBar(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`w-7 text-right text-[11px] font-bold tabular-nums ${scoreColor(pct)}`}>
                  {pct}
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t border-outline-variant/25 pt-1 space-y-0.5">
          {CRITERIA.map((c) => {
            const criterion = result.breakdown[c.key];
            const pct = criterion.score;
            const isOpen = expanded === c.key;
            return (
              <div key={c.key} className="border-b border-outline-variant/15 last:border-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.key)}
                  className="w-full flex items-center justify-between py-2 px-0.5 rounded-lg hover:bg-surface-container/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={scoreColor(pct)}>{c.icon}</span>
                    <span className="text-xs font-medium text-on-surface truncate">{c.label}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                        pct >= 80
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : pct >= 40
                            ? 'bg-amber-500/10 text-amber-700'
                            : 'bg-red-500/10 text-red-600'
                      }`}
                    >
                      {pct}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="pb-2.5 px-0.5 space-y-2 animate-fade-in">
                    <p className="text-[11px] text-text-muted leading-relaxed">{c.description}</p>
                    <div className="flex items-start gap-2 rounded-lg bg-surface-container/50 p-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        <span className="font-medium">Tip: </span>
                        {criterion.feedback || c.tip}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5. Footer secondary ──────────────────────────────────── */}
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-2">
        <button
          type="button"
          onClick={onCopy}
          className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {copied ? 'Copied' : 'Copy results'}
        </button>
        <span className="text-outline-variant">·</span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Check another
          <kbd className="hidden sm:inline-flex text-[10px] text-text-muted bg-surface-container rounded px-1.5 py-0.5 font-mono ml-0.5">
            Esc
          </kbd>
        </button>
      </footer>

      {/* ── 6. Sticky Upgrade ─────────────────────────────────────── */}
      {showSticky && (
        <div className="fixed inset-x-0 bottom-16 lg:bottom-4 z-40 px-3 sm:px-4 pointer-events-none animate-slide-up">
          <div className="mx-auto max-w-3xl pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/40 bg-surface-card/90 backdrop-blur-md px-4 py-3 shadow-lg">
            <div className="min-w-0 flex items-center gap-3">
              <span className={`text-lg font-extrabold tabular-nums ${scoreColor(result.overallScore)}`}>
                {result.overallScore}
              </span>
              <span className="text-xs text-text-muted truncate hidden sm:inline">
                {verdict.short}
              </span>
            </div>
            <UpgradeButton
              score={result.overallScore}
              opening={openingFix}
              disabled={!canUpgrade}
              size="sm"
              onClick={onUpgrade}
            />
          </div>
        </div>
      )}
    </div>
  );
}

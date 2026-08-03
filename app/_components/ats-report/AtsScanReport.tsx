'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import {
  buildAtsReport,
  type AtsReport,
  type AtsReportCategory,
  type AtsReportCheck,
} from '@/lib/ats-report';
import { AtsScoreRing } from './AtsScoreRing';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
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

function priorityChecks(reportChecks: AtsReportCheck[]): AtsReportCheck[] {
  return [...reportChecks]
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .filter((c) => c.criterionKey !== 'parse' && c.criterionKey !== 'premium')
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 3);
}

function lineMatchesQuote(line: string, quote: string): boolean {
  const l = line.trim().toLowerCase();
  const q = quote.trim().toLowerCase().replace(/^…+|…+$/g, '').trim();
  if (!l || !q) return false;
  const needle = q.slice(0, Math.min(48, q.length));
  return l.includes(needle) || needle.includes(l.slice(0, 32));
}

function StatusIcon({ status, className = 'h-4 w-4' }: { status: AtsReportCheck['status']; className?: string }) {
  if (status === 'pass') return <CheckCircle2 className={`${className} text-emerald-600`} />;
  if (status === 'warn') return <AlertTriangle className={`${className} text-amber-600`} />;
  return <XCircle className={`${className} text-red-600`} />;
}

function statusPill(status: AtsReportCheck['status'], summary: string) {
  const cls =
    status === 'pass'
      ? 'bg-emerald-500/10 text-emerald-700'
      : status === 'warn'
        ? 'bg-amber-500/10 text-amber-700'
        : 'bg-red-500/10 text-red-700';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {summary}
    </span>
  );
}

/** One check as an Enhancv-style expandable card with per-user evidence. */
function CheckCard({
  check,
  onQuoteClick,
}: {
  check: AtsReportCheck;
  onQuoteClick?: (quote: string) => void;
}) {
  const hasIssue = check.status === 'fail' || check.status === 'warn';
  const [open, setOpen] = useState(hasIssue);
  const quotes = check.quotes ?? [];
  const failedItems = (check.foundItems ?? []).filter((f) => !f.ok);

  return (
    <div
      id={`check-${check.id}`}
      className="border-b border-outline-variant/20 last:border-b-0 scroll-mt-24"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 sm:px-5 py-3.5 text-left transition-colors hover:bg-surface-container/40"
        aria-expanded={open}
      >
        <StatusIcon status={check.status} />
        <span className="flex-1 text-sm font-semibold text-on-surface">{check.label}</span>
        {statusPill(check.status, check.summary)}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 pl-11 sm:pl-12 space-y-3">
          {check.education && (
            <p className="text-xs text-text-muted leading-relaxed">{check.education}</p>
          )}

          {hasIssue ? (
            <>
              <p className="text-sm text-on-surface-variant leading-relaxed">{check.detail}</p>

              {/* Extracted items with pass/fail marks (contact, sections) */}
              {check.foundItems && check.foundItems.length > 0 && (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {check.foundItems.map((item) => (
                    <li
                      key={item.label}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        item.ok
                          ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-800'
                          : 'border-red-500/25 bg-red-500/[0.06] text-red-800'
                      }`}
                    >
                      {item.ok ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                      )}
                      <span className="font-medium">{item.label}</span>
                      {item.ok && item.value && (
                        <span className="truncate text-emerald-700/80">{item.value}</span>
                      )}
                      {!item.ok && <span className="text-red-600/80">not found</span>}
                    </li>
                  ))}
                </ul>
              )}

              {/* Repeated words with replacement pills */}
              {check.repetitions && check.repetitions.length > 0 && (
                <ul className="space-y-2">
                  {check.repetitions.map((rep) => (
                    <li
                      key={rep.word}
                      className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2"
                    >
                      <p className="text-xs text-red-800">
                        <span className="font-bold">“{rep.word}”</span> appears{' '}
                        <span className="font-bold">{rep.count} times</span>
                      </p>
                      {rep.suggestions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-text-muted">Try instead:</span>
                          {rep.suggestions.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Spelling-style corrections */}
              {check.suggestions && check.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {check.suggestions.map((s) => (
                    <span
                      key={s.found}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-2.5 py-1 text-xs"
                    >
                      <span className="font-semibold text-red-700 line-through decoration-red-400">
                        {s.found}
                      </span>
                      <ArrowRight className="h-3 w-3 text-text-muted" />
                      <span className="font-semibold text-emerald-700">{s.suggestion}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Red evidence quotes from the user's resume */}
              {quotes.length > 0 && (
                <ul className="space-y-1.5">
                  {quotes.slice(0, 3).map((q) => (
                    <li key={q.text}>
                      <button
                        type="button"
                        onClick={() => onQuoteClick?.(q.text)}
                        className="w-full rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-2 text-left text-[12px] leading-snug text-red-900 transition-colors hover:bg-red-500/[0.12]"
                      >
                        <span className="font-medium text-red-700">From your resume: </span>
                        <span className="italic">“{q.text}”</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {quotes.length === 0 &&
                failedItems.length === 0 &&
                (!check.repetitions || check.repetitions.length === 0) &&
                (!check.suggestions || check.suggestions.length === 0) && (
                  <p className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-2 text-[12px] font-medium text-red-800">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Not found in your resume
                  </p>
                )}
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-800">Good job!</p>
                <p className="mt-0.5 text-xs text-emerald-800/90 leading-relaxed">
                  {check.passText ?? check.detail}
                </p>
                {check.foundItems && check.foundItems.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {check.foundItems.map((item) => (
                      <span
                        key={item.label}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          item.ok
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-amber-500/10 text-amber-700'
                        }`}
                      >
                        {item.ok ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {item.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Sticky left rail — score + per-check status, click to jump. */
function ReportRail({ report }: { report: AtsReport }) {
  const scrollTo = (id: string) => {
    document.getElementById(`check-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <nav className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm p-4">
      <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/25">
        <span className={`text-2xl font-extrabold tabular-nums ${scoreColor(report.overallScore)}`}>
          {report.overallScore}
        </span>
        <div className="text-[11px] leading-tight text-text-muted">
          <p className="font-semibold text-on-surface-variant">Your score</p>
          <p>
            {report.issueCount} issue{report.issueCount === 1 ? '' : 's'} found
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {report.categories
          .filter((c) => !c.locked)
          .map((cat) => (
            <div key={cat.id}>
              <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {cat.label}
                {cat.score != null && (
                  <span className={`tabular-nums normal-case ${scoreColor(cat.score)}`}>
                    {cat.score}%
                  </span>
                )}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {cat.checks.map((check) => (
                  <li key={check.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(check.id)}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-on-surface-variant transition-colors hover:bg-surface-container/50"
                    >
                      <StatusIcon status={check.status} className="h-3.5 w-3.5" />
                      <span className="truncate">{check.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </nav>
  );
}

/** One category container with its checks. */
function CategoryBlock({
  category,
  onQuoteClick,
}: {
  category: AtsReportCategory;
  onQuoteClick?: (quote: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-surface-container/30 border-b border-outline-variant/25">
        <div className="flex items-center gap-2.5">
          <h4 className="text-sm font-bold text-on-surface tracking-tight">{category.label}</h4>
          {category.score != null && (
            <span className={`text-xs font-bold tabular-nums ${scoreColor(category.score)}`}>
              {category.score}%
            </span>
          )}
        </div>
        {category.issueCount > 0 ? (
          <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
            {category.issueCount} issue{category.issueCount === 1 ? '' : 's'} found
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            All good
          </span>
        )}
      </div>
      {category.checks.map((check) => (
        <CheckCard key={check.id} check={check} onQuoteClick={onQuoteClick} />
      ))}
    </section>
  );
}

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
    size === 'lg' ? 'h-12 px-6 text-sm rounded-xl' : 'h-10 px-4 text-sm rounded-lg';

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

/** Scrollable resume with red-highlighted issue lines. */
function ResumeEvidencePreview({
  resumeText,
  highlightQuotes,
  activeQuote,
}: {
  resumeText: string;
  highlightQuotes: string[];
  activeQuote: string | null;
}) {
  const activeRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => resumeText.split('\n'), [resumeText]);

  useEffect(() => {
    if (!activeQuote || !activeRef.current) return;
    activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeQuote]);

  if (!resumeText.trim()) {
    return (
      <p className="text-sm text-text-muted px-4 py-8 text-center">
        No readable resume text to preview.
      </p>
    );
  }

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-xl border border-outline-variant/40 bg-white">
      <div className="px-3 py-3 font-mono text-[11px] sm:text-xs leading-relaxed text-slate-800">
        {lines.map((line, i) => {
          const isHit = highlightQuotes.some((q) => lineMatchesQuote(line, q));
          const isActive = activeQuote ? lineMatchesQuote(line, activeQuote) : false;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              className={`px-2 py-0.5 whitespace-pre-wrap break-words rounded-sm transition-colors ${
                isActive
                  ? 'bg-red-500/20 text-red-900 ring-1 ring-red-500/40'
                  : isHit
                    ? 'bg-red-500/10 text-red-800 border-l-2 border-red-500 pl-1.5'
                    : 'text-slate-700'
              }`}
            >
              {line.length === 0 ? ' ' : line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  const [showSticky, setShowSticky] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const quietRowRef = useRef<HTMLDivElement>(null);

  const resumeText = studioResume;
  const report = useMemo(
    () => buildAtsReport(result, resumeText, { isPremium: true }),
    [result, resumeText],
  );

  const allChecks = useMemo(
    () => report.categories.flatMap((c) => c.checks),
    [report],
  );

  const findings = useMemo(() => priorityChecks(allChecks), [allChecks]);

  useEffect(() => {
    if (findings.length === 0) return;
    setActiveCheckId((prev) => prev ?? findings[0].id);
  }, [findings]);

  const activeCheck = findings.find((c) => c.id === activeCheckId) ?? findings[0] ?? null;

  const allEvidenceQuotes = useMemo(() => {
    const qs = allChecks
      .filter((c) => c.status === 'fail' || c.status === 'warn')
      .flatMap((c) => (c.quotes ?? []).map((q) => q.text));
    return [...new Set(qs)];
  }, [allChecks]);

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

    const sync = () => setShowSticky(!heroVisible && !quietVisible);

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
      {/* ── 1. Report surface ────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-transparent to-transparent pointer-events-none" />

        <div className="relative px-5 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
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
            {findings.length > 0 && (
              <>
                {' · '}
                <span className="text-red-600 font-medium">
                  {findings.length} priority issue{findings.length === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>

          {result.fileHints?.mightBeScanned && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Little text extracted — this may be a scanned or image PDF.
            </p>
          )}

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

      {/* ── 2. Findings + resume evidence ─────────────────────────── */}
      {findings.length > 0 && (
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 pb-3">
            <h3 className="text-sm font-bold text-on-surface tracking-tight">
              Priority findings
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Red lines are taken from your resume — tap a finding to jump to the evidence.
            </p>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-0 lg:gap-0 border-t border-outline-variant/25">
            {/* Findings list */}
            <ol className="lg:border-r border-outline-variant/25">
              {findings.map((check, i) => {
                const selected = activeCheck?.id === check.id;
                const quotes = check.quotes ?? [];
                const accent =
                  i === 0
                    ? 'border-l-red-500'
                    : i === 1
                      ? 'border-l-amber-500'
                      : 'border-l-amber-400/70';

                return (
                  <li key={check.id} className="border-b border-outline-variant/20 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCheckId(check.id);
                        setActiveQuote(quotes[0]?.text ?? null);
                      }}
                      className={`w-full text-left border-l-[3px] ${accent} px-4 sm:px-5 py-4 transition-colors ${
                        selected ? 'bg-red-500/[0.04]' : 'hover:bg-surface-container/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            i === 0
                              ? 'bg-red-500/10 text-red-600'
                              : 'bg-amber-500/10 text-amber-700'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface">{check.label}</p>
                          <p className="mt-1 text-xs text-on-surface-variant leading-snug">
                            {check.detail}
                          </p>

                          {quotes.length > 0 ? (
                            <ul className="mt-2.5 space-y-1.5">
                              {quotes.slice(0, 2).map((q) => (
                                <li
                                  key={q.text}
                                  className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-2 text-[12px] leading-snug text-red-900"
                                >
                                  <span className="font-medium text-red-700 not-italic">From your resume: </span>
                                  <span className="italic">“{q.text}”</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-2.5 py-2 text-[12px] font-medium text-red-800">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              Not found in your resume
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* Resume preview */}
            <div id="resume-evidence-panel" className="px-4 sm:px-5 py-4 bg-surface-container/20 scroll-mt-24">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Your resume
                </p>
                <p className="text-[10px] text-red-600 font-medium">
                  Red = issue evidence
                </p>
              </div>
              <ResumeEvidencePreview
                resumeText={resumeText}
                highlightQuotes={allEvidenceQuotes}
                activeQuote={activeQuote}
              />
              {activeCheck && (
                <p className="mt-2.5 text-[11px] text-on-surface-variant">
                  Showing evidence for{' '}
                  <span className="font-semibold text-on-surface">{activeCheck.label}</span>
                </p>
              )}
            </div>
          </div>

          {strengths.length > 0 && (
            <div className="border-t border-outline-variant/25 px-5 sm:px-7 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                Working well
              </p>
              <div className="flex flex-wrap gap-2">
                {strengths.map((g) => (
                  <span
                    key={g}
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

      {/* ── 3. Full report — every check, per-user evidence ──────── */}
      <section>
        <div className="px-1 pb-3">
          <h3 className="text-sm font-bold text-on-surface tracking-tight">Full report</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Every check we ran on your resume — open any row to see the exact evidence.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
          <div className="hidden lg:block lg:sticky lg:top-20">
            <ReportRail report={report} />
          </div>
          <div className="space-y-4 min-w-0">
            {report.categories
              .filter((c) => !c.locked)
              .map((cat) => (
                <CategoryBlock
                  key={cat.id}
                  category={cat}
                  onQuoteClick={(quote) => {
                    setActiveQuote(quote);
                    document
                      .getElementById('resume-evidence-panel')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                />
              ))}
          </div>
        </div>
      </section>

      {/* ── 4. Quiet next-step ───────────────────────────────────── */}
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

      {/* ── JD match ─────────────────────────────────────────────── */}
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

      {/* ── Footer ───────────────────────────────────────────────── */}
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

      {/* ── Sticky Upgrade ────────────────────────────────────────── */}
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

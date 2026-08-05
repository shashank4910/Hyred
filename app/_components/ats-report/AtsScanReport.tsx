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
  FileText,
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

function statusAccent(status: AtsReportCheck['status']): string {
  if (status === 'pass') return 'border-l-emerald-500';
  if (status === 'warn') return 'border-l-amber-500';
  return 'border-l-red-500';
}

function StatusIcon({
  status,
  className = 'h-4 w-4',
}: {
  status: AtsReportCheck['status'];
  className?: string;
}) {
  if (status === 'pass') return <CheckCircle2 className={`${className} text-emerald-600`} />;
  if (status === 'warn') return <AlertTriangle className={`${className} text-amber-600`} />;
  return <XCircle className={`${className} text-red-600`} />;
}

function statusPill(status: AtsReportCheck['status'], summary: string) {
  const cls =
    status === 'pass'
      ? 'bg-emerald-500/12 text-emerald-800 ring-1 ring-inset ring-emerald-500/20'
      : status === 'warn'
        ? 'bg-amber-500/12 text-amber-900 ring-1 ring-inset ring-amber-500/25'
        : 'bg-red-500/12 text-red-800 ring-1 ring-inset ring-red-500/25';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${cls}`}>
      {summary}
    </span>
  );
}

function KpiCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const valueCls =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-red-700'
          : 'text-on-surface';
  return (
    <div className="rounded-2xl bg-surface-container-lowest px-4 py-3.5 shadow-card ring-1 ring-outline-variant/30">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className={`mt-1.5 font-headline text-xl font-bold tabular-nums tracking-tight ${valueCls}`}>
        {value}
      </p>
    </div>
  );
}

function CheckEvidenceBody({
  check,
  onQuoteClick,
}: {
  check: AtsReportCheck;
  onQuoteClick?: (quote: string) => void;
}) {
  const hasIssue = check.status === 'fail' || check.status === 'warn';
  const quotes = check.quotes ?? [];
  const failedItems = (check.foundItems ?? []).filter((f) => !f.ok);

  if (!hasIssue) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-500/[0.07] px-4 py-3.5 ring-1 ring-inset ring-emerald-500/15">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Looking good</p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900/85">
            {check.passText ?? check.detail}
          </p>
          {check.foundItems && check.foundItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {check.foundItems.map((item) => (
                <span
                  key={item.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                    item.ok
                      ? 'bg-emerald-500/12 text-emerald-800'
                      : 'bg-amber-500/12 text-amber-800'
                  }`}
                >
                  {item.ok ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {item.label}
                  {item.ok && item.value ? (
                    <span className="font-medium text-emerald-700/80 truncate max-w-[140px]">
                      {item.value}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {check.education && (
        <p className="text-sm leading-relaxed text-on-surface-variant">{check.education}</p>
      )}
      <p className="text-sm leading-relaxed text-on-surface">{check.detail}</p>

      {check.foundItems && check.foundItems.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {check.foundItems.map((item) => (
            <li
              key={item.label}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs shadow-glass ring-1 ${
                item.ok
                  ? 'bg-emerald-500/[0.06] text-emerald-900 ring-emerald-500/20'
                  : 'bg-red-500/[0.06] text-red-900 ring-red-500/20'
              }`}
            >
              {item.ok ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <span className="font-semibold">{item.label}</span>
              {item.ok && item.value && (
                <span className="truncate text-emerald-800/80">{item.value}</span>
              )}
              {!item.ok && <span className="text-red-700/80">not found</span>}
            </li>
          ))}
        </ul>
      )}

      {check.repetitions && check.repetitions.length > 0 && (
        <ul className="space-y-2.5">
          {check.repetitions.map((rep) => (
            <li
              key={rep.word}
              className="rounded-xl bg-surface-container-lowest px-4 py-3 shadow-glass ring-1 ring-red-500/15"
            >
              <p className="text-sm text-on-surface">
                <span className="font-bold text-red-700">“{rep.word}”</span> appears{' '}
                <span className="font-bold tabular-nums">{rep.count}</span> times
              </p>
              {rep.suggestions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-text-muted">Try instead</span>
                  {rep.suggestions.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/15"
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

      {check.suggestions && check.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {check.suggestions.map((s) => (
            <span
              key={s.found}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-2 text-xs shadow-glass ring-1 ring-red-500/15"
            >
              <span className="font-semibold text-red-700 line-through decoration-red-400/80">
                {s.found}
              </span>
              <ArrowRight className="h-3 w-3 text-text-muted" />
              <span className="font-semibold text-emerald-700">{s.suggestion}</span>
            </span>
          ))}
        </div>
      )}

      {quotes.length > 0 && (
        <ul className="space-y-2">
          {quotes.slice(0, 3).map((q) => (
            <li key={q.text}>
              <button
                type="button"
                onClick={() => onQuoteClick?.(q.text)}
                className="group w-full cursor-pointer rounded-xl border-l-[3px] border-l-red-500 bg-red-500/[0.06] px-3.5 py-3 text-left transition-colors duration-200 hover:bg-red-500/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
                  From your resume
                </span>
                <p className="mt-1 text-[13px] leading-snug text-red-950 italic">“{q.text}”</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {quotes.length === 0 &&
        failedItems.length === 0 &&
        (!check.repetitions || check.repetitions.length === 0) &&
        (!check.suggestions || check.suggestions.length === 0) && (
          <p className="inline-flex items-center gap-2 rounded-xl bg-red-500/[0.06] px-3.5 py-2.5 text-[13px] font-semibold text-red-800 ring-1 ring-red-500/15">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Not found in your resume
          </p>
        )}
    </div>
  );
}

/** Standalone premium check card — Enhancv-style issue/success tile. */
function CheckCard({
  check,
  onQuoteClick,
}: {
  check: AtsReportCheck;
  onQuoteClick?: (quote: string) => void;
}) {
  const hasIssue = check.status === 'fail' || check.status === 'warn';
  const [open, setOpen] = useState(hasIssue);

  return (
    <article
      id={`check-${check.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card ring-1 ring-outline-variant/35 transition-shadow duration-200 hover:shadow-elevated border-l-[3px] ${statusAccent(check.status)}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors duration-200 hover:bg-surface-container/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25 sm:px-5"
        aria-expanded={open}
      >
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            check.status === 'pass'
              ? 'bg-emerald-500/12'
              : check.status === 'warn'
                ? 'bg-amber-500/12'
                : 'bg-red-500/12'
          }`}
        >
          <StatusIcon status={check.status} className="h-4.5 w-4.5 h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-[15px] font-bold tracking-tight text-on-surface">{check.label}</h5>
            {statusPill(check.status, check.summary)}
          </div>
          {typeof check.score === 'number' && (
            <div className="mt-2 flex items-center gap-2.5 max-w-[200px]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${scoreBar(check.score)}`}
                  style={{ width: `${Math.max(4, Math.min(100, check.score))}%` }}
                />
              </div>
              <span className={`text-[11px] font-bold tabular-nums ${scoreColor(check.score)}`}>
                {check.score}
              </span>
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-outline-variant/25 px-4 py-4 sm:px-5 sm:pl-[4.25rem]">
          <CheckEvidenceBody check={check} onQuoteClick={onQuoteClick} />
        </div>
      )}
    </article>
  );
}

function ReportRail({ report }: { report: AtsReport }) {
  const scrollTo = (id: string) => {
    document.getElementById(`check-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <nav className="rounded-2xl bg-surface-container-lowest p-5 shadow-card ring-1 ring-outline-variant/35">
      <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/30">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 ring-1 ring-primary/15">
          <span className={`text-xl font-extrabold tabular-nums ${scoreColor(report.overallScore)}`}>
            {report.overallScore}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface">Your score</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {report.issueCount} issue{report.issueCount === 1 ? '' : 's'} found
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {report.categories
          .filter((c) => !c.locked)
          .map((cat) => (
            <div key={cat.id}>
              <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {cat.label}
                {cat.score != null && (
                  <span className={`tabular-nums normal-case tracking-normal ${scoreColor(cat.score)}`}>
                    {cat.score}%
                  </span>
                )}
              </p>
              <ul className="mt-2 space-y-1">
                {cat.checks.map((check) => (
                  <li key={check.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(check.id)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-on-surface-variant transition-colors duration-200 hover:bg-surface-container/70 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                    >
                      <StatusIcon status={check.status} className="h-3.5 w-3.5" />
                      <span className="truncate font-medium">{check.label}</span>
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

function CategoryBlock({
  category,
  onQuoteClick,
}: {
  category: AtsReportCategory;
  onQuoteClick?: (quote: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-3">
          <h4 className="font-headline text-base font-bold tracking-tight text-on-surface">
            {category.label}
          </h4>
          {category.score != null && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ring-inset ${
                category.score >= 80
                  ? 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/20'
                  : category.score >= 50
                    ? 'bg-amber-500/10 text-amber-900 ring-amber-500/20'
                    : 'bg-red-500/10 text-red-800 ring-red-500/20'
              }`}
            >
              {category.score}%
            </span>
          )}
        </div>
        {category.issueCount > 0 ? (
          <span className="rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-bold text-red-800 ring-1 ring-inset ring-red-500/20">
            {category.issueCount} issue{category.issueCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
            All clear
          </span>
        )}
      </div>
      <div className="space-y-3">
        {category.checks.map((check) => (
          <CheckCard key={check.id} check={check} onQuoteClick={onQuoteClick} />
        ))}
      </div>
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
    size === 'lg' ? 'h-12 px-7 text-sm rounded-xl' : 'h-10 px-4 text-sm rounded-xl';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={opening || disabled}
      title={disabled ? 'Need extractable resume text (scanned/image PDFs may fail)' : undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-semibold text-on-primary teal-gradient shadow-primary-glow transition-all duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${sizeCls}`}
    >
      {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {label}
    </button>
  );
}

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
      <p className="px-4 py-10 text-center text-sm text-text-muted">
        No readable resume text to preview.
      </p>
    );
  }

  return (
    <div className="max-h-[440px] overflow-y-auto rounded-xl bg-[#fcfcfd] shadow-inner ring-1 ring-outline-variant/40">
      <div className="px-4 py-4 font-mono text-[11px] sm:text-xs leading-[1.7] text-slate-800">
        {lines.map((line, i) => {
          const isHit = highlightQuotes.some((q) => lineMatchesQuote(line, q));
          const isActive = activeQuote ? lineMatchesQuote(line, activeQuote) : false;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              className={`px-2.5 py-0.5 whitespace-pre-wrap break-words rounded-md transition-colors duration-200 ${
                isActive
                  ? 'bg-red-500/18 text-red-950 ring-1 ring-red-500/35'
                  : isHit
                    ? 'bg-red-500/10 text-red-900 border-l-2 border-red-500 pl-2'
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
  /** Server-built evidence-grounded report (hybrid). Falls back to client buildAtsReport. */
  report: reportProp,
}: {
  result: AtsCheckResult;
  filename: string | null;
  studioResume: string;
  openingFix: boolean;
  copied: boolean;
  onUpgrade: () => void;
  onCopy: () => void;
  onReset: () => void;
  report?: AtsReport | null;
}) {
  const [showSticky, setShowSticky] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const quietRowRef = useRef<HTMLDivElement>(null);

  const resumeText = studioResume;
  const report = useMemo(() => {
    if (reportProp) return reportProp;
    return buildAtsReport(result, resumeText, { isPremium: true });
  }, [reportProp, result, resumeText]);

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
  const issueTone =
    report.issueCount === 0 ? 'good' : report.issueCount <= 3 ? 'warn' : 'bad';

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

  const scrollToEvidence = (quote: string) => {
    setActiveQuote(quote);
    document
      .getElementById('resume-evidence-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-24 lg:pb-10">
      {/* ── Hero report card ─────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[1.35rem] bg-surface-container-lowest shadow-elevated ring-1 ring-outline-variant/40">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,106,101,0.08),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="relative px-5 pt-6 pb-6 sm:px-8 sm:pt-8 sm:pb-8">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary ring-1 ring-inset ring-primary/20">
              ATS Scan Report
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Scan complete
            </span>
            {fmt && (
              <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant ring-1 ring-inset ring-outline-variant/40">
                {fmt}
              </span>
            )}
            {filename && (
              <span className="truncate max-w-[220px] text-xs font-medium text-text-muted">
                {filename}
              </span>
            )}
          </div>

          {result.fileHints?.mightBeScanned && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-500/8 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-500/15">
              <AlertTriangle className="h-3.5 w-3.5" />
              Little text extracted — this may be a scanned or image PDF.
            </p>
          )}

          <div className="mt-8 flex flex-col items-center gap-7 sm:flex-row sm:items-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
              <AtsScoreRing score={result.overallScore} size={140} stroke={10} />
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h2 className="font-headline text-3xl sm:text-[2.1rem] font-extrabold tracking-tight text-on-surface">
                {verdict.title}
              </h2>
              <p className="mt-2.5 text-[15px] text-on-surface-variant leading-relaxed max-w-md mx-auto sm:mx-0">
                {verdict.body}
              </p>
              <div ref={heroCtaRef} className="mt-6 flex flex-col items-stretch sm:items-start gap-1.5">
                <UpgradeButton
                  score={result.overallScore}
                  opening={openingFix}
                  disabled={!canUpgrade}
                  onClick={onUpgrade}
                />
                <p className="text-[11px] text-text-muted sm:pl-0.5">
                  {canUpgrade
                    ? 'Opens Fix Studio in a new tab'
                    : 'Needs readable text — paste text or upload a text PDF / DOCX.'}
                </p>
              </div>
            </div>
          </div>

          {/* KPI bento */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Score"
              value={String(result.overallScore)}
              tone={
                result.overallScore >= 80 ? 'good' : result.overallScore >= 50 ? 'warn' : 'bad'
              }
            />
            <KpiCard
              label="Issues"
              value={String(report.issueCount)}
              tone={issueTone}
            />
            <KpiCard label="Parse rate" value={`${report.parseRatePercent}%`} tone="neutral" />
            <KpiCard
              label="Words"
              value={result.stats.wordCount.toLocaleString()}
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* ── Priority findings — paired cards ─────────────────────── */}
      {findings.length > 0 && (
        <section className="space-y-4">
          <div className="px-0.5">
            <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">
              Priority findings
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              The top issues holding your score down — tap a card to highlight evidence on the resume.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
            <ol className="space-y-3">
              {findings.map((check, i) => {
                const selected = activeCheck?.id === check.id;
                const quotes = check.quotes ?? [];
                const accent =
                  i === 0
                    ? 'border-l-red-500'
                    : i === 1
                      ? 'border-l-amber-500'
                      : 'border-l-amber-400';

                return (
                  <li key={check.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCheckId(check.id);
                        setActiveQuote(quotes[0]?.text ?? null);
                      }}
                      className={`w-full cursor-pointer rounded-2xl border-l-[3px] ${accent} bg-surface-container-lowest px-4 py-4 text-left shadow-card ring-1 transition-all duration-200 sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                        selected
                          ? 'ring-primary/25 shadow-elevated'
                          : 'ring-outline-variant/35 hover:shadow-elevated hover:ring-outline-variant/50'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold ${
                            i === 0
                              ? 'bg-red-500/12 text-red-700'
                              : 'bg-amber-500/12 text-amber-800'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold tracking-tight text-on-surface">
                            {check.label}
                          </p>
                          <p className="mt-1.5 text-sm leading-snug text-on-surface-variant">
                            {check.detail}
                          </p>

                          {quotes.length > 0 ? (
                            <ul className="mt-3 space-y-2">
                              {quotes.slice(0, 2).map((q) => (
                                <li
                                  key={q.text}
                                  className="rounded-xl border-l-[3px] border-l-red-500 bg-red-500/[0.06] px-3 py-2.5 text-[12px] leading-snug text-red-950"
                                >
                                  <span className="font-semibold text-red-700 not-italic">
                                    From your resume:{' '}
                                  </span>
                                  <span className="italic">“{q.text}”</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-500/[0.06] px-3 py-2 text-[12px] font-semibold text-red-800 ring-1 ring-red-500/15">
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

            <div
              id="resume-evidence-panel"
              className="scroll-mt-24 rounded-2xl bg-surface-container-lowest p-4 shadow-card ring-1 ring-outline-variant/35 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Your resume
                </p>
                <p className="text-[10px] font-semibold text-red-700">Red = issue evidence</p>
              </div>
              <ResumeEvidencePreview
                resumeText={resumeText}
                highlightQuotes={allEvidenceQuotes}
                activeQuote={activeQuote}
              />
              {activeCheck && (
                <p className="mt-3 text-xs text-on-surface-variant">
                  Showing evidence for{' '}
                  <span className="font-semibold text-on-surface">{activeCheck.label}</span>
                </p>
              )}
            </div>
          </div>

          {strengths.length > 0 && (
            <div className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-card ring-1 ring-outline-variant/35">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted mb-3">
                Working well
              </p>
              <div className="flex flex-wrap gap-2">
                {strengths.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/15"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Full report — card stack + rail ──────────────────────── */}
      <section className="space-y-5">
        <div className="px-0.5">
          <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">
            Full report
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Every check on your resume — open a card for the exact evidence.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
          <div className="hidden lg:block lg:sticky lg:top-20">
            <ReportRail report={report} />
          </div>
          <div className="space-y-8 min-w-0">
            {report.categories
              .filter((c) => !c.locked)
              .map((cat) => (
                <CategoryBlock
                  key={cat.id}
                  category={cat}
                  onQuoteClick={scrollToEvidence}
                />
              ))}
          </div>
        </div>
      </section>

      {/* ── Quiet next-step ──────────────────────────────────────── */}
      <div
        ref={quietRowRef}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/[0.04] px-5 py-4 ring-1 ring-primary/10"
      >
        <p className="text-sm font-medium text-on-surface-variant">Ready to fix these?</p>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={openingFix || !canUpgrade}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-primary transition-colors duration-200 hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {openingFix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {upgradeLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── JD match ─────────────────────────────────────────────── */}
      {result.jdMatch && (
        <section className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-card ring-1 ring-outline-variant/35">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2 mb-5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Briefcase className="h-4 w-4 text-primary" />
            </span>
            Job description match
          </h3>
          <div className="flex items-center gap-4 mb-5">
            <AtsScoreRing score={result.jdMatch.matchScore} size={72} stroke={7} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-on-surface">
                {result.jdMatch.matchScore >= 70
                  ? 'Strong keyword match'
                  : result.jdMatch.matchScore >= 40
                    ? 'Moderate keyword match'
                    : 'Low keyword match'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {result.jdMatch.matched.length} matched · {result.jdMatch.missing.length} missing
                {result.jdMatch.extra.length > 0 && ` · ${result.jdMatch.extra.length} extra`}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {result.jdMatch.matched.length > 0 && (
              <div>
                <p className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Matched ({result.jdMatch.matched.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.jdMatch.matched.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/15"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.jdMatch.missing.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" />
                  Missing ({result.jdMatch.missing.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.jdMatch.missing.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-800 ring-1 ring-inset ring-red-500/15"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.jdMatch.extra.length > 0 && (
              <div>
                <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                  <ArrowUp className="h-3.5 w-3.5" />
                  Extra ({result.jdMatch.extra.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.jdMatch.extra.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-500/15"
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
          className="cursor-pointer text-sm font-semibold text-on-surface-variant transition-colors duration-200 hover:text-on-surface"
        >
          {copied ? 'Copied' : 'Copy results'}
        </button>
        <span className="text-outline-variant">·</span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors duration-200 hover:text-on-surface"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Check another
          <kbd className="hidden sm:inline-flex text-[10px] text-text-muted bg-surface-container rounded-md px-1.5 py-0.5 font-mono ml-0.5 ring-1 ring-outline-variant/40">
            Esc
          </kbd>
        </button>
      </footer>

      {/* ── Sticky Upgrade ────────────────────────────────────────── */}
      {showSticky && (
        <div className="fixed inset-x-0 bottom-16 lg:bottom-4 z-40 px-3 sm:px-4 pointer-events-none animate-slide-up">
          <div className="mx-auto max-w-3xl pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/95 backdrop-blur-md px-4 py-3 shadow-elevated">
            <div className="min-w-0 flex items-center gap-3">
              <span
                className={`text-lg font-extrabold tabular-nums ${scoreColor(result.overallScore)}`}
              >
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

'use client';

import { CheckCircle2, Lock, AlertTriangle } from 'lucide-react';
import type { AtsReport, AtsReportCategory, AtsReportCheck } from '@/lib/ats-report';
import Link from 'next/link';
import { PREMIUM_UPGRADE_PATH } from '@/lib/premium-upgrade';

function scoreTone(score: number | null): string {
  if (score == null) return 'text-on-surface-variant';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 55) return 'text-amber-600';
  return 'text-red-600';
}

function CheckRow({
  check,
  selected,
  onSelect,
}: {
  check: AtsReportCheck;
  selected?: boolean;
  onSelect?: (check: AtsReportCheck) => void;
}) {
  const clickable = Boolean(onSelect) && check.status !== 'locked' && Boolean(check.weaknessId);
  const Icon =
    check.status === 'locked'
      ? Lock
      : check.status === 'pass'
        ? CheckCircle2
        : AlertTriangle;
  const iconClass =
    check.status === 'locked'
      ? 'text-text-muted'
      : check.status === 'pass'
        ? 'text-emerald-500'
        : check.status === 'warn'
          ? 'text-amber-500'
          : 'text-red-500';

  const inner = (
    <>
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-on-surface">{check.label}</span>
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
              check.status === 'pass'
                ? 'text-emerald-600'
                : check.status === 'locked'
                  ? 'text-text-muted'
                  : 'text-amber-700'
            }`}
          >
            {check.summary}
          </span>
        </div>
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(check)}
        aria-pressed={selected}
        className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
          selected ? 'bg-primary/10' : 'hover:bg-surface-container'
        }`}
      >
        {inner}
      </button>
    );
  }

  return <div className="flex items-start gap-2 rounded-lg px-2 py-1.5">{inner}</div>;
}

function CategoryBlock({
  category,
  selectedWeaknessId,
  onSelectCheck,
}: {
  category: AtsReportCategory;
  selectedWeaknessId?: string | null;
  onSelectCheck?: (check: AtsReportCheck) => void;
}) {
  return (
    <div className={`border-b border-outline-variant/25 last:border-0 ${category.locked ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
            {category.label}
          </p>
          {category.locked && <Lock className="h-3 w-3 text-text-muted" />}
        </div>
        <span className={`text-xs font-extrabold tabular-nums ${scoreTone(category.score)}`}>
          {category.locked && category.score == null
            ? '??%'
            : category.score != null
              ? `${category.score}%`
              : '—'}
        </span>
      </div>
      <div className="space-y-0.5 px-1 pb-2">
        {category.checks.map((c) => (
          <CheckRow
            key={c.id}
            check={c}
            selected={Boolean(c.weaknessId && c.weaknessId === selectedWeaknessId)}
            onSelect={category.locked ? undefined : onSelectCheck}
          />
        ))}
      </div>
    </div>
  );
}

export function AtsReportRail({
  report,
  selectedWeaknessId,
  onSelectCheck,
  showUpgrade = true,
  className = '',
}: {
  report: AtsReport;
  selectedWeaknessId?: string | null;
  onSelectCheck?: (check: AtsReportCheck) => void;
  showUpgrade?: boolean;
  className?: string;
}) {
  return (
    <aside
      className={`overflow-hidden rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest shadow-card ${className}`}
    >
      <div className="border-b border-outline-variant/30 px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Your score</p>
        <div className="mt-2 flex items-end gap-2">
          <span className={`text-4xl font-extrabold tabular-nums leading-none ${scoreTone(report.overallScore)}`}>
            {report.overallScore}
          </span>
          <span className="pb-1 text-sm font-semibold text-on-surface-variant">/100</span>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          {report.issueCount} open issue{report.issueCount === 1 ? '' : 's'} · parse ~{report.parseRatePercent}%
        </p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container"
          role="progressbar"
          aria-valuenow={report.overallScore}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full ${
              report.overallScore >= 80
                ? 'bg-emerald-500'
                : report.overallScore >= 55
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${report.overallScore}%` }}
          />
        </div>
      </div>

      <div className="max-h-[62vh] overflow-y-auto">
        {report.categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            selectedWeaknessId={selectedWeaknessId}
            onSelectCheck={onSelectCheck}
          />
        ))}
      </div>

      {showUpgrade && report.categories.some((c) => c.locked) && (
        <div className="border-t border-outline-variant/30 p-3">
          <Link
            href={PREMIUM_UPGRADE_PATH}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            Unlock full report
          </Link>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-text-muted">
            Free keeps Content, Sections, and ATS Essentials. Premium adds HR, Bias, Seniority, and deep Tailoring.
          </p>
        </div>
      )}
    </aside>
  );
}

export function AtsIssueDetail({
  check,
  onFix,
}: {
  check: AtsReportCheck;
  onFix?: () => void;
}) {
  if (check.status === 'locked') {
    return (
      <div className="rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex items-center gap-2 text-text-muted">
          <Lock className="h-4 w-4" />
          <h3 className="font-semibold text-on-surface">{check.label}</h3>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{check.detail}</p>
        <Link
          href={PREMIUM_UPGRADE_PATH}
          className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary"
        >
          Unlock with Premium
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-outline-variant/50 bg-surface-container-lowest p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            check.status === 'pass'
              ? 'bg-emerald-500/10 text-emerald-700'
              : check.status === 'warn'
                ? 'bg-amber-500/10 text-amber-700'
                : 'bg-red-500/10 text-red-700'
          }`}
        >
          {check.summary}
        </span>
      </div>
      <h3 className="mt-2 font-headline text-lg font-bold text-on-surface">{check.label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{check.detail}</p>
      {check.quotes && check.quotes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {check.quotes.map((q, i) => (
            <li
              key={`${i}-${q.text.slice(0, 24)}`}
              className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm italic text-on-surface"
            >
              “{q.text}”
            </li>
          ))}
        </ul>
      )}
      {onFix && check.status !== 'pass' && check.weaknessId && (
        <button
          type="button"
          onClick={onFix}
          className="mt-4 inline-flex h-10 cursor-pointer items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary"
        >
          Edit &amp; fix
        </button>
      )}
    </div>
  );
}

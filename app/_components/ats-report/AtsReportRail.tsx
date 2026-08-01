'use client';

import Link from 'next/link';
import { CheckCircle2, Lock, AlertTriangle, AlertCircle } from 'lucide-react';
import type { AtsReport, AtsReportCheck, AtsReportCategory } from '@/lib/ats-report';
import { PREMIUM_UPGRADE_PATH } from '@/lib/premium-upgrade';
import { AtsScoreRing } from './AtsScoreRing';

function statusMeta(status: AtsReportCheck['status']): {
  label: string;
  row: string;
  badge: string;
  Icon: typeof CheckCircle2;
} {
  if (status === 'locked') {
    return {
      label: 'Locked',
      row: 'text-text-muted',
      badge: 'bg-surface-container text-text-muted',
      Icon: Lock,
    };
  }
  if (status === 'pass') {
    return {
      label: 'High score',
      row: 'text-on-surface',
      badge: 'bg-emerald-500/10 text-emerald-700',
      Icon: CheckCircle2,
    };
  }
  if (status === 'warn') {
    return {
      label: 'Needs work',
      row: 'text-on-surface',
      badge: 'bg-amber-500/10 text-amber-800',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Urgent',
    row: 'text-on-surface',
    badge: 'bg-red-500/10 text-red-700',
    Icon: AlertCircle,
  };
}

type FixState = 'fixed' | 'skipped';

function CheckRow({
  check,
  selected,
  onSelect,
  fixState,
}: {
  check: AtsReportCheck;
  selected?: boolean;
  onSelect?: (check: AtsReportCheck) => void;
  fixState?: FixState;
}) {
  const meta = statusMeta(check.status);
  const clickable = Boolean(onSelect) && check.status !== 'locked' && Boolean(check.weaknessId);
  const Icon = fixState === 'fixed' ? CheckCircle2 : meta.Icon;

  const badge =
    fixState === 'fixed'
      ? { label: 'Fixed', cls: 'bg-emerald-500/15 text-emerald-700' }
      : fixState === 'skipped'
        ? { label: 'Skipped', cls: 'bg-surface-container text-text-muted' }
        : { label: meta.label, cls: meta.badge };

  const body = (
    <>
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          fixState === 'fixed'
            ? 'text-emerald-500'
            : check.status === 'pass'
              ? 'text-emerald-500'
              : check.status === 'warn'
                ? 'text-amber-500'
                : check.status === 'fail'
                  ? 'text-red-500'
                  : 'text-text-muted'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-[13px] font-semibold ${
              fixState === 'skipped' ? 'text-text-muted' : ''
            }`}
          >
            {check.label}
          </span>
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.cls}`}>
            {badge.label}
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
        className={`flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
          selected ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-surface-container'
        } ${meta.row}`}
      >
        {body}
      </button>
    );
  }

  return <div className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${meta.row}`}>{body}</div>;
}

function CategoryBlock({
  category,
  selectedWeaknessId,
  onSelectCheck,
  statusByWeaknessId,
}: {
  category: AtsReportCategory;
  selectedWeaknessId?: string | null;
  onSelectCheck?: (check: AtsReportCheck) => void;
  statusByWeaknessId?: Record<string, FixState>;
}) {
  return (
    <div className={`border-b border-outline-variant/20 last:border-0 ${category.locked ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{category.label}</p>
          {category.locked && <Lock className="h-3 w-3 text-text-muted" />}
        </div>
        <span
          className={`text-sm font-extrabold tabular-nums ${
            category.score == null
              ? 'text-text-muted'
              : category.score >= 80
                ? 'text-emerald-600'
                : category.score >= 55
                  ? 'text-amber-600'
                  : 'text-red-600'
          }`}
        >
          {category.locked && category.score == null ? '??%' : category.score != null ? `${category.score}%` : '—'}
        </span>
      </div>
      <div className="space-y-0.5 px-1.5 pb-2.5">
        {category.checks.map((c) => (
          <CheckRow
            key={c.id}
            check={c}
            selected={Boolean(c.weaknessId && c.weaknessId === selectedWeaknessId)}
            onSelect={category.locked ? undefined : onSelectCheck}
            fixState={c.weaknessId ? statusByWeaknessId?.[c.weaknessId] : undefined}
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
  statusByWeaknessId,
}: {
  report: AtsReport;
  selectedWeaknessId?: string | null;
  onSelectCheck?: (check: AtsReportCheck) => void;
  showUpgrade?: boolean;
  className?: string;
  statusByWeaknessId?: Record<string, FixState>;
}) {
  const room = Math.max(0, 100 - report.overallScore);

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card ${className}`}
    >
      <div className="border-b border-outline-variant/25 bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-5">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
          Resume score
        </p>
        <div className="mt-3 flex justify-center">
          <AtsScoreRing score={report.overallScore} size={108} stroke={9} />
        </div>
        <p className="mt-3 text-center text-xs text-on-surface-variant">
          {room > 0 ? (
            <>
              Improve by up to <span className="font-bold text-on-surface">{room}</span> points
            </>
          ) : (
            'Looking strong — keep polishing details'
          )}
        </p>
        <p className="mt-1 text-center text-[11px] text-text-muted">
          {report.issueCount} open issue{report.issueCount === 1 ? '' : 's'} · parse ~{report.parseRatePercent}%
        </p>
      </div>

      <div className="max-h-[56vh] overflow-y-auto">
        {report.categories.map((cat) => (
          <CategoryBlock
            key={cat.id}
            category={cat}
            selectedWeaknessId={selectedWeaknessId}
            onSelectCheck={onSelectCheck}
            statusByWeaknessId={statusByWeaknessId}
          />
        ))}
      </div>

      {showUpgrade && report.categories.some((c) => c.locked) && (
        <div className="border-t border-outline-variant/25 p-3">
          <Link
            href={PREMIUM_UPGRADE_PATH}
            className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-primary text-sm font-semibold text-on-primary transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            Unlock full report
          </Link>
          <p className="mt-2 text-center text-[10px] leading-relaxed text-text-muted">
            Free: Content, Sections, ATS Essentials. Premium unlocks HR, Bias, Seniority & Tailoring.
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
  const meta = statusMeta(check.status);

  if (check.status === 'locked') {
    return (
      <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
        <div className="flex items-center gap-2 text-text-muted">
          <Lock className="h-4 w-4" />
          <h3 className="font-headline text-lg font-bold text-on-surface">{check.label}</h3>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{check.detail}</p>
        <Link
          href={PREMIUM_UPGRADE_PATH}
          className="mt-5 inline-flex h-11 cursor-pointer items-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary"
        >
          Unlock with Premium
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${meta.badge}`}>
        {meta.label}
      </span>
      <h3 className="mt-3 font-headline text-xl font-bold text-on-surface">{check.label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{check.detail}</p>
      {check.quotes && check.quotes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {check.quotes.map((q, i) => (
            <li
              key={`${i}-${q.text.slice(0, 20)}`}
              className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-sm italic text-on-surface"
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
          className="mt-5 inline-flex h-11 cursor-pointer items-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Edit &amp; fix
        </button>
      )}
    </div>
  );
}

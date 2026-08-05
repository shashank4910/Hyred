'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import { buildAtsReport, type AtsReport, type AtsReportCheck } from '@/lib/ats-report';
import { AtsIssueDetail, AtsReportRail } from '@/app/_components/ats-report/AtsReportRail';
import { AtsResumeTwinPreview } from '@/app/_components/ats-report/AtsResumeTwinPreview';
import { HyredResumePreview } from '@/app/_components/ats-report/HyredResumePreview';

export function AtsPublicReport({
  result,
  resumeText,
  onReset,
  report: reportProp,
}: {
  result: AtsCheckResult;
  resumeText: string;
  onReset: () => void;
  report?: AtsReport | null;
}) {
  const report = useMemo(() => {
    if (reportProp) return reportProp;
    return buildAtsReport(result, resumeText, { isPremium: false });
  }, [reportProp, result, resumeText]);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(
    () =>
      report.categories
        .flatMap((c) => c.checks)
        .find((c) => c.status !== 'pass' && c.status !== 'locked')?.id ?? null,
  );
  const [copied, setCopied] = useState(false);

  const activeCheck: AtsReportCheck | null =
    report.categories.flatMap((c) => c.checks).find((c) => c.id === activeCheckId) ??
    report.categories.flatMap((c) => c.checks).find((c) => c.status !== 'pass') ??
    null;

  const copyResults = () => {
    const lines = [
      `Hyred ATS Score: ${result.overallScore}/100`,
      `Open issues: ${report.issueCount}`,
      '',
      ...report.categories
        .filter((c) => !c.locked)
        .flatMap((c) => [
          `${c.label}: ${c.score ?? '—'}%`,
          ...c.checks.map((ch) => `  - ${ch.label}: ${ch.summary}`),
        ]),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-headline text-2xl font-bold tracking-tight text-gray-900">
            Your resume report
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Free: Content, Sections, and ATS Essentials — sign in to Edit &amp; Fix
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyResults}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer text-sm font-semibold text-[#006a65] hover:underline"
          >
            Check another
          </button>
        </div>
      </div>

      {result.parseWarning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {result.parseWarning}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <AtsReportRail
          report={report}
          selectedWeaknessId={activeCheck?.weaknessId ?? null}
          onSelectCheck={(c) => setActiveCheckId(c.id)}
          showUpgrade
        />
        <div className="space-y-4">
          {activeCheck && <AtsIssueDetail check={activeCheck} />}
          <div className="rounded-2xl border border-[#006a65]/20 bg-gradient-to-br from-[#006a65]/[0.06] to-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-gray-600">
              Sign in for a one-click AI resume upgrade (opens in a new tab). Effort scales with your
              score — then download a printable PDF. Uses Resume Studio credits.
            </p>
            <Link
              href="/login?next=%2Fats-checker"
              className="mt-4 inline-flex h-11 cursor-pointer items-center rounded-xl bg-[#006a65] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Sign in to upgrade
            </Link>
          </div>
        </div>
      </div>

      <AtsResumeTwinPreview
        originalLabel="Original text"
        hyredLabel="Hyred layout"
        hyredMeta="Premium visual"
        original={
          <pre className="whitespace-pre-wrap break-words rounded-sm border border-slate-200 bg-white p-4 font-sans text-[11px] leading-relaxed text-slate-800 shadow-sm">
            {resumeText.slice(0, 8000)}
          </pre>
        }
        hyred={<HyredResumePreview text={resumeText} showHighlights={false} />}
      />
    </div>
  );
}

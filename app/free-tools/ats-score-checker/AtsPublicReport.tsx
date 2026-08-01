'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import { buildAtsReport, type AtsReportCheck } from '@/lib/ats-report';
import { AtsIssueDetail, AtsReportRail } from '@/app/_components/ats-report/AtsReportRail';
import { AtsResumeTwinPreview } from '@/app/_components/ats-report/AtsResumeTwinPreview';
import { ResumeTemplateSamplePreview } from '@/app/(app)/jobs/[id]/ResumeTemplateSamplePreview';
import { DEFAULT_RESUME_TEMPLATE_ID } from '@/lib/resume-templates';

export function AtsPublicReport({
  result,
  resumeText,
  onReset,
}: {
  result: AtsCheckResult;
  resumeText: string;
  onReset: () => void;
}) {
  const report = useMemo(() => buildAtsReport(result, resumeText, { isPremium: false }), [result, resumeText]);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(
    () => report.categories.flatMap((c) => c.checks).find((c) => c.status !== 'pass' && c.status !== 'locked')?.id ?? null,
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Your resume report</h2>
          <p className="text-sm text-gray-500">Free: Content, Sections, and ATS Essentials</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyResults}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={onReset} className="text-sm font-medium text-[#006a65] hover:underline">
            Check another
          </button>
        </div>
      </div>

      {result.parseWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {result.parseWarning}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <AtsReportRail
          report={report}
          selectedWeaknessId={activeCheck?.weaknessId ?? null}
          onSelectCheck={(c) => setActiveCheckId(c.id)}
          showUpgrade
        />
        <div className="space-y-5">
          {activeCheck && <AtsIssueDetail check={activeCheck} />}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm text-gray-600">
              Sign in to use Edit &amp; Fix with AI rewrites (Resume Studio credits).
            </p>
            <Link
              href="/ats-checker"
              className="inline-flex h-10 items-center rounded-xl bg-[#006a65] px-4 text-sm font-semibold text-white"
            >
              Open Fix Studio
            </Link>
          </div>
        </div>
      </div>

      <AtsResumeTwinPreview
        originalLabel="Original text"
        hyredLabel="Hyred layout"
        original={
          <pre className="whitespace-pre-wrap break-words rounded-[2px] border border-black/5 bg-white p-4 font-sans text-[11px] leading-relaxed text-slate-800 shadow-sm">
            {resumeText.slice(0, 8000)}
          </pre>
        }
        hyred={
          <div className="overflow-hidden rounded-[2px] border border-black/5 bg-white shadow-sm">
            <ResumeTemplateSamplePreview
              templateId={DEFAULT_RESUME_TEMPLATE_ID}
              sampleText={resumeText}
            />
          </div>
        }
      />
    </div>
  );
}

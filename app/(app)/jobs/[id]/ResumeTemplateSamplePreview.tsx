'use client';

import type { ResumeTemplatePreviewId } from '@/lib/resume-template-previews';

const LINES = (text: string) => text.split('\n').filter(Boolean);

function parseSample(text: string) {
  const lines = text.split('\n');
  const name = lines[0]?.trim() ?? 'Your Name';
  const contact = lines[1]?.trim() ?? '';
  const location = lines[2]?.trim() ?? '';
  let bodyStart = 3;
  while (bodyStart < lines.length && !lines[bodyStart]?.trim()) bodyStart++;
  const body = lines.slice(bodyStart).join('\n');
  return { name, contact, location, body };
}

/** Visual mock of how each PDF template lays out the same sample resume. */
export function ResumeTemplateSamplePreview({
  templateId,
  sampleText,
}: {
  templateId: ResumeTemplatePreviewId;
  sampleText: string;
}) {
  const { name, contact, location, body } = parseSample(sampleText);
  const bodyLines = LINES(body);

  const headerClassic = (
    <div className="rounded-t-lg bg-[#0f172a] text-white px-5 py-4 border-t-4 border-amber-400">
      <div className="text-xl font-bold tracking-tight">{name}</div>
      <div className="text-[10px] uppercase tracking-widest text-amber-400 mt-1 font-medium">
        Performance Engineer
      </div>
      <div className="text-[10px] text-slate-300 mt-2">
        {contact}
        {location ? ` | ${location}` : ''}
      </div>
    </div>
  );

  const headerMinimal = (
    <div className="border-b-2 border-slate-900 pb-3 mb-4">
      <div className="text-2xl font-bold text-slate-900">{name}</div>
      <div className="text-xs text-slate-600 mt-1">{contact}</div>
      {location && <div className="text-xs text-slate-500">{location}</div>}
    </div>
  );

  const headerTeal = (
    <div className="border-l-4 border-primary pl-4 mb-4">
      <div className="text-xl font-bold text-on-surface">{name}</div>
      <div className="text-xs text-primary font-medium">Performance Engineer</div>
      <div className="text-[10px] text-on-surface-variant mt-1">{contact}</div>
    </div>
  );

  const bodyDefault = (
    <div className="space-y-2 text-[11px] leading-relaxed text-slate-700 font-sans">
      {bodyLines.map((line, i) => {
        const isSection = /^[A-Z][A-Z\s&]+$/.test(line.trim()) && line.length < 40;
        const isBullet = line.trim().startsWith('-');
        if (isSection) {
          return (
            <div key={i} className="pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-800 border-b border-slate-200">
              {line}
            </div>
          );
        }
        if (isBullet) {
          return (
            <div key={i} className="pl-3 text-slate-600">
              {line.trim()}
            </div>
          );
        }
        return <div key={i}>{line}</div>;
      })}
    </div>
  );

  const pageClass =
    'mx-auto max-w-lg bg-white shadow-md rounded-lg overflow-hidden border border-slate-200';

  switch (templateId) {
    case 'classic-navy':
      return (
        <div className={pageClass}>
          {headerClassic}
          <div className="p-5">{bodyDefault}</div>
        </div>
      );
    case 'clean-minimal':
      return (
        <div className={`${pageClass} p-5`}>
          {headerMinimal}
          {bodyDefault}
        </div>
      );
    case 'modern-teal':
      return (
        <div className={`${pageClass} p-5 bg-surface-container-lowest`}>
          {headerTeal}
          {bodyDefault}
        </div>
      );
    case 'compact-one-page':
      return (
        <div className={`${pageClass} p-4`}>
          <div className="text-lg font-bold">{name}</div>
          <div className="text-[9px] text-slate-500 mb-2">{contact}</div>
          <div className="text-[10px] leading-snug space-y-1 text-slate-700">{bodyDefault}</div>
        </div>
      );
    case 'executive':
      return (
        <div className={`${pageClass} p-6 text-center`}>
          <div className="text-2xl font-serif font-bold text-slate-900">{name}</div>
          <div className="text-xs text-slate-500 mt-1 mb-4">{contact}</div>
          <div className="text-left">{bodyDefault}</div>
        </div>
      );
    case 'tech-stack':
      return (
        <div className={pageClass}>
          <div className="bg-slate-100 px-5 py-3 border-b">
            <div className="font-bold">{name}</div>
            <div className="text-[10px] text-slate-600 mt-1">Java · Python · JMeter · k6 · AWS · Kubernetes</div>
          </div>
          <div className="p-5">{bodyDefault}</div>
        </div>
      );
    case 'consulting':
      return (
        <div className={`${pageClass} p-6`}>
          <div className="text-lg font-semibold text-slate-800">{name}</div>
          <div className="text-[10px] text-slate-500 mb-6">{contact}</div>
          <div className="space-y-3">{bodyDefault}</div>
        </div>
      );
    case 'creative-lite':
      return (
        <div className={pageClass}>
          <div className="bg-gradient-to-r from-primary/20 to-secondary/20 px-5 py-4">
            <div className="text-xl font-bold">{name}</div>
            <div className="text-xs text-on-surface-variant">{contact}</div>
          </div>
          <div className="p-5">{bodyDefault}</div>
        </div>
      );
    case 'two-column-skills':
      return (
        <div className={`${pageClass} p-4 flex gap-4 text-[10px]`}>
          <div className="w-1/3 shrink-0 border-r pr-3 space-y-2">
            <div className="font-bold text-sm">{name}</div>
            <div className="text-slate-500">{contact}</div>
            <div className="font-semibold uppercase text-[9px] mt-3">Skills</div>
            <div className="text-slate-600">JMeter, k6, AWS, Java, Python</div>
          </div>
          <div className="flex-1 min-w-0">{bodyDefault}</div>
        </div>
      );
    case 'international':
      return (
        <div className={`${pageClass} p-5`}>
          <div className="text-lg font-bold">{name}</div>
          <div className="text-[10px] text-slate-600">{contact} · {location}</div>
          <div className="mt-4">{bodyDefault}</div>
        </div>
      );
    default:
      return (
        <div className={pageClass}>
          {headerClassic}
          <div className="p-5">{bodyDefault}</div>
        </div>
      );
  }
}

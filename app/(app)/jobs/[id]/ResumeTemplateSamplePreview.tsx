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

function SectionBody({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-1.5 text-[9px] leading-[1.45] text-slate-700 sm:text-[10px]">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isSection = /^[A-Z][A-Z\s&]+$/.test(trimmed) && trimmed.length < 40;
        const isBullet = trimmed.startsWith('-');
        if (isSection) {
          return (
            <div
              key={i}
              className="pt-2.5 pb-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-800 sm:text-[9px]"
            >
              <span className="border-b border-slate-300/80 pb-0.5">{trimmed}</span>
            </div>
          );
        }
        if (isBullet) {
          return (
            <div key={i} className="flex gap-1.5 pl-0.5 text-slate-600">
              <span className="text-slate-400">•</span>
              <span>{trimmed.replace(/^-\s*/, '')}</span>
            </div>
          );
        }
        return (
          <div key={i} className="text-slate-700">
            {line}
          </div>
        );
      })}
    </div>
  );
}

/** Scaled A4 mock — sits inside the preview modal paper frame. */
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
    <div className="bg-[#0f172a] px-[6%] py-[4.5%] text-white">
      <div className="border-t-[3px] border-amber-400 pt-2">
        <div className="text-[clamp(14px,4.2vw,18px)] font-bold uppercase tracking-tight">
          {name}
        </div>
        <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-amber-400 sm:text-[9px]">
          Performance Engineer
        </div>
        <div className="mt-2 text-[7px] leading-relaxed text-slate-300 sm:text-[8px]">
          {contact}
          {location ? ` · ${location}` : ''}
        </div>
      </div>
    </div>
  );

  const headerMinimal = (
    <div className="border-b-2 border-slate-900 pb-3 mb-3">
      <div className="text-[clamp(16px,4.5vw,20px)] font-bold text-slate-900">{name}</div>
      <div className="mt-1 text-[8px] text-slate-600">{contact}</div>
      {location && <div className="text-[8px] text-slate-500">{location}</div>}
    </div>
  );

  const headerTeal = (
    <div className="mb-3 border-l-[3px] border-primary pl-3">
      <div className="text-[clamp(14px,4vw,17px)] font-bold text-slate-900">{name}</div>
      <div className="text-[8px] font-semibold text-primary">Performance Engineer</div>
      <div className="mt-1 text-[7px] text-slate-500">{contact}</div>
    </div>
  );

  const bodyDefault = <SectionBody lines={bodyLines} />;

  const inner = (() => {
    switch (templateId) {
      case 'classic-navy':
        return (
          <>
            {headerClassic}
            <div className="px-[6%] py-[4%]">{bodyDefault}</div>
          </>
        );
      case 'clean-minimal':
        return <div className="px-[6%] py-[5%]">{headerMinimal}{bodyDefault}</div>;
      case 'modern-teal':
        return <div className="px-[6%] py-[5%] bg-slate-50">{headerTeal}{bodyDefault}</div>;
      case 'compact-one-page':
        return (
          <div className="px-[5%] py-[4%]">
            <div className="text-[clamp(13px,3.8vw,16px)] font-bold">{name}</div>
            <div className="mb-2 text-[7px] text-slate-500">{contact}</div>
            {bodyDefault}
          </div>
        );
      case 'executive':
        return (
          <div className="px-[6%] py-[5%] text-center">
            <div className="text-[clamp(16px,4.5vw,20px)] font-serif font-bold text-slate-900">{name}</div>
            <div className="mb-4 mt-1 text-[8px] text-slate-500">{contact}</div>
            <div className="text-left">{bodyDefault}</div>
          </div>
        );
      case 'tech-stack':
        return (
          <>
            <div className="border-b border-slate-200 bg-slate-100 px-[6%] py-[3.5%]">
              <div className="text-[clamp(13px,3.8vw,16px)] font-bold">{name}</div>
              <div className="mt-1 text-[7px] text-slate-600">
                Java · Python · JMeter · k6 · AWS · Kubernetes
              </div>
            </div>
            <div className="px-[6%] py-[4%]">{bodyDefault}</div>
          </>
        );
      case 'consulting':
        return (
          <div className="px-[6%] py-[5%]">
            <div className="text-[clamp(13px,3.8vw,16px)] font-semibold text-slate-800">{name}</div>
            <div className="mb-4 text-[7px] text-slate-500">{contact}</div>
            {bodyDefault}
          </div>
        );
      case 'creative-lite':
        return (
          <>
            <div className="bg-gradient-to-r from-primary/15 to-teal-400/20 px-[6%] py-[4%]">
              <div className="text-[clamp(14px,4vw,17px)] font-bold">{name}</div>
              <div className="text-[8px] text-slate-600">{contact}</div>
            </div>
            <div className="px-[6%] py-[4%]">{bodyDefault}</div>
          </>
        );
      case 'two-column-skills':
        return (
          <div className="flex gap-[4%] px-[5%] py-[4%]">
            <div className="w-[32%] shrink-0 border-r border-slate-200 pr-[3%]">
              <div className="text-[clamp(11px,3.2vw,14px)] font-bold leading-tight">{name}</div>
              <div className="mt-1 text-[7px] text-slate-500">{contact}</div>
              <div className="mt-3 text-[7px] font-bold uppercase tracking-wide text-slate-700">Skills</div>
              <div className="mt-1 text-[7px] text-slate-600">JMeter, k6, AWS, Java, Python</div>
            </div>
            <div className="min-w-0 flex-1">{bodyDefault}</div>
          </div>
        );
      case 'international':
        return (
          <div className="px-[6%] py-[5%]">
            <div className="text-[clamp(13px,3.8vw,16px)] font-bold">{name}</div>
            <div className="text-[7px] text-slate-600">
              {contact} · {location}
            </div>
            <div className="mt-3">{bodyDefault}</div>
          </div>
        );
      default:
        return (
          <>
            {headerClassic}
            <div className="px-[6%] py-[4%]">{bodyDefault}</div>
          </>
        );
    }
  })();

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-white font-sans">
      {inner}
    </div>
  );
}

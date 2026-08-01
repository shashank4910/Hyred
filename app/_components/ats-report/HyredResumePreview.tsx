'use client';

import { useMemo } from 'react';
import {
  lineIsHighlighted,
  parseResumeDocument,
  type ResumeLine,
  type ResumeSection,
} from '@/lib/resume-document';

type Highlight = { start: number; end: number; kind: 'needs' | 'fixed' } | null;

function HighlightMark({
  active,
  kind,
  children,
}: {
  active: boolean;
  kind: 'needs' | 'fixed';
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  const cls =
    kind === 'fixed'
      ? 'bg-teal-400/30 shadow-[inset_3px_0_0_#0d9488] ring-1 ring-teal-500/35'
      : 'bg-amber-300/40 shadow-[inset_3px_0_0_#f59e0b] ring-1 ring-amber-400/45';
  return <mark className={`rounded-[2px] px-0.5 text-inherit ${cls}`}>{children}</mark>;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HY';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function looksLikeTitle(line: ResumeLine): boolean {
  const t = line.text.trim();
  if (t.length > 70 || /@|\+?\d[\d\s()-]{6,}|linkedin|github|http/i.test(t)) return false;
  return /\b(engineer|developer|analyst|manager|designer|consultant|specialist|lead|architect|tester|sdet|sre|executive|officer)\b/i.test(
    t,
  );
}

function sectionBucket(heading: string | null): 'main' | 'side' {
  if (!heading) return 'main';
  if (/(summary|objective|profile|skills|competenc|certif|language|strength|interest|award)/i.test(heading)) {
    return 'side';
  }
  return 'main';
}

function stripContactLabel(text: string): string {
  return text.replace(
    /^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address|contact)\s*:\s*/i,
    '',
  );
}

function skillChips(lines: ResumeLine[]): string[] {
  const chips: string[] = [];
  for (const line of lines) {
    const raw = line.value ?? line.content ?? line.text;
    for (const part of raw.split(/[,|•·]/)) {
      const t = part.replace(/^[-–]\s*/, '').trim();
      if (t.length >= 2 && t.length <= 40) chips.push(t);
    }
  }
  return [...new Set(chips)].slice(0, 24);
}

function SectionHeading({
  text,
  highlight,
  kind,
  line,
}: {
  text: string;
  highlight: Highlight;
  kind: 'needs' | 'fixed';
  line: ResumeLine | null;
}) {
  return (
    <h2 className="mb-2.5 flex items-center gap-2 border-b border-slate-200 pb-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-800">
        {line ? (
          <HighlightMark active={lineIsHighlighted(line, highlight)} kind={kind}>
            {text}
          </HighlightMark>
        ) : (
          text
        )}
      </span>
    </h2>
  );
}

function renderSectionBody(
  section: ResumeSection,
  hl: Highlight,
  kind: 'needs' | 'fixed',
  asChips: boolean,
) {
  if (asChips) {
    const chips = skillChips(section.lines);
    if (chips.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700"
          >
            {chip}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-[11.5px] leading-[1.55] text-slate-700">
      {section.lines.map((line) => {
        const active = lineIsHighlighted(line, hl);
        if (line.kind === 'entryHeading') {
          const parts = line.text.split('|').map((p) => p.trim()).filter(Boolean);
          const title = parts[0] ?? line.text;
          const mid = parts.slice(1, -1).join(' · ');
          const dates = parts.length > 1 ? parts[parts.length - 1] : null;
          return (
            <div
              key={line.start}
              className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 first:mt-0"
            >
              <p className="min-w-0 font-semibold text-slate-900">
                <HighlightMark active={active} kind={kind}>
                  {title}
                  {mid ? <span className="font-medium text-slate-600"> · {mid}</span> : null}
                </HighlightMark>
              </p>
              {dates && (
                <p className="shrink-0 text-[10px] font-medium text-slate-500">{dates}</p>
              )}
            </div>
          );
        }
        if (line.kind === 'bullet') {
          return (
            <div key={line.start} className="flex gap-2">
              <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                <HighlightMark active={active} kind={kind}>
                  {line.content}
                </HighlightMark>
              </p>
            </div>
          );
        }
        if (line.kind === 'skill') {
          return (
            <p key={line.start}>
              <HighlightMark active={active} kind={kind}>
                {line.label ? (
                  <>
                    <span className="font-semibold text-slate-900">{line.label}:</span> {line.value}
                  </>
                ) : (
                  line.text
                )}
              </HighlightMark>
            </p>
          );
        }
        return (
          <p key={line.start}>
            <HighlightMark active={active} kind={kind}>
              {line.text}
            </HighlightMark>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Production Hyred resume preview — Enhancv-quality visual layout.
 * Designed for humans (recruiters). Copy/export text stays ATS-safe single column.
 */
export function HyredResumePreview({
  text,
  highlight = null,
  showHighlights = true,
  className = '',
}: {
  text: string;
  highlight?: Highlight;
  showHighlights?: boolean;
  className?: string;
}) {
  const doc = useMemo(() => parseResumeDocument(text), [text]);
  const hl = showHighlights ? highlight : null;
  const kind = highlight?.kind ?? 'fixed';

  const contactLines = [...doc.contact];
  let roleTitle: ResumeLine | null = null;
  if (contactLines[0] && looksLikeTitle(contactLines[0])) {
    const rest = contactLines.slice(1);
    if (rest.length === 0 || rest.some((c) => /@|\d{6,}|linkedin|github|,/i.test(c.text))) {
      roleTitle = contactLines.shift() ?? null;
    }
  }

  const name = doc.name?.text ?? 'Your Name';
  const initials = initialsFromName(name);

  const mainSections = doc.sections.filter((s) => sectionBucket(s.heading?.text ?? null) === 'main');
  const sideSections = doc.sections.filter((s) => sectionBucket(s.heading?.text ?? null) === 'side');

  // If parser put everything in one bucket, fall back to stacked single column still looking premium.
  const useTwoCol = mainSections.length > 0 && sideSections.length > 0;

  return (
    <article
      className={`relative mx-auto w-full max-w-[720px] overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06),0_18px_48px_rgba(15,23,42,0.12)] ${className}`}
      aria-label="Hyred resume preview"
    >
      {/* Header — name + initials badge (Enhancv-style) */}
      <header className="border-b border-slate-100 px-7 pb-5 pt-7 sm:px-9 sm:pb-6 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[clamp(1.35rem,2.8vw,1.75rem)] font-extrabold tracking-tight text-slate-900">
              {doc.name ? (
                <HighlightMark active={lineIsHighlighted(doc.name, hl)} kind={kind}>
                  {name}
                </HighlightMark>
              ) : (
                name
              )}
            </h1>
            {roleTitle && (
              <p className="mt-1 text-[12px] font-semibold text-[#2563eb]">
                <HighlightMark active={lineIsHighlighted(roleTitle, hl)} kind={kind}>
                  {roleTitle.text}
                </HighlightMark>
              </p>
            )}
            {contactLines.length > 0 && (
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-500">
                {contactLines.map((c, i) => (
                  <span key={c.start} className="inline-flex items-center gap-2">
                    {i > 0 && <span className="text-slate-300" aria-hidden="true">|</span>}
                    <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                      {stripContactLabel(c.text)}
                    </HighlightMark>
                  </span>
                ))}
              </p>
            )}
          </div>
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-bold tracking-wide text-white shadow-md sm:h-16 sm:w-16 sm:text-base"
            aria-hidden="true"
          >
            {initials}
          </div>
        </div>
      </header>

      {doc.sections.length === 0 ? (
        <div className="px-7 py-6 sm:px-9">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
            {text.slice(0, 4000)}
          </p>
        </div>
      ) : useTwoCol ? (
        <div className="grid gap-0 sm:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 border-slate-100 px-7 py-6 sm:border-r sm:px-8 sm:py-7">
            {mainSections.map((section, si) => (
              <section key={section.heading?.start ?? `m-${si}`}>
                {section.heading && (
                  <SectionHeading
                    text={section.heading.text}
                    highlight={hl}
                    kind={kind}
                    line={section.heading}
                  />
                )}
                {renderSectionBody(section, hl, kind, false)}
              </section>
            ))}
          </div>
          <div className="space-y-5 bg-slate-50/80 px-7 py-6 sm:px-7 sm:py-7">
            {sideSections.map((section, si) => {
              const isSkills = /skill|competenc/i.test(section.heading?.text ?? '');
              return (
                <section key={section.heading?.start ?? `s-${si}`}>
                  {section.heading && (
                    <SectionHeading
                      text={section.heading.text}
                      highlight={hl}
                      kind={kind}
                      line={section.heading}
                    />
                  )}
                  {renderSectionBody(section, hl, kind, isSkills)}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-5 px-7 py-6 sm:px-9 sm:py-7">
          {doc.sections.map((section, si) => {
            const isSkills = /skill|competenc/i.test(section.heading?.text ?? '');
            return (
              <section key={section.heading?.start ?? `sec-${si}`}>
                {section.heading && (
                  <SectionHeading
                    text={section.heading.text}
                    highlight={hl}
                    kind={kind}
                    line={section.heading}
                  />
                )}
                {renderSectionBody(section, hl, kind, isSkills)}
              </section>
            );
          })}
        </div>
      )}

      <footer className="flex items-center justify-end border-t border-slate-100 px-6 py-2.5">
        <span className="text-[9px] font-semibold tracking-wide text-slate-400">
          Powered by <span className="text-primary">Hyred</span>
        </span>
      </footer>
    </article>
  );
}

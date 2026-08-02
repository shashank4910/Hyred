'use client';

import { useMemo } from 'react';
import {
  lineIsHighlighted,
  parseResumeDocument,
  type ResumeLine,
  type ResumeSection,
} from '@/lib/resume-document';

type Highlight = { start: number; end: number; kind: 'needs' | 'fixed' } | null;

/** Matches lib/pdf-resume.ts design tokens (Classic Navy ATS PDF). */
const C = {
  headerBg: '#0f172a',
  accent: '#eab308',
  white: '#ffffff',
  ink: '#0f172a',
  stone: '#505c6e',
  light: '#b4c3d7',
};

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

function looksLikeTitle(line: ResumeLine): boolean {
  const t = line.text.trim();
  if (t.length > 90 || /@|\+?\d[\d\s()-]{6,}|linkedin|github|http/i.test(t)) return false;
  return true;
}

function stripContactLabel(text: string): string {
  return text.replace(
    /^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address|contact)\s*:\s*/i,
    '',
  );
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
    <h2 className="mb-2.5">
      <span
        className="mb-2 block h-[1.2px] w-full"
        style={{ backgroundColor: C.accent }}
        aria-hidden="true"
      />
      <span
        className="text-[11px] font-bold uppercase tracking-[0.04em]"
        style={{ color: C.ink }}
      >
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
) {
  return (
    <div className="space-y-1 text-[11.5px] leading-[1.45]" style={{ color: C.ink }}>
      {section.lines.map((line) => {
        const active = lineIsHighlighted(line, hl);
        if (line.kind === 'entryHeading') {
          return (
            <p key={line.start} className="mt-2.5 font-bold first:mt-0" style={{ color: C.ink }}>
              <HighlightMark active={active} kind={kind}>
                {line.text}
              </HighlightMark>
            </p>
          );
        }
        if (line.kind === 'bullet') {
          return (
            <div key={line.start} className="flex gap-2 pl-0">
              <span className="shrink-0 font-normal select-none" aria-hidden="true">
                -
              </span>
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
                    <span className="font-bold">{line.label}:</span> {line.value}
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
 * On-screen preview that matches Download PDF (lib/pdf-resume Classic Navy).
 * Single-column ATS layout — what you see is what you get when you download.
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

  return (
    <article
      className={`relative mx-auto w-full max-w-[720px] overflow-hidden rounded-sm border border-slate-300/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08),0_14px_40px_rgba(15,23,42,0.1)] ${className}`}
      aria-label="Hyred resume preview"
    >
      {/* Navy header — matches generateBeautifulPdf */}
      <header className="relative px-7 pb-5 pt-6 sm:px-9 sm:pb-6 sm:pt-7" style={{ backgroundColor: C.headerBg }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: C.accent }} />
        <h1 className="text-[clamp(1.25rem,2.6vw,1.55rem)] font-bold tracking-wide text-white">
          {doc.name ? (
            <HighlightMark active={lineIsHighlighted(doc.name, hl)} kind={kind}>
              {name.toUpperCase()}
            </HighlightMark>
          ) : (
            name.toUpperCase()
          )}
        </h1>
        {roleTitle && (
          <p
            className="mt-1.5 text-[11px] font-normal uppercase tracking-[0.06em]"
            style={{ color: C.accent }}
          >
            <HighlightMark active={lineIsHighlighted(roleTitle, hl)} kind={kind}>
              {roleTitle.text.toUpperCase()}
            </HighlightMark>
          </p>
        )}
        {contactLines.length > 0 && (
          <p
            className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] leading-relaxed"
            style={{ color: C.light }}
          >
            {contactLines.map((c, i) => (
              <span key={c.start} className="inline-flex items-center gap-2">
                {i > 0 && (
                  <span style={{ color: C.light, opacity: 0.7 }} aria-hidden="true">
                    |
                  </span>
                )}
                <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                  {stripContactLabel(c.text)}
                </HighlightMark>
              </span>
            ))}
          </p>
        )}
      </header>

      {/* Single-column body — same as PDF */}
      {doc.sections.length === 0 ? (
        <div className="px-7 py-6 sm:px-9">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: C.stone }}>
            {text.slice(0, 4000)}
          </p>
        </div>
      ) : (
        <div className="space-y-4 px-7 py-6 sm:px-9 sm:py-7">
          {doc.sections.map((section, si) => (
            <section key={section.heading?.start ?? `sec-${si}`}>
              {section.heading && (
                <SectionHeading
                  text={section.heading.text}
                  highlight={hl}
                  kind={kind}
                  line={section.heading}
                />
              )}
              {renderSectionBody(section, hl, kind)}
            </section>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-end border-t border-slate-100 px-6 py-2">
        <span className="text-[9px] font-semibold tracking-wide text-slate-400">
          Same layout as Download PDF · <span className="text-primary">Hyred</span>
        </span>
      </footer>
    </article>
  );
}

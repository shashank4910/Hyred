'use client';

import { useMemo } from 'react';
import {
  lineIsHighlighted,
  parseResumeDocument,
  type ResumeLine,
  type ResumeSection,
} from '@/lib/resume-document';
import { resolveResumeTheme } from '@/lib/resume-template-theme';

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
  sectionColor,
}: {
  text: string;
  highlight: Highlight;
  kind: 'needs' | 'fixed';
  line: ResumeLine | null;
  sectionColor: string;
}) {
  return (
    <h2 className="mb-2.5">
      <span
        className="text-[11px] font-bold uppercase tracking-[0.06em]"
        style={{ color: sectionColor }}
      >
        {line ? (
          <HighlightMark active={lineIsHighlighted(line, highlight)} kind={kind}>
            {text}
          </HighlightMark>
        ) : (
          text
        )}
      </span>
      <span className="mt-1.5 block h-[1px] w-full" style={{ backgroundColor: sectionColor }} />
    </h2>
  );
}

function splitLeftAndDates(text: string): { left: string; dates: string | null } {
  const paren = text.match(/^(.+?)\s*[(\[]\s*([^)\]]*\d{4}[^)\]]*)\s*[)\]]\s*$/);
  if (paren) return { left: paren[1].trim(), dates: paren[2].trim() };
  const pipeParts = text.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const last = pipeParts[pipeParts.length - 1]!;
    if (/\d{4}/.test(last) || /present|current/i.test(last)) {
      return { left: pipeParts.slice(0, -1).join(' · '), dates: last };
    }
  }
  return { left: text, dates: null };
}

function renderSectionBody(
  section: ResumeSection,
  hl: Highlight,
  kind: 'needs' | 'fixed',
  ink: string,
  stone: string,
) {
  return (
    <div className="space-y-1.5 text-[11.5px] leading-[1.5]" style={{ color: ink }}>
      {section.lines.map((line) => {
        const active = lineIsHighlighted(line, hl);
        if (line.kind === 'entryHeading' || (!line.kind.startsWith('bullet') && looksLikeHeaderLine(line.text))) {
          const { left, dates } = splitLeftAndDates(line.text);
          return (
            <div
              key={line.start}
              className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 first:mt-0"
            >
              <p className="min-w-0 font-bold" style={{ color: ink }}>
                <HighlightMark active={active} kind={kind}>
                  {left}
                </HighlightMark>
              </p>
              {dates && (
                <p className="shrink-0 text-[10px] font-normal" style={{ color: stone }}>
                  {dates}
                </p>
              )}
            </div>
          );
        }
        if (line.kind === 'bullet') {
          return (
            <div key={line.start} className="flex gap-2">
              <span className="shrink-0 select-none" aria-hidden="true">
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

function looksLikeHeaderLine(text: string): boolean {
  return (
    /[|]/.test(text) ||
    /\d{4}\s*[-–]\s*(present|current|\d{4})/i.test(text) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{0,30}\d{4}/i.test(text) ||
    /pvt|ltd|inc|llc|corp|technologies|services/i.test(text)
  );
}

/**
 * On-screen preview matching Download PDF — Executive Clean (ATS-safe).
 */
export function HyredResumePreview({
  text,
  highlight = null,
  showHighlights = true,
  className = '',
  templateId,
}: {
  text: string;
  highlight?: Highlight;
  showHighlights?: boolean;
  className?: string;
  templateId?: string | null;
}) {
  const doc = useMemo(() => parseResumeDocument(text), [text]);
  const theme = useMemo(() => resolveResumeTheme(templateId), [templateId]);
  const css = theme.css;
  const hl = showHighlights ? highlight : null;
  const kind = highlight?.kind ?? 'fixed';
  const isBand = theme.headerStyle === 'band';

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
      className={`relative mx-auto w-full max-w-[720px] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.08)] ${className}`}
      aria-label={`${theme.name} resume preview`}
    >
      <header
        className={`relative px-8 pb-4 pt-7 sm:px-10 sm:pt-8 ${isBand ? 'pb-5 pt-6 sm:pb-6' : ''}`}
        style={isBand ? { backgroundColor: css.bandBg } : undefined}
      >
        {isBand && css.bandAccent && (
          <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: css.bandAccent }} />
        )}
        <h1
          className="text-[clamp(1.2rem,2.5vw,1.45rem)] font-bold tracking-[0.04em]"
          style={{ color: isBand ? (css.bandName ?? '#ffffff') : css.name }}
        >
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
            className={`mt-1.5 text-[12px] font-normal ${isBand ? 'uppercase tracking-[0.05em]' : ''}`}
            style={{ color: isBand ? (css.bandTitle ?? css.title) : css.title }}
          >
            <HighlightMark active={lineIsHighlighted(roleTitle, hl)} kind={kind}>
              {roleTitle.text}
            </HighlightMark>
          </p>
        )}
        {contactLines.length > 0 && (
          <p
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed"
            style={{ color: isBand ? (css.bandContact ?? css.contact) : css.contact }}
          >
            {contactLines.map((c, i) => (
              <span key={c.start} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">|</span>}
                <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                  {stripContactLabel(c.text)}
                </HighlightMark>
              </span>
            ))}
          </p>
        )}
        {!isBand && (
          <div className="mt-4 h-[1.5px] w-full" style={{ backgroundColor: css.section }} />
        )}
      </header>

      {doc.sections.length === 0 ? (
        <div className="px-8 py-5 sm:px-10">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: css.stone }}>
            {text.slice(0, 4000)}
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-8 pb-7 pt-5 sm:px-10 sm:pb-8">
          {doc.sections.map((section, si) => (
            <section key={section.heading?.start ?? `sec-${si}`}>
              {section.heading && (
                <SectionHeading
                  text={section.heading.text}
                  highlight={hl}
                  kind={kind}
                  line={section.heading}
                  sectionColor={css.section}
                />
              )}
              {renderSectionBody(section, hl, kind, css.ink, css.stone)}
            </section>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-end border-t border-slate-100 px-6 py-2">
        <span className="text-[9px] font-semibold tracking-wide text-slate-400">
          {theme.name} · ATS-safe · <span className="text-primary">Hyred</span>
        </span>
      </footer>
    </article>
  );
}

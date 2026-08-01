'use client';

import { useMemo } from 'react';
import {
  lineIsHighlighted,
  parseResumeDocument,
  type ResumeLine,
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
      ? 'bg-teal-400/25 shadow-[inset_3px_0_0_#0d9488] ring-1 ring-teal-500/30'
      : 'bg-amber-300/35 shadow-[inset_3px_0_0_#f59e0b] ring-1 ring-amber-400/40';
  return <mark className={`rounded-[2px] px-0.5 text-inherit ${cls}`}>{children}</mark>;
}

function looksLikeTitle(line: ResumeLine, contactCount: number): boolean {
  if (contactCount > 0) return false;
  const t = line.text.trim();
  if (t.length > 70 || /@|\+?\d[\d\s()-]{6,}|linkedin|github|http/i.test(t)) return false;
  return /\b(engineer|developer|analyst|manager|designer|consultant|specialist|lead|architect|tester|sdet|sre)\b/i.test(
    t,
  );
}

/**
 * Hyred ATS-friendly resume preview — Classic Navy.
 * Single column, real text bullets, navy header + amber accent (matches PDF generator).
 * Looks like a real A4 page, not a text dump.
 */
export function HyredResumePreview({
  text,
  highlight = null,
  showHighlights = true,
  className = '',
}: {
  text: string;
  highlight?: Highlight;
  /** When false, never paint edit marks (e.g. original pane). */
  showHighlights?: boolean;
  className?: string;
}) {
  const doc = useMemo(() => parseResumeDocument(text), [text]);
  const hl = showHighlights ? highlight : null;
  const kind = highlight?.kind ?? 'fixed';

  // Peel a role title off the first contact line when it looks like a job title.
  const contactLines = [...doc.contact];
  let roleTitle: ResumeLine | null = null;
  if (contactLines[0] && looksLikeTitle(contactLines[0], contactLines.length)) {
    const rest = contactLines.slice(1);
    if (rest.length === 0 || rest.some((c) => /@|\d{6,}|linkedin|github|,/i.test(c.text))) {
      roleTitle = contactLines.shift() ?? null;
    }
  }

  return (
    <article
      className={`mx-auto w-full max-w-[640px] overflow-hidden rounded-[3px] border border-slate-300/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_12px_28px_rgba(15,23,42,0.10)] ${className}`}
      aria-label="Hyred ATS resume preview"
    >
      {/* Navy header — ATS-safe single column identity */}
      <header className="relative bg-[#0f172a] px-7 pb-5 pt-4 text-white sm:px-9 sm:pb-6 sm:pt-5">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-400" aria-hidden="true" />
        {doc.name ? (
          <h1 className="text-[clamp(1.15rem,2.4vw,1.45rem)] font-bold uppercase tracking-[0.06em] text-white">
            <HighlightMark active={lineIsHighlighted(doc.name, hl)} kind={kind}>
              {doc.name.text}
            </HighlightMark>
          </h1>
        ) : (
          <h1 className="text-lg font-bold uppercase tracking-wide text-slate-300">Your name</h1>
        )}
        {roleTitle && (
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400 sm:text-[11px]">
            <HighlightMark active={lineIsHighlighted(roleTitle, hl)} kind={kind}>
              {roleTitle.text}
            </HighlightMark>
          </p>
        )}
        {contactLines.length > 0 && (
          <p className="mt-2.5 text-[10px] leading-relaxed text-slate-300 sm:text-[11px]">
            {contactLines.map((c, i) => (
              <span key={c.start}>
                {i > 0 && <span className="mx-1.5 text-slate-500">|</span>}
                <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                  {c.text.replace(
                    /^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address)\s*:\s*/i,
                    '',
                  )}
                </HighlightMark>
              </span>
            ))}
          </p>
        )}
        {!contactLines.length && (
          <p className="mt-2.5 text-[10px] text-slate-400">Add email · phone · LinkedIn</p>
        )}
      </header>

      {/* Body — single column, ATS-friendly */}
      <div className="space-y-4 px-7 py-5 sm:space-y-5 sm:px-9 sm:py-6">
        {doc.sections.length === 0 && (
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
            {text.slice(0, 4000)}
          </p>
        )}

        {doc.sections.map((section, si) => (
          <section key={section.heading?.start ?? `sec-${si}`} className="min-w-0">
            {section.heading && (
              <h2 className="mb-2 border-b border-slate-200 pb-1">
                <span className="relative inline-block text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f172a] sm:text-[11px]">
                  <span
                    className="absolute -top-1.5 left-0 h-[2px] w-8 bg-amber-400"
                    aria-hidden="true"
                  />
                  <HighlightMark active={lineIsHighlighted(section.heading, hl)} kind={kind}>
                    {section.heading.text}
                  </HighlightMark>
                </span>
              </h2>
            )}

            <div className="space-y-1.5 text-[12px] leading-[1.55] text-slate-700 sm:text-[12.5px]">
              {section.lines.map((line) => {
                const active = lineIsHighlighted(line, hl);

                if (line.kind === 'entryHeading') {
                  const parts = line.text.split('|').map((p) => p.trim()).filter(Boolean);
                  const title = parts[0] ?? line.text;
                  const mid = parts.slice(1, -1).join(' · ');
                  const dates = parts.length > 1 ? parts[parts.length - 1] : null;
                  const hasDateInTitle = /\b(19|20)\d{2}\b/.test(title) && parts.length === 1;

                  return (
                    <div
                      key={line.start}
                      className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 first:mt-0"
                    >
                      <p className="min-w-0 font-semibold text-[#0f172a]">
                        <HighlightMark active={active} kind={kind}>
                          {title}
                          {mid ? <span className="font-medium text-slate-600"> · {mid}</span> : null}
                        </HighlightMark>
                      </p>
                      {dates && !hasDateInTitle && (
                        <p className="shrink-0 text-[11px] italic text-slate-500">{dates}</p>
                      )}
                    </div>
                  );
                }

                if (line.kind === 'bullet') {
                  return (
                    <div key={line.start} className="flex gap-2 pl-0.5">
                      <span className="mt-[0.55em] select-none font-semibold text-slate-400" aria-hidden="true">
                        –
                      </span>
                      <p className="min-w-0 flex-1 text-slate-700">
                        <HighlightMark active={active} kind={kind}>
                          {line.content}
                        </HighlightMark>
                      </p>
                    </div>
                  );
                }

                if (line.kind === 'skill') {
                  return (
                    <p key={line.start} className="text-slate-700">
                      <HighlightMark active={active} kind={kind}>
                        {line.label ? (
                          <>
                            <span className="font-semibold text-[#0f172a]">{line.label}:</span>{' '}
                            <span>{line.value}</span>
                          </>
                        ) : (
                          line.text
                        )}
                      </HighlightMark>
                    </p>
                  );
                }

                return (
                  <p key={line.start} className="text-slate-700">
                    <HighlightMark active={active} kind={kind}>
                      {line.text}
                    </HighlightMark>
                  </p>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-slate-100 px-7 py-2 text-center text-[9px] font-medium tracking-wide text-slate-400 sm:px-9">
        Hyred ATS layout · single column · text bullets
      </footer>
    </article>
  );
}

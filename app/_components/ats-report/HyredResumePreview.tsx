'use client';

import { useMemo } from 'react';
import {
  buildResumeLayoutModel,
  initialsFromName,
  type ResumeLayoutModel,
} from '@/lib/resume-layout-model';
import {
  lineIsHighlighted,
  parseResumeDocument,
  type ResumeLine,
  type ResumeSection,
} from '@/lib/resume-document';
import { resolveResumeTheme, type ResumeTheme } from '@/lib/resume-template-theme';

type Highlight = { start: number; end: number; kind: 'needs' | 'fixed' } | null;

type LayoutRenderProps = {
  model: ResumeLayoutModel;
  theme: ResumeTheme;
  hl: Highlight;
  kind: 'needs' | 'fixed';
  rawText: string;
  photoUrl?: string | null;
};

function mainBodySections(model: ResumeLayoutModel): ResumeSection[] {
  return [...model.experienceSections, ...model.projectSections, ...model.otherSections];
}

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

function stripContactLabel(text: string): string {
  return text.replace(
    /^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address|contact)\s*:\s*/i,
    '',
  );
}

function splitLeftAndDates(text: string): { left: string; dates: string | null } {
  const paren = text.match(/^(.+?)\s*[(\[]\s*([^)\]]*\d{4}[^)\]]*)\s*[)\]]\s*$/);
  if (paren) return { left: paren[1]!.trim(), dates: paren[2]!.trim() };
  const pipeParts = text.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const last = pipeParts[pipeParts.length - 1]!;
    if (/\d{4}/.test(last) || /present|current/i.test(last)) {
      return { left: pipeParts.slice(0, -1).join(' · '), dates: last };
    }
  }
  return { left: text, dates: null };
}

function looksLikeHeaderLine(text: string): boolean {
  return (
    /[|]/.test(text) ||
    /\d{4}\s*[-–]\s*(present|current|\d{4})/i.test(text) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{0,30}\d{4}/i.test(text) ||
    /pvt|ltd|inc|llc|corp|technologies|services/i.test(text)
  );
}

function AvatarInitials({
  name,
  bg,
  color,
  size = 'md',
  photoUrl,
}: {
  name: string;
  bg: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  photoUrl?: string | null;
}) {
  const dim = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-10 w-10 text-xs' : 'h-14 w-14 text-sm';
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${dim}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${dim}`}
      style={{ backgroundColor: bg, color }}
      aria-hidden="true"
    >
      {initialsFromName(name)}
    </div>
  );
}

function SectionLines({
  section,
  hl,
  kind,
  ink,
  stone,
  bullet = '-',
  entryDatesRight = true,
}: {
  section: ResumeSection;
  hl: Highlight;
  kind: 'needs' | 'fixed';
  ink: string;
  stone: string;
  bullet?: string;
  entryDatesRight?: boolean;
}) {
  return (
    <div className="space-y-1 text-[10.5px] leading-[1.45]" style={{ color: ink }}>
      {section.lines.map((line) => {
        const active = lineIsHighlighted(line, hl);
        if (line.kind === 'entryHeading' || (!line.kind.startsWith('bullet') && looksLikeHeaderLine(line.text))) {
          const { left, dates } = splitLeftAndDates(line.text);
          return (
            <div
              key={line.start}
              className={`mt-2 flex gap-x-2 first:mt-0 ${entryDatesRight ? 'flex-wrap items-baseline justify-between' : 'flex-col'}`}
            >
              <p className="min-w-0 font-bold" style={{ color: ink }}>
                <HighlightMark active={active} kind={kind}>
                  {left}
                </HighlightMark>
              </p>
              {dates && (
                <p className="shrink-0 text-[9.5px] font-normal" style={{ color: stone }}>
                  {dates}
                </p>
              )}
            </div>
          );
        }
        if (line.kind === 'bullet') {
          return (
            <div key={line.start} className="flex gap-1.5">
              <span className="shrink-0 select-none" aria-hidden="true">
                {bullet}
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

function SidebarBlock({
  title,
  sections,
  hl,
  kind,
  headingColor,
  ink,
  stone,
}: {
  title: string;
  sections: ResumeSection[];
  hl: Highlight;
  kind: 'needs' | 'fixed';
  headingColor: string;
  ink: string;
  stone: string;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3
        className="text-[9px] font-bold uppercase tracking-[0.08em]"
        style={{ color: headingColor }}
      >
        {title}
      </h3>
      {sections.map((sec, i) => (
        <SectionLines key={sec.heading?.start ?? i} section={sec} hl={hl} kind={kind} ink={ink} stone={stone} bullet="•" />
      ))}
    </div>
  );
}

function PreviewFooter({ themeName }: { themeName: string }) {
  return (
    <footer className="flex items-center justify-end border-t border-slate-100 px-4 py-1.5">
      <span className="text-[8px] font-semibold tracking-wide text-slate-400">
        {themeName} · ATS-safe · <span className="text-primary">Hyred</span>
      </span>
    </footer>
  );
}

function RawFallback({ text, stone }: { text: string; stone: string }) {
  return (
    <div className="px-6 py-4">
      <p className="whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: stone }}>
        {text.slice(0, 4000)}
      </p>
    </div>
  );
}

function TealEngineerLayout({ model, theme, hl, kind, rawText, photoUrl }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';
  const sidebarInk = css.sidebarInk ?? css.ink;

  if (!model.name && model.contactLines.length === 0 && !model.experienceSections.length) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <div className="flex min-h-[480px]">
      <aside
        className="w-[35%] shrink-0 space-y-5 px-4 py-6 sm:px-5"
        style={{ backgroundColor: css.sidebarBg }}
      >
        <AvatarInitials
          name={name}
          bg={css.accent ?? css.section}
          color="#ffffff"
          photoUrl={photoUrl}
        />
        <SidebarBlock
          title="Contact"
          sections={[
            {
              heading: null,
              lines: model.contactLines,
            },
          ]}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={sidebarInk}
          stone={css.stone}
        />
        <SidebarBlock
          title="Education"
          sections={model.educationSections}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={sidebarInk}
          stone={css.stone}
        />
        <SidebarBlock
          title="Skills"
          sections={model.skillsSections}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={sidebarInk}
          stone={css.stone}
        />
        <SidebarBlock
          title="Certifications"
          sections={model.certificationsSections}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={sidebarInk}
          stone={css.stone}
        />
      </aside>
      <main className="min-w-0 flex-1 space-y-4 px-5 py-6 sm:px-7">
        <header>
          <h1 className="text-[clamp(1.1rem,2.2vw,1.35rem)] font-bold" style={{ color: css.name }}>
            {model.name ? (
              <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
                {name}
              </HighlightMark>
            ) : (
              name
            )}
          </h1>
          {model.title && (
            <p className="mt-0.5 text-[11px] font-medium" style={{ color: css.title }}>
              <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
                {model.title.text}
              </HighlightMark>
            </p>
          )}
        </header>
        {model.summaryText && (
          <section>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
              {model.summaryText.heading?.text ?? 'Professional Summary'}
            </h2>
            <SectionLines section={model.summaryText} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
          </section>
        )}
        {mainBodySections(model)
          .filter((s) => !SUMMARY_LIKE(s))
          .map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              {sec.heading && (
                <h2
                  className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: css.section }}
                >
                  <HighlightMark active={lineIsHighlighted(sec.heading, hl)} kind={kind}>
                    {sec.heading.text}
                  </HighlightMark>
                </h2>
              )}
              <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
            </section>
          ))}
      </main>
    </div>
  );
}

function SUMMARY_LIKE(sec: ResumeSection): boolean {
  return /summary|objective|profile/i.test(sec.heading?.text ?? '');
}

function NavyGoldLayout({ model, theme, hl, kind, rawText }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';

  if (!model.name && model.contactLines.length === 0) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <>
      <header className="relative px-6 py-5 sm:px-8" style={{ backgroundColor: css.bandBg }}>
        {css.bandAccent && (
          <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: css.bandAccent }} />
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-[clamp(1.1rem,2.2vw,1.35rem)] font-bold uppercase tracking-wide"
              style={{ color: css.bandName }}
            >
              {model.name ? (
                <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
                  {name}
                </HighlightMark>
              ) : (
                name
              )}
            </h1>
            {model.title && (
              <p
                className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: css.bandTitle }}
              >
                <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
                  {model.title.text}
                </HighlightMark>
              </p>
            )}
          </div>
          {model.contactLines.length > 0 && (
            <p className="max-w-[14rem] text-right text-[9.5px] leading-relaxed" style={{ color: css.bandContact }}>
              {model.contactLines.map((c, i) => (
                <span key={c.start}>
                  {i > 0 && <br />}
                  <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                    {stripContactLabel(c.text)}
                  </HighlightMark>
                </span>
              ))}
            </p>
          )}
        </div>
      </header>
      <div className="flex">
        <main className="min-w-0 flex-1 space-y-4 px-5 py-5 sm:px-7">
          {model.summaryText && (
            <section>
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                {model.summaryText.heading?.text ?? 'Summary'}
              </h2>
              <SectionLines section={model.summaryText} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
            </section>
          )}
          {mainBodySections(model).map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              {sec.heading && (
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                  {sec.heading.text}
                </h2>
              )}
              <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
            </section>
          ))}
          {model.educationSections.map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              {sec.heading && (
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                  {sec.heading.text}
                </h2>
              )}
              <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
            </section>
          ))}
        </main>
        <aside
          className="w-[32%] shrink-0 space-y-4 px-4 py-5"
          style={{ backgroundColor: css.sidebarBg }}
        >
          {model.skillsSections.map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: css.section }}>
                {sec.heading?.text ?? 'Skills'}
              </h3>
              <div className="space-y-1.5">
                {sec.lines.map((line, li) => {
                  const label = line.kind === 'skill' && line.label ? line.label : line.text.split(':')[0]?.trim();
                  const pct = 55 + ((li * 17) % 40);
                  return (
                    <div key={line.start}>
                      <p className="text-[9px] font-medium" style={{ color: css.sidebarInk ?? css.ink }}>
                        {label}
                      </p>
                      <div className="mt-0.5 h-1.5 w-full rounded-full bg-white/70">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: css.accent ?? css.section }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <SidebarBlock
            title="Certifications"
            sections={model.certificationsSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.sidebarInk ?? css.ink}
            stone={css.stone}
          />
          <SidebarBlock
            title="Languages"
            sections={model.languagesSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.sidebarInk ?? css.ink}
            stone={css.stone}
          />
        </aside>
      </div>
    </>
  );
}

function ModernSummaryLayout({ model, theme, hl, kind, rawText, photoUrl }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';

  if (!model.name && model.contactLines.length === 0) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <>
      <header className="px-6 pt-6 sm:px-8">
        <h1 className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-bold" style={{ color: css.name }}>
          {model.name ? (
            <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
              {name}
            </HighlightMark>
          ) : (
            name
          )}
        </h1>
        {model.title && (
          <p className="mt-0.5 text-[11px]" style={{ color: css.title }}>
            <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
              {model.title.text}
            </HighlightMark>
          </p>
        )}
      </header>
      {model.summaryText && (
        <div
          className="mx-6 mt-4 flex gap-4 px-4 py-3 sm:mx-8"
          style={{ backgroundColor: css.summaryBand }}
        >
          <AvatarInitials name={name} bg={css.section} color="#ffffff" size="sm" photoUrl={photoUrl} />
          <div className="min-w-0 flex-1">
            <SectionLines section={model.summaryText} hl={hl} kind={kind} ink={css.ink} stone={css.stone} bullet="•" />
          </div>
        </div>
      )}
      <div className="mt-4 flex">
        <aside
          className="w-[34%] shrink-0 space-y-4 px-4 py-4 sm:px-5"
          style={{ backgroundColor: css.sidebarBg }}
        >
          <SidebarBlock
            title="Contact"
            sections={[{ heading: null, lines: model.contactLines }]}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.ink}
            stone={css.stone}
          />
          <SidebarBlock
            title="Education"
            sections={model.educationSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.ink}
            stone={css.stone}
          />
          <SidebarBlock
            title="Skills"
            sections={model.skillsSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.ink}
            stone={css.stone}
          />
          <SidebarBlock
            title="Languages"
            sections={model.languagesSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.ink}
            stone={css.stone}
          />
        </aside>
        <main className="min-w-0 flex-1 space-y-4 px-5 py-4 sm:px-6">
          {model.experienceSections.map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              {sec.heading && (
                <h2
                  className="mb-3 text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: css.section }}
                >
                  {sec.heading.text}
                </h2>
              )}
              <div className="relative space-y-3 border-l-2 pl-4" style={{ borderColor: `${css.section}55` }}>
                {sec.lines.map((line) => {
                  const active = lineIsHighlighted(line, hl);
                  const isEntry =
                    line.kind === 'entryHeading' ||
                    (!line.kind.startsWith('bullet') && looksLikeHeaderLine(line.text));
                  return (
                    <div key={line.start} className="relative">
                      {isEntry && (
                        <span
                          className="absolute -left-[calc(1rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full border-2 bg-white"
                          style={{ borderColor: css.section }}
                          aria-hidden="true"
                        />
                      )}
                      {isEntry ? (
                        <SectionLines
                          section={{ heading: null, lines: [line] }}
                          hl={hl}
                          kind={kind}
                          ink={css.ink}
                          stone={css.stone}
                        />
                      ) : line.kind === 'bullet' ? (
                        <div className="flex gap-1.5 text-[10.5px]" style={{ color: css.ink }}>
                          <span>-</span>
                          <HighlightMark active={active} kind={kind}>
                            {line.content}
                          </HighlightMark>
                        </div>
                      ) : (
                        <p className="text-[10.5px]" style={{ color: css.ink }}>
                          <HighlightMark active={active} kind={kind}>
                            {line.text}
                          </HighlightMark>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {[...model.projectSections, ...model.otherSections].map((sec, i) => (
            <section key={sec.heading?.start ?? i}>
              {sec.heading && (
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                  {sec.heading.text}
                </h2>
              )}
              <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
            </section>
          ))}
        </main>
      </div>
    </>
  );
}

function NursingCleanLayout({ model, theme, hl, kind, rawText }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';
  const allSections = [
    model.summaryText,
    ...model.experienceSections,
    ...model.projectSections,
    ...model.educationSections,
    ...model.skillsSections,
    ...model.certificationsSections,
    ...model.languagesSections,
    ...model.otherSections,
  ].filter(Boolean) as ResumeSection[];

  if (!model.name && allSections.length === 0) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <div className="px-7 py-6 text-center sm:px-9">
      <header className="mb-5">
        <h1 className="text-[clamp(1.15rem,2.3vw,1.4rem)] font-bold" style={{ color: css.name }}>
          {model.name ? (
            <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
              {name}
            </HighlightMark>
          ) : (
            name
          )}
        </h1>
        {model.title && (
          <p className="mt-1 text-[11px] font-medium" style={{ color: css.title }}>
            <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
              {model.title.text}
            </HighlightMark>
          </p>
        )}
        {model.contactLines.length > 0 && (
          <p className="mt-2 text-[10px] leading-relaxed" style={{ color: css.contact }}>
            {model.contactLines.map((c, i) => (
              <span key={c.start}>
                {i > 0 && ' · '}
                <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                  {stripContactLabel(c.text)}
                </HighlightMark>
              </span>
            ))}
          </p>
        )}
      </header>
      <div className="space-y-5 text-left">
        {allSections.map((sec, si) => (
          <section key={sec.heading?.start ?? si}>
            {sec.heading && (
              <h2 className="mb-2 text-center">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: css.section }}
                >
                  <HighlightMark active={lineIsHighlighted(sec.heading, hl)} kind={kind}>
                    {sec.heading.text}
                  </HighlightMark>
                </span>
                <span className="mx-auto mt-1 block h-[1.5px] w-16" style={{ backgroundColor: css.section }} />
              </h2>
            )}
            <div className="[&_.flex-wrap]:justify-end">
              <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} entryDatesRight />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BlueBorderLayout({ model, theme, hl, kind, rawText, photoUrl }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';
  const allSections = [
    model.summaryText,
    ...model.experienceSections,
    ...model.projectSections,
    ...model.educationSections,
    ...model.certificationsSections,
    ...model.languagesSections,
    ...model.otherSections,
  ].filter(Boolean) as ResumeSection[];

  if (!model.name && allSections.length === 0) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <div className="m-3 space-y-4 px-5 py-5 sm:m-4 sm:px-6" style={{ border: `2px solid ${css.border ?? css.section}` }}>
      <div className="flex items-center gap-4">
        <AvatarInitials name={name} bg={css.section} color="#ffffff" photoUrl={photoUrl} />
        <div>
          <h1 className="text-[clamp(1.1rem,2.2vw,1.3rem)] font-bold" style={{ color: css.name }}>
            {model.name ? (
              <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
                {name}
              </HighlightMark>
            ) : (
              name
            )}
          </h1>
          {model.title && (
            <p className="text-[10.5px]" style={{ color: css.title }}>
              <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
                {model.title.text}
              </HighlightMark>
            </p>
          )}
        </div>
      </div>
      {model.contactLines.length > 0 && (
        <div
          className="-mx-1 flex flex-wrap justify-center gap-x-4 gap-y-1 px-3 py-2 text-[9.5px]"
          style={{ backgroundColor: css.bandBg ?? css.section, color: css.contact }}
        >
          {model.contactLines.map((c, i) => (
            <span key={c.start}>
              {i > 0 && <span className="mr-4 opacity-60">|</span>}
              <HighlightMark active={lineIsHighlighted(c, hl)} kind={kind}>
                {stripContactLabel(c.text)}
              </HighlightMark>
            </span>
          ))}
        </div>
      )}
      {allSections.map((sec, si) => (
        <section key={sec.heading?.start ?? si}>
          {sec.heading && (
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
              {sec.heading.text}
            </h2>
          )}
          <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
        </section>
      ))}
      {model.skillsSections.map((sec, i) => (
        <section key={sec.heading?.start ?? i}>
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
            {sec.heading?.text ?? 'Skills'}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {sec.lines.flatMap((line) => {
              const items =
                line.kind === 'skill' && line.value
                  ? line.value.split(/[,;|·]/).map((s) => s.trim()).filter(Boolean)
                  : [line.text.replace(/^[^:]+:\s*/, '').trim() || line.text];
              return items.map((item, ii) => (
                <span
                  key={`${line.start}-${ii}`}
                  className="rounded-full px-2.5 py-0.5 text-[9px] font-medium"
                  style={{ backgroundColor: css.pillBg, color: css.pillText }}
                >
                  {item}
                </span>
              ));
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function PeachExecutiveLayout({ model, theme, hl, kind, rawText, photoUrl }: LayoutRenderProps) {
  const css = theme.css;
  const name = model.name?.text ?? 'Your Name';

  if (!model.name && model.contactLines.length === 0) {
    return <RawFallback text={rawText} stone={css.stone} />;
  }

  return (
    <div className="flex min-h-[480px]">
      <aside
        className="w-[34%] shrink-0 space-y-5 px-4 py-6 sm:px-5"
        style={{ backgroundColor: css.sidebarBg }}
      >
        <AvatarInitials name={name} bg={css.accent ?? css.section} color="#ffffff" photoUrl={photoUrl} />
        <SidebarBlock
          title="Contact"
          sections={[{ heading: null, lines: model.contactLines }]}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={css.sidebarInk ?? css.ink}
          stone={css.stone}
        />
        <SidebarBlock
          title="Education"
          sections={model.educationSections}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={css.sidebarInk ?? css.ink}
          stone={css.stone}
        />
        <SidebarBlock
          title="Skills"
          sections={model.skillsSections}
          hl={hl}
          kind={kind}
          headingColor={css.section}
          ink={css.sidebarInk ?? css.ink}
          stone={css.stone}
        />
      </aside>
      <main className="min-w-0 flex-1 space-y-4 px-5 py-6 sm:px-7">
        <header>
          <h1
            className="text-[clamp(1.2rem,2.4vw,1.45rem)] font-bold"
            style={{ color: css.name, fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {model.name ? (
              <HighlightMark active={lineIsHighlighted(model.name, hl)} kind={kind}>
                {name}
              </HighlightMark>
            ) : (
              name
            )}
          </h1>
          {model.title && (
            <p className="mt-1 text-[11px]" style={{ color: css.title }}>
              <HighlightMark active={lineIsHighlighted(model.title, hl)} kind={kind}>
                {model.title.text}
              </HighlightMark>
            </p>
          )}
        </header>
        {model.summaryText && (
          <section>
            <SectionLines section={model.summaryText} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
          </section>
        )}
        {mainBodySections(model).map((sec, i) => (
          <section key={sec.heading?.start ?? i}>
            {sec.heading && (
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                {sec.heading.text}
              </h2>
            )}
            <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} />
          </section>
        ))}
        {model.certificationsSections.map((sec, i) => (
          <section key={sec.heading?.start ?? i}>
            {sec.heading && (
              <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: css.section }}>
                {sec.heading.text}
              </h2>
            )}
            <SectionLines section={sec} hl={hl} kind={kind} ink={css.ink} stone={css.stone} bullet="•" />
          </section>
        ))}
        {model.languagesSections.length > 0 && (
          <SidebarBlock
            title="Languages"
            sections={model.languagesSections}
            hl={hl}
            kind={kind}
            headingColor={css.section}
            ink={css.ink}
            stone={css.stone}
          />
        )}
      </main>
    </div>
  );
}

function renderLayout(props: LayoutRenderProps) {
  switch (props.theme.layout) {
    case 'teal-sidebar':
      return <TealEngineerLayout {...props} />;
    case 'navy-gold':
      return <NavyGoldLayout {...props} />;
    case 'modern-summary':
      return <ModernSummaryLayout {...props} />;
    case 'nursing-clean':
      return <NursingCleanLayout {...props} />;
    case 'blue-border':
      return <BlueBorderLayout {...props} />;
    case 'peach-sidebar':
      return <PeachExecutiveLayout {...props} />;
    default:
      return <NursingCleanLayout {...props} />;
  }
}

/**
 * On-screen preview — six distinct structural layouts (Hyred-original).
 */
export function HyredResumePreview({
  text,
  highlight = null,
  showHighlights = true,
  className = '',
  templateId,
  photoUrl = null,
}: {
  text: string;
  highlight?: Highlight;
  showHighlights?: boolean;
  className?: string;
  templateId?: string | null;
  /** Profile photo from the user's original resume (data URL). */
  photoUrl?: string | null;
}) {
  const doc = useMemo(() => parseResumeDocument(text), [text]);
  const model = useMemo(() => buildResumeLayoutModel(doc), [doc]);
  const theme = useMemo(() => resolveResumeTheme(templateId), [templateId]);
  const hl = showHighlights ? highlight : null;
  const kind = highlight?.kind ?? 'fixed';

  return (
    <article
      className={`relative mx-auto w-full max-w-[720px] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_32px_rgba(15,23,42,0.08)] ${className}`}
      aria-label={`${theme.name} resume preview`}
    >
      {renderLayout({ model, theme, hl, kind, rawText: text, photoUrl })}
      <PreviewFooter themeName={theme.name} />
    </article>
  );
}

import { describe, expect, it } from 'vitest';
import { lineIsHighlighted, parseResumeDocument } from '@/lib/resume-document';
import { ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';

describe('parseResumeDocument', () => {
  it('parses an all-caps name header and sections', () => {
    const doc = parseResumeDocument(ATS_SAMPLE_RESUME);
    expect(doc.name?.text).toBe('PRIYA SHARMA');
    expect(doc.contact.length).toBeGreaterThan(0);
    const headings = doc.sections.map((s) => s.heading?.text);
    expect(headings).toContain('TECHNICAL SKILLS');
    expect(headings).toContain('PROFESSIONAL EXPERIENCE');
  });

  it('detects skill lines, entry headings, and bullets', () => {
    const doc = parseResumeDocument(ATS_SAMPLE_RESUME);
    const skills = doc.sections.find((s) => s.heading?.text === 'TECHNICAL SKILLS');
    expect(skills?.lines.every((l) => l.kind === 'skill')).toBe(true);
    const exp = doc.sections.find((s) => s.heading?.text === 'PROFESSIONAL EXPERIENCE');
    expect(exp?.lines.some((l) => l.kind === 'entryHeading')).toBe(true);
    expect(exp?.lines.some((l) => l.kind === 'bullet')).toBe(true);
  });

  it('handles a "RESUME" title and labelled Name/Email/Phone fields', () => {
    const doc = parseResumeDocument(
      'RESUME\n\nName: AjithKumar.R\nEmail: a@b.com\nPh. No: 123\n\nCAREER OBJECTIVE:\nGrow professionally.',
    );
    expect(doc.name?.text).toBe('AjithKumar.R');
    expect(doc.contact.map((c) => c.text)).toContain('Email: a@b.com');
    // "RESUME" must not become a section.
    expect(doc.sections.map((s) => s.heading?.text)).not.toContain('RESUME');
    expect(doc.sections.map((s) => s.heading?.text)).toContain('CAREER OBJECTIVE:');
  });

  it('preserves character offsets for highlight intersection', () => {
    const doc = parseResumeDocument(ATS_SAMPLE_RESUME);
    const firstBullet = doc.sections
      .flatMap((s) => s.lines)
      .find((l) => l.kind === 'bullet');
    expect(firstBullet).toBeDefined();
    expect(
      lineIsHighlighted(firstBullet!, { start: firstBullet!.start + 1, end: firstBullet!.end - 1 }),
    ).toBe(true);
    expect(lineIsHighlighted(firstBullet!, { start: 0, end: 1 })).toBe(false);
  });
});

/**
 * Lightweight resume-text → structured document parser so the Fix Studio
 * preview can render like a real resume instead of a raw text dump.
 *
 * Every line keeps its [start, end) character offsets into the ORIGINAL text
 * so the caller can still highlight an applied/suggested edit by range.
 */

export type ResumeLineKind =
  | 'name'
  | 'contact'
  | 'sectionHeading'
  | 'entryHeading'
  | 'bullet'
  | 'skill'
  | 'text';

export interface ResumeLine {
  text: string;
  /** Bullet body without the leading marker (for kind === 'bullet'). */
  content: string;
  kind: ResumeLineKind;
  start: number;
  end: number;
  /** For skill lines: the "Label:" portion, if any. */
  label?: string;
  value?: string;
}

export interface ResumeSection {
  heading: ResumeLine | null;
  lines: ResumeLine[];
}

export interface ResumeDocument {
  name: ResumeLine | null;
  contact: ResumeLine[];
  sections: ResumeSection[];
}

const KNOWN_HEADINGS =
  /^(professional\s+summary|summary|objective|career\s+objective|profile|professional\s+profile|technical\s+skills|skills|core\s+competencies|professional\s+experience|work\s+experience|experience|employment(\s+history)?|work\s+history|education|projects?|certifications?|awards?|achievements?|publications?|languages?|interests?|volunteer(\s+experience)?|summary\s+of\s+qualifications)\s*:?\s*$/i;

const BULLET_MARKER = /^\s*([-*•·–▪◦‣])\s+/;

/** Junk document titles that should not start a section or become the name. */
const TITLE_LINE = /^(resume|curriculum\s+vitae|c\.?v\.?|bio\s*-?\s*data)\s*:?\s*$/i;

/** Header field labels like "Name:", "Email:", "Ph. No:". */
const NAME_FIELD = /^(name|candidate\s+name)\s*:\s*(.+)$/i;
const CONTACT_FIELD =
  /^(e-?mail|email|phone|mobile|ph\.?\s*no\.?|contact(\s*no\.?)?|location|current\s+location|address|linkedin|github|portfolio|website)\s*:\s*(.+)$/i;

function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;
  if (BULLET_MARKER.test(line)) return false;
  if (KNOWN_HEADINGS.test(trimmed)) return true;
  // ALL-CAPS short line (allow spaces, &, /) with no sentence punctuation.
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (
    letters.length >= 3 &&
    trimmed === trimmed.toUpperCase() &&
    !/[.]/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 5
  ) {
    return true;
  }
  return false;
}

function looksLikeContact(line: string): boolean {
  return /(@|\+?\d[\d\s()-]{6,}|linkedin\.com|github\.com|https?:\/\/|\b[A-Za-z]+,\s*[A-Za-z]{2,})/i.test(
    line,
  );
}

function isEntryHeading(line: string, inExperienceLike: boolean): boolean {
  if (!inExperienceLike) return false;
  const trimmed = line.trim();
  if (!trimmed || BULLET_MARKER.test(line)) return false;
  // "Title | Company | Dates" or a line containing a date range.
  if (trimmed.includes('|')) return true;
  if (/\b(19|20)\d{2}\b/.test(trimmed) && trimmed.length <= 90) return true;
  return false;
}

const SKILL_LABEL = /^([A-Za-z][A-Za-z &/+]{1,28}):\s*(.+)$/;

/** Parse plain resume text into a renderable document, preserving offsets. */
export function parseResumeDocument(text: string): ResumeDocument {
  const doc: ResumeDocument = { name: null, contact: [], sections: [] };
  let offset = 0;
  let sawHeading = false;
  let current: ResumeSection | null = null;
  const experienceLikeHeading = /(experience|employment|work\s+history|projects?)/i;
  let inExperienceLike = false;

  const rawLines = text.split('\n');

  rawLines.forEach((raw, idx) => {
    const start = offset;
    const end = offset + raw.length;
    offset = end + 1; // +1 for the '\n' we split on

    const trimmed = raw.trim();
    if (!trimmed) return; // skip blank lines (spacing handled by layout)

    // Ignore a standalone "RESUME" / "CV" document title anywhere near the top.
    if (!sawHeading && TITLE_LINE.test(trimmed)) return;

    // In the header zone an all-caps NAME must not be mistaken for a section;
    // only a known heading (SUMMARY, EXPERIENCE, …) ends the header.
    const headingHere = sawHeading
      ? isSectionHeading(raw)
      : KNOWN_HEADINGS.test(trimmed);

    if (headingHere) {
      sawHeading = true;
      inExperienceLike = experienceLikeHeading.test(trimmed);
      current = {
        heading: { text: trimmed, content: trimmed, kind: 'sectionHeading', start, end },
        lines: [],
      };
      doc.sections.push(current);
      return;
    }

    if (!sawHeading) {
      // Header: "Name: X" label wins; labelled/inferred contact lines follow.
      const nameField = trimmed.match(NAME_FIELD);
      if (nameField && !doc.name) {
        doc.name = { text: nameField[2].trim(), content: nameField[2].trim(), kind: 'name', start, end };
      } else if (CONTACT_FIELD.test(trimmed) || looksLikeContact(raw) || doc.name) {
        doc.contact.push({ text: trimmed, content: trimmed, kind: 'contact', start, end });
      } else {
        doc.name = { text: trimmed, content: trimmed, kind: 'name', start, end };
      }
      return;
    }

    // Body lines belong to the current section.
    const bulletMatch = raw.match(BULLET_MARKER);
    let line: ResumeLine;
    if (bulletMatch) {
      line = {
        text: trimmed,
        content: trimmed.replace(BULLET_MARKER, '').trim(),
        kind: 'bullet',
        start,
        end,
      };
    } else if (isEntryHeading(raw, inExperienceLike)) {
      line = { text: trimmed, content: trimmed, kind: 'entryHeading', start, end };
    } else {
      const skill = trimmed.match(SKILL_LABEL);
      if (skill) {
        line = {
          text: trimmed,
          content: trimmed,
          kind: 'skill',
          start,
          end,
          label: skill[1].trim(),
          value: skill[2].trim(),
        };
      } else {
        line = { text: trimmed, content: trimmed, kind: 'text', start, end };
      }
    }

    if (!current) {
      // Body text before any heading (rare) — treat as a headless section.
      current = { heading: null, lines: [] };
      doc.sections.push(current);
    }
    current.lines.push(line);
  });

  return doc;
}

/** True if a line's character range intersects the highlight range. */
export function lineIsHighlighted(
  line: { start: number; end: number },
  highlight: { start: number; end: number } | null,
): boolean {
  if (!highlight) return false;
  return highlight.start < line.end && highlight.end > line.start;
}

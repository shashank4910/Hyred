/**
 * PDF Resume Generator — dispatches to per-layout renderers (lib/pdf-resume-layouts.ts)
 * that visually match the six on-screen Hyred resume themes.
 *
 * This file also keeps `parseResumePlainText`, a plain-text header parser used
 * by the extension's structured-profile pipeline and unit tests, independent
 * of the PDF drawing code.
 */

import { jsPDF } from 'jspdf';
import { renderResumePdfByLayout } from './pdf-resume-layouts';
import { sanitizeResumePlainText } from './resume-plain-text';
import { resolveResumeTheme } from './resume-template-theme';

// Labels that some LLM outputs prepend to the resume before the candidate's
// name. These get skipped during parsing so the navy band shows the actual
// name (not the literal word "Resume" rendered as if it were a name).
const HEADER_LABELS_TO_SKIP = /^(resume|curriculum\s+vitae|cv|profile|c\.?v\.?)$/i;

/** Real section headers — never treat as the line-2 title tagline. */
const KNOWN_BODY_SECTION =
  /^(PROFESSIONAL SUMMARY|KEY ACHIEVEMENTS|CORE COMPETENCIES|TECHNICAL SKILLS|CERTIFICATIONS|PROFESSIONAL EXPERIENCE|EDUCATION|WORK EXPERIENCE|WORK HISTORY|EXPERIENCE|EMPLOYMENT)$/;

// ─── Plain-text parser ────────────────────────────────────────────────────────

interface Section { title: string; lines: string[] }
interface ParsedResume {
  name: string;
  title: string | null;       // line right after name, if it's not contact info
  contactLines: string[];     // remaining pre-section lines (email/phone/etc.)
  sections: Section[];
}

const ROLE_TITLE_WORD_RE =
  /\b(engineer|engineering|tester|testing|developer|development|analyst|architect|consultant|specialist|sdet|sre|administrator|coordinator|lead|manager|designer|technician|scientist|programmer)\b/i;

/**
 * Heuristic: does this line look like an email / phone / URL / city,country?
 * Used to decide whether the second line is a title tagline or contact info.
 *
 * IMPORTANT: keep strict — false positives dump the job title into the gray
 * contact row instead of the amber tagline. iOS PDF viewers often render that
 * gray-on-navy row as invisible, while desktop Adobe/Chrome show it (looks "fine"
 * on desktop, "missing title" on iPhone/iPad).
 */
function looksLikeContactLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.includes('@')) return true;
  if (/^\+?\d[\d\s().-]{6,}/.test(t)) return true;
  if (/https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (/linkedin\.com|github\.com/i.test(t)) return true;
  // "City, Country" — NOT "Senior Performance Engineer, CX" (role word before comma).
  const commaMatch = t.match(/^([A-Za-z .'-]{3,30}),\s*([A-Za-z .'-]{2,30})$/);
  if (commaMatch && !ROLE_TITLE_WORD_RE.test(commaMatch[1]) && commaMatch[1].length <= 24) {
    return true;
  }
  return false;
}

function looksLikeJobTitleLine(s: string): boolean {
  const t = s.split('|')[0].trim();
  if (t.length < 3 || t.length > 80) return false;
  if (looksLikeContactLine(t)) return false;
  if (KNOWN_BODY_SECTION.test(t)) return false;
  return ROLE_TITLE_WORD_RE.test(t);
}

function parse(text: string): ParsedResume {
  const raw = text.split('\n');
  let name = '';
  let title: string | null = null;
  const contactLines: string[] = [];
  const sections: Section[] = [];
  let cur: Section | null = null;
  let inHeader = true;

  for (const rawLine of raw) {
    const trimmed = rawLine.trim();

    if (inHeader) {
      if (!trimmed) continue;

      // Skip any "Resume" / "CV" style label that some LLM outputs prepend.
      // Without this skip the literal word "Resume" gets treated as the
      // candidate's name and renders huge in the navy band.
      if (!name && HEADER_LABELS_TO_SKIP.test(trimmed)) continue;

      // The FIRST eligible line is ALWAYS the candidate's name — capture it
      // BEFORE the section-header test. An ALL-CAPS name like "SHASHANK SINGH"
      // matches the ALL-CAPS section pattern, so without this the name is
      // misread as a section header: the navy band renders empty and the
      // contact lines get dumped as body bullets below it.
      if (!name) {
        name = trimmed;
        continue;
      }

      // Line 2 is the role title tagline — capture BEFORE isSectionHeader().
      // ALL CAPS titles like "SENIOR PERFORMANCE ENGINEER" match the section
      // pattern (same bug class as all-caps names in PR #73). Without this,
      // parsed.title stays null and the navy PDF band renders with no amber
      // tagline even though the plain-text resume has a title on line 2.
      if (title === null && !looksLikeContactLine(trimmed) && !KNOWN_BODY_SECTION.test(trimmed)) {
        title = trimmed;
        continue;
      }

      if (isSectionHeader(trimmed)) {
        // No more header lines - we've reached the first section.
        inHeader = false;
        cur = { title: trimmed, lines: [] };
        sections.push(cur);
        continue;
      }
      contactLines.push(trimmed);
      continue;
    }

    if (isSectionHeader(trimmed)) {
      cur = { title: trimmed, lines: [] };
      sections.push(cur);
      continue;
    }

    if (cur && trimmed) cur.lines.push(trimmed);
  }

  return { name, title, contactLines, sections };
}

/** Recover title when it was mis-filed as a contact line (comma/heuristic false +). */
function finalizeParsedHeader(parsed: ParsedResume): ParsedResume {
  let { title, contactLines } = parsed;
  if (!title && contactLines.length > 0 && looksLikeJobTitleLine(contactLines[0])) {
    title = contactLines[0].split('|')[0].trim();
    contactLines = contactLines.slice(1);
  }
  return { ...parsed, title, contactLines };
}

/** Exposed for deterministic header-parse verification. */
export function parseResumePlainText(text: string): ParsedResume {
  return finalizeParsedHeader(parse(sanitizeResumePlainText(text)));
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  // ALL CAPS letters / spaces / & / / / -. No digits.
  return /^[A-Z][A-Z\s&/-]+$/.test(t);
}

// ─── PDF builder ──────────────────────────────────────────────────────────────
// Structural rendering per template layout lives in lib/pdf-resume-layouts.ts.

/** Generate a themed, ATS-safe resume PDF matching the on-screen preview layout. */
export function generateBeautifulPdf(
  resumeText: string,
  templateId?: string | null,
  options?: { photoDataUrl?: string | null },
): jsPDF {
  const theme = resolveResumeTheme(templateId);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  renderResumePdfByLayout(doc, resumeText, theme, options);
  return doc;
}

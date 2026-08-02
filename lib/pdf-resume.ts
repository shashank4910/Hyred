/**
 * PDF Resume Generator — ATS-safe + Executive Clean aesthetic (2026).
 *
 * Research-backed rules (single column, Helvetica, real "- " bullets, contact
 * in document body, one accent color). Visual polish without two-column /
 * tables / icons that break Workday/Greenhouse/Lever parsers.
 *
 * Layout ("Executive Clean"):
 *   - White page, generous margins
 *   - Name in large navy (not a heavy dark band)
 *   - Role title in slate; contact as one " | " line
 *   - Thin navy rule under the header
 *   - Section titles in navy + underline
 *   - Job titles bold; dates right-aligned when detectable
 *   - Comfortable line-height and section spacing
 */

import { jsPDF } from 'jspdf';
import { sanitizeResumePlainText } from './resume-plain-text';
import { resolveResumeTheme, type ResumeTheme } from './resume-template-theme';

// ─── Design tokens (filled per template at render time) ───────────────────────

type RGB = [number, number, number];

type ActiveTheme = {
  name: RGB;
  title: RGB;
  contact: RGB;
  section: RGB;
  ink: RGB;
  stone: RGB;
  white: RGB;
  bandBg?: RGB;
  bandName?: RGB;
  bandTitle?: RGB;
  bandContact?: RGB;
  bandAccent?: RGB;
  headerStyle: 'light' | 'band';
};

let C: ActiveTheme = {
  name: [27, 58, 92],
  title: [100, 116, 139],
  contact: [100, 116, 139],
  section: [27, 58, 92],
  ink: [30, 41, 59],
  stone: [100, 116, 139],
  white: [255, 255, 255],
  headerStyle: 'light',
};

function applyTheme(theme: ResumeTheme): void {
  C = {
    ...theme.pdf,
    white: [255, 255, 255],
    headerStyle: theme.headerStyle,
  };
}

const L = {
  pageW:    595.28, // A4 pt
  pageH:    841.89,
  mL:       48,
  mR:       48,
  mTop:     40,
  mBottom:  48,
  lineH:    12.8,
  bulletIndent: 12,
  sectionGap: 16,
};

const contentW = L.pageW - L.mL - L.mR;

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

const TEXT_OPTS = { align: 'left' as const };

function cleanContactDisplay(line: string): string {
  return line
    .replace(/^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address|contact)\s*:\s*/i, '')
    .trim();
}

function renderLightHeader(doc: jsPDF, parsed: ParsedResume): number {
  let y = L.mTop;

  if (parsed.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...C.name);
    const nameLines = doc.splitTextToSize(parsed.name.toUpperCase(), contentW);
    for (const nl of nameLines) {
      doc.text(nl, L.mL, y, TEXT_OPTS);
      y += 22;
    }
  }

  if (parsed.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.title);
    const titleLines = doc.splitTextToSize(parsed.title, contentW);
    for (const tl of titleLines) {
      doc.text(tl, L.mL, y, TEXT_OPTS);
      y += 13;
    }
    y += 2;
  }

  if (parsed.contactLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.contact);
    const joined = parsed.contactLines.map(cleanContactDisplay).filter(Boolean).join('  |  ');
    const wrapped = doc.splitTextToSize(joined, contentW);
    for (const wl of wrapped) {
      doc.text(wl, L.mL, y, TEXT_OPTS);
      y += 11;
    }
  }

  y += 10;
  doc.setFillColor(...C.section);
  doc.rect(L.mL, y, contentW, 1.5, 'F');
  return y + 18;
}

function renderBandHeader(doc: jsPDF, parsed: ParsedResume): number {
  const bandBg = C.bandBg ?? C.name;
  const bandName = C.bandName ?? C.white;
  const bandTitle = C.bandTitle ?? C.title;
  const bandContact = C.bandContact ?? C.contact;
  const bandAccent = C.bandAccent ?? C.section;

  doc.setFont('helvetica', 'normal');
  let headerH = 28;
  if (parsed.name) headerH += 22;
  if (parsed.title) headerH += 16;
  if (parsed.contactLines.length) headerH += 14;
  headerH = Math.max(92, headerH + 12);

  doc.setFillColor(...bandBg);
  doc.rect(0, 0, L.pageW, headerH, 'F');
  doc.setFillColor(...bandAccent);
  doc.rect(0, 0, L.pageW, 3.5, 'F');

  let y = 30;
  if (parsed.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...bandName);
    doc.text(parsed.name.toUpperCase(), L.mL, y, TEXT_OPTS);
    y += 20;
  }
  if (parsed.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...bandTitle);
    const titleLines = doc.splitTextToSize(parsed.title.toUpperCase(), contentW);
    for (const tl of titleLines.slice(0, 2)) {
      doc.text(tl, L.mL, y, TEXT_OPTS);
      y += 12;
    }
  }
  if (parsed.contactLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...bandContact);
    const joined = parsed.contactLines.map(cleanContactDisplay).filter(Boolean).join('  |  ');
    const wrapped = doc.splitTextToSize(joined, contentW);
    for (const wl of wrapped.slice(0, 2)) {
      if (y > headerH - 8) break;
      doc.text(wl, L.mL, y, TEXT_OPTS);
      y += 11;
    }
  }

  return headerH + 20;
}

export function generateBeautifulPdf(
  resumeText: string,
  templateId?: string | null,
): jsPDF {
  const theme = resolveResumeTheme(templateId);
  applyTheme(theme);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const parsed = finalizeParsedHeader(parse(sanitizeResumePlainText(resumeText)));

  doc.setProperties({
    title: parsed.name || '',
    author: parsed.name || '',
    subject: parsed.title || '',
    creator: 'Hyred',
  });

  doc.setFillColor(...C.white);
  doc.rect(0, 0, L.pageW, L.pageH, 'F');

  let y =
    C.headerStyle === 'band'
      ? renderBandHeader(doc, parsed)
      : renderLightHeader(doc, parsed);

  // ── Body sections ──────────────────────────────────────────────────────────
  for (let si = 0; si < parsed.sections.length; si++) {
    const sec = parsed.sections[si];
    const isLast = si === parsed.sections.length - 1;

    y = pageBreak(doc, y, 40);
    y = renderSectionHeader(doc, sec.title, y);

    if (/SKILL|TECH|COMPETENC/i.test(sec.title)) {
      y = renderSkills(doc, sec.lines, y);
    } else if (/EXPERIENCE|EMPLOYMENT|WORK HIST|PROJECT/i.test(sec.title)) {
      y = renderExperience(doc, sec.lines, y);
    } else {
      y = renderBullets(doc, sec.lines, y);
    }

    if (!isLast) y += L.sectionGap;
  }

  return doc;
}

// ─── Section header ───────────────────────────────────────────────────────────

function renderSectionHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C.section);
  doc.text(title.toUpperCase(), L.mL, y, TEXT_OPTS);
  y += 5;
  doc.setFillColor(...C.section);
  doc.rect(L.mL, y, contentW, 0.9, 'F');
  y += 12;
  return y;
}

// ─── Generic bullets / paragraphs ─────────────────────────────────────────────
// Every bullet is rendered as REAL "- " text so ATS parsers extract it.

function renderBullets(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;
  for (const line of lines) {
    y = pageBreak(doc, y, 18);
    const isBullet = /^[-•*]\s/.test(line);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.ink);

    if (isBullet) {
      const text = line.replace(/^[-•*]\s*/, '');
      const wrapped = doc.splitTextToSize(text, contentW - L.bulletIndent);
      doc.text('-', L.mL, y, TEXT_OPTS);
      doc.text(wrapped[0], L.mL + L.bulletIndent, y, TEXT_OPTS);
      y += L.lineH;
      for (let i = 1; i < wrapped.length; i++) {
        y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + L.bulletIndent, y, TEXT_OPTS);
        y += L.lineH;
      }
      y += 2.5;
    } else {
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 14);
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += L.lineH;
      }
      y += 2.5;
    }
  }
  return y;
}

// ─── Technical Skills (Category: tools, tools) ───────────────────────────────

function renderSkills(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;
  for (const line of lines) {
    y = pageBreak(doc, y, 16);
    const clean = line.replace(/^[-•*]\s*/, '');
    const colonIdx = clean.indexOf(':');

    if (colonIdx > 0) {
      const category = clean.slice(0, colonIdx).trim();
      const tools = clean.slice(colonIdx + 1).trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...C.ink);
      const catText = category + ': ';
      doc.text(catText, L.mL, y, TEXT_OPTS);
      const catW = doc.getTextWidth(catText);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(tools, contentW - catW);
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) {
          y = pageBreak(doc, y, 14);
          y += L.lineH - 1;
        }
        doc.text(wrapped[i], i === 0 ? L.mL + catW : L.mL + catW, y, TEXT_OPTS);
      }
      y += L.lineH + 1;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(clean, contentW);
      for (const wl of wrapped) {
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += L.lineH;
      }
    }
  }
  return y;
}

/** Split trailing dates for right-alignment when possible. */
function splitLeftAndDates(line: string): { left: string; dates: string | null } {
  const paren = line.match(/^(.+?)\s*[(\[]\s*([^)\]]*\d{4}[^)\]]*)\s*[)\]]\s*$/);
  if (paren) return { left: paren[1].trim(), dates: paren[2].trim() };

  const pipeParts = line.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const last = pipeParts[pipeParts.length - 1]!;
    if (/\d{4}/.test(last) || /present|current/i.test(last)) {
      return { left: pipeParts.slice(0, -1).join('  ·  '), dates: last };
    }
  }

  const dash = line.match(
    /^(.+?)\s+[-–]\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}\s*[-–]\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}))\s*$/i,
  );
  if (dash) return { left: dash[1].trim(), dates: dash[2].trim() };

  return { left: line, dates: null };
}

function renderRoleHeader(doc: jsPDF, line: string, y: number, opts?: { company?: boolean }): number {
  const { left, dates } = splitLeftAndDates(line);
  y += opts?.company ? 2 : 6;
  y = pageBreak(doc, y, 20);

  doc.setFont('helvetica', opts?.company ? 'bold' : 'bold');
  doc.setFontSize(opts?.company ? 10.2 : 10);
  doc.setTextColor(...C.ink);

  if (dates) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.stone);
    const dateW = doc.getTextWidth(dates);
    doc.text(dates, L.pageW - L.mR - dateW, y, TEXT_OPTS);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(opts?.company ? 10.2 : 10);
    doc.setTextColor(...C.ink);
    const maxLeft = contentW - dateW - 12;
    const wrapped = doc.splitTextToSize(left, maxLeft);
    doc.text(wrapped[0], L.mL, y, TEXT_OPTS);
    y += 13;
    for (let i = 1; i < wrapped.length; i++) {
      y = pageBreak(doc, y, 13);
      doc.text(wrapped[i], L.mL, y, TEXT_OPTS);
      y += 12;
    }
  } else {
    const wrapped = doc.splitTextToSize(left, contentW);
    for (const wl of wrapped) {
      y = pageBreak(doc, y, 13);
      doc.text(wl, L.mL, y, TEXT_OPTS);
      y += 13;
    }
  }
  return y;
}

// ─── Professional Experience / Projects ──────────────────────────────────────

function renderExperience(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;

  for (const line of lines) {
    y = pageBreak(doc, y, 18);
    const isBullet = /^[-•*]\s/.test(line);
    const isClient = /^client:/i.test(line);
    const isJobHeader = !isBullet && !isClient && looksLikeJobHeader(line);
    const looksCompany =
      !isBullet &&
      !isClient &&
      !isJobHeader &&
      (/pvt|ltd|inc|llc|corp|technologies|services|solutions/i.test(line) ||
        (/[-–]/.test(line) && line.length < 90 && !/^[-•*]/.test(line)));

    if (isJobHeader || looksCompany) {
      y = renderRoleHeader(doc, line, y, { company: looksCompany && !isJobHeader });
    } else if (isClient) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...C.stone);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 13);
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += 11;
      }
      y += 2;
    } else if (isBullet) {
      const text = line.replace(/^[-•*]\s*/, '');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(text, contentW - L.bulletIndent);
      doc.text('-', L.mL, y, TEXT_OPTS);
      doc.text(wrapped[0], L.mL + L.bulletIndent, y, TEXT_OPTS);
      y += L.lineH;
      for (let i = 1; i < wrapped.length; i++) {
        y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + L.bulletIndent, y, TEXT_OPTS);
        y += L.lineH;
      }
      y += 2.5;
    } else {
      // Role / subtitle line under company
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...C.ink);
      const { left, dates } = splitLeftAndDates(line);
      if (dates) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.stone);
        const dateW = doc.getTextWidth(dates);
        doc.text(dates, L.pageW - L.mR - dateW, y, TEXT_OPTS);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.8);
        doc.setTextColor(...C.ink);
        doc.text(doc.splitTextToSize(left, contentW - dateW - 12)[0], L.mL, y, TEXT_OPTS);
        y += 13;
      } else {
        const wrapped = doc.splitTextToSize(line, contentW);
        for (const wl of wrapped) {
          y = pageBreak(doc, y, 13);
          doc.text(wl, L.mL, y, TEXT_OPTS);
          y += L.lineH;
        }
      }
    }
  }
  return y;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function looksLikeJobHeader(line: string): boolean {
  if (/^[-•*]\s/.test(line)) return false;
  return (
    /[|]/.test(line) ||
    /\d{4}\s*[-–]\s*(present|current|\d{4})/i.test(line) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{0,30}\d{4}/i.test(line)
  );
}

function pageBreak(doc: jsPDF, y: number, neededHeight: number): number {
  if (y + neededHeight > L.pageH - L.mBottom) {
    doc.addPage();
    doc.setFillColor(...C.white);
    doc.rect(0, 0, L.pageW, L.pageH, 'F');
    return L.mTop;
  }
  return y;
}

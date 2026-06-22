/**
 * PDF Resume Generator — ATS-friendly first, beautiful second.
 *
 * Design priority:
 *   1. EVERY bullet is rendered as TEXT ("- ") so ATS parsers (Workday,
 *      Greenhouse, Lever, Taleo, iCIMS) extract it as a list item. No
 *      graphical-only bullet circles.
 *   2. Single-column linear layout. No tables. No text boxes. No multi-column.
 *   3. Plain Helvetica throughout (parsers handle this best).
 *   4. ASCII-only output (Latin-1 fallback). Smart quotes etc. are normalised
 *      upstream by lib/gemini.ts but we re-normalise here as a safety net.
 *   5. Section headers are detected by the ALL CAPS pattern, exactly the
 *      pattern the ATS resume prompt is told to produce.
 *
 * Visual styling (matches the user's preferred original-resume header):
 *   - Dark navy header band at top of page (~98pt tall).
 *   - Thin amber accent line at the very top edge.
 *   - Name in big bold WHITE.
 *   - Title tagline in amber, ALL CAPS, regular weight.
 *   - Contact info on a SINGLE line with ASCII " | " separators, in light
 *     blue-gray on the navy band. The font auto-shrinks a touch to stay on one
 *     line before any wrap. ASCII separators honour design rule #4.
 *   - Body content (sections + bullets) renders below the band on white.
 *   - Each section header has a small amber rule above it.
 *   - All bullets are real "- " text characters in the text stream so
 *     ATS parsers extract them as list items.
 *
 * Input format (produced by generateAtsResume()):
 *   Line 1: Name
 *   Line 2: Title tagline (current role title - the JD-aligned one)
 *   Line 3-N: Contact lines (email, phone, location, linkedin) - any order
 *   Then ALL-CAPS section headers and "- " bullets
 *
 * Defensive parser behaviour:
 *   - Lines like "Resume" / "RESUME" / "CURRICULUM VITAE" / "CV" / "PROFILE"
 *     that some LLM outputs include before the candidate's name are SKIPPED
 *     so the user's name (not the literal word "Resume") is what appears in
 *     the navy band.
 *   - If line 2 looks like contact info (has @, +, or .com), it skips the
 *     title slot - keeps the parser tolerant of legacy resume text.
 */

import { jsPDF } from 'jspdf';
import { sanitizeResumePlainText } from './resume-plain-text';

// ─── Design tokens ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,    // deep navy (matches user's original header)
  accent:   [234, 179, 8] as RGB,   // amber
  white:    [255, 255, 255] as RGB,
  ink:      [15, 23, 42] as RGB,    // body text on white
  stone:    [80, 92, 110] as RGB,   // section / secondary text on white
  light:    [180, 195, 215] as RGB, // contact text on the navy band
  faint:    [212, 218, 228] as RGB, // very-light section separators
};

const L = {
  pageW:    595.28, // A4 pt
  pageH:    841.89,
  mL:       44,
  mR:       44,
  mBottom:  52,
  headerH:  98,    // navy header band height
  lineH:    13.5,
  bulletIndent: 14, // hanging indent for wrapped bullet text
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

function measureContactBlockHeight(doc: jsPDF, contactLines: string[]): number {
  if (contactLines.length === 0) return 0;
  const joined = contactLines.join('   |   ');
  let fs = 8.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fs);
  while (doc.getTextWidth(joined) > contentW && fs > 7.2) {
    fs -= 0.3;
    doc.setFontSize(fs);
  }
  const wrapped = doc.splitTextToSize(joined, contentW);
  return wrapped.length * 11;
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

export function generateBeautifulPdf(resumeText: string): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const parsed = finalizeParsedHeader(parse(sanitizeResumePlainText(resumeText)));

  // Size the navy band to fit name + amber title + contacts (fixed 98pt clipped
  // wrapped contact rows on some mobile PDF viewers).
  doc.setFont('helvetica', 'normal');
  let headerH = 32;
  if (parsed.name) headerH += 22;
  if (parsed.title) headerH += 16;
  headerH += measureContactBlockHeight(doc, parsed.contactLines);
  headerH = Math.max(L.headerH, headerH + 10);

  // Set explicit PDF metadata so PDF viewers don't fall back to a generic
  // "Resume" or filename-derived title in their header bar.
  doc.setProperties({
    title: parsed.name || '',
    author: parsed.name || '',
    subject: parsed.title || '',
    creator: 'Hyred',
  });

  // ── Dark navy header band ──────────────────────────────────────────────────
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, L.pageW, headerH, 'F');

  // Thin amber accent line at the very top of the navy band.
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, L.pageW, 4, 'F');

  let y = 32;

  // ── Name (large bold white) ────────────────────────────────────────────────
  if (parsed.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...C.white);
    doc.text(parsed.name, L.mL, y, TEXT_OPTS);
    y += 22;
  }

  // ── Title tagline (amber, ALL CAPS) ────────────────────────────────────────
  if (parsed.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...C.accent);
    doc.text(parsed.title.toUpperCase(), L.mL, y, TEXT_OPTS);
    y += 16;
  }

  // ── Contact info (single clean line, " | " separators, light blue-gray) ────
  // Joins email / phone / location / linkedin with ASCII " | " separators on
  // ONE line (the look the user asked for). The font auto-shrinks slightly to
  // keep everything on a single line before any wrap. ASCII separators (not a
  // bullet glyph) honour the file's ASCII-only rule and parse cleanly in ATS.
  if (parsed.contactLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.light);
    const joined = parsed.contactLines.join('   |   ');
    let fs = 8.8;
    doc.setFontSize(fs);
    while (doc.getTextWidth(joined) > contentW && fs > 7.2) {
      fs -= 0.3;
      doc.setFontSize(fs);
    }
    const wrapped = doc.splitTextToSize(joined, contentW);
    for (const wl of wrapped) {
      if (y > headerH - 6) break;
      doc.text(wl, L.mL, y, TEXT_OPTS);
      y += 11;
    }
  }

  // Body content starts below the navy band on white background.
  y = headerH + 22;

  // ── Body sections ──────────────────────────────────────────────────────────
  for (let si = 0; si < parsed.sections.length; si++) {
    const sec = parsed.sections[si];
    const isLast = si === parsed.sections.length - 1;

    if (y > L.pageH - L.mBottom - 50) {
      doc.addPage();
      y = 28;
    }

    y = renderSectionHeader(doc, sec.title, y);

    if (/SKILL|TECH|COMPETENC/i.test(sec.title)) {
      y = renderSkills(doc, sec.lines, y);
    } else if (/EXPERIENCE|EMPLOYMENT|WORK HIST/i.test(sec.title)) {
      y = renderExperience(doc, sec.lines, y);
    } else {
      y = renderBullets(doc, sec.lines, y);
    }

    if (!isLast) y += 8;
  }

  return doc;
}

// ─── Section header ───────────────────────────────────────────────────────────

function renderSectionHeader(doc: jsPDF, title: string, y: number): number {
  // Thin amber rule above the header
  doc.setFillColor(...C.accent);
  doc.rect(L.mL, y, contentW, 1.2, 'F');
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C.ink);
  doc.text(title, L.mL, y, TEXT_OPTS);
  y += 14;
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
      // Strip whatever bullet marker came in, then render with "- " prefix.
      const text = line.replace(/^[-•*]\s*/, '');
      const wrapped = doc.splitTextToSize(text, contentW - L.bulletIndent);
      // First line: "- " visible to parser
      doc.text('-', L.mL, y, TEXT_OPTS);
      doc.text(wrapped[0], L.mL + L.bulletIndent, y, TEXT_OPTS);
      y += L.lineH;
      // Continuation lines (hanging indent)
      for (let i = 1; i < wrapped.length; i++) {
        y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + L.bulletIndent, y, TEXT_OPTS);
        y += L.lineH;
      }
      y += 1.5;
    } else {
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 14);
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += L.lineH;
      }
      y += 2;
    }
  }
  return y;
}

// ─── Technical Skills (Category: tools, tools) ───────────────────────────────

function renderSkills(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;
  for (const line of lines) {
    y = pageBreak(doc, y, 16);
    // Strip bullet markers — Skills should never have bullets but be safe
    const clean = line.replace(/^[-•*]\s*/, '');
    const colonIdx = clean.indexOf(':');

    if (colonIdx > 0) {
      const category = clean.slice(0, colonIdx).trim();
      const tools = clean.slice(colonIdx + 1).trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      const catText = category + ': ';
      doc.text(catText, L.mL, y, TEXT_OPTS);
      const catW = doc.getTextWidth(catText);

      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(tools, contentW - catW);
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + catW, y, TEXT_OPTS);
        if (i < wrapped.length - 1) y += L.lineH - 1;
      }
      y += L.lineH;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(clean, L.mL, y, TEXT_OPTS);
      y += L.lineH;
    }
  }
  return y;
}

// ─── Professional Experience ─────────────────────────────────────────────────
// Detects "Title | Company | Dates" header lines and "Client: ..." sublines.
// Bullets are rendered exactly like renderBullets — as REAL text.

function renderExperience(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;

  for (const line of lines) {
    y = pageBreak(doc, y, 18);
    const isBullet = /^[-•*]\s/.test(line);
    const isClient = /^client:/i.test(line);
    const isJobHeader = !isBullet && !isClient && looksLikeJobHeader(line);

    if (isJobHeader) {
      y += 4;
      y = pageBreak(doc, y, 22);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 14);
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += 13;
      }
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
      y += 1.5;
    } else {
      // Plain paragraph fallback
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.stone);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 13);
        doc.text(wl, L.mL, y, TEXT_OPTS);
        y += L.lineH;
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
    return 28;
  }
  return y;
}

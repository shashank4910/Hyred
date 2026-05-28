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
 * Visual styling (clean & recruiter-friendly):
 *   - No heavy header band. Just a thin amber accent at the top.
 *   - Name in bold dark on white background.
 *   - Title tagline (the JD-aligned current role title) in amber below the name.
 *   - Contact info joined on one or two lines with " | " separators, in stone gray.
 *   - Single thin amber rule below the header, separating it from sections.
 *   - Each section header has a small amber rule above it.
 *   - All bullets are real "- " text characters in the text stream.
 *
 * Input format (produced by generateAtsResume()):
 *   Line 1: Name
 *   Line 2: Title tagline (current role title - the JD-aligned one)
 *   Line 3-N: Contact lines (email, phone, location, linkedin) - any order
 *   Then ALL-CAPS section headers and "- " bullets
 *
 * The title-detection in parse() tolerates legacy resumes (pre-fix) where
 * line 2 was an email - any line that looks like contact info skips the
 * title slot and goes into contactLines instead.
 */

import { jsPDF } from 'jspdf';

// ─── Design tokens ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  accent: [234, 179, 8] as RGB,    // amber
  ink:    [15, 23, 42] as RGB,     // near-black
  stone:  [80, 92, 110] as RGB,    // mid gray
  faint:  [212, 218, 228] as RGB,  // very-light separator
};

const L = {
  pageW:    595.28, // A4 pt
  pageH:    841.89,
  mL:       44,
  mR:       44,
  mTop:     40,
  mBottom:  52,
  lineH:    13.5,
  bulletIndent: 14, // hanging indent for wrapped bullet text
};

const contentW = L.pageW - L.mL - L.mR;

// ─── Plain-text parser ────────────────────────────────────────────────────────

interface Section { title: string; lines: string[] }
interface ParsedResume {
  name: string;
  title: string | null;       // line right after name, if it's not contact info
  contactLines: string[];     // remaining pre-section lines (email/phone/etc.)
  sections: Section[];
}

/**
 * Heuristic: does this line look like an email / phone / URL / city,country?
 * Used to decide whether the second line is a title tagline or contact info.
 */
function looksLikeContactLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.includes('@')) return true;                                  // email
  if (/^\+?\d/.test(t)) return true;                                  // phone
  if (/(linkedin|github|http|www\.|\.com|\.in|\.io|\.dev)/i.test(t)) return true; // url
  if (/^[A-Za-z .'-]{3,30},\s*[A-Za-z .'-]{2,30}$/.test(t)) return true; // "City, Country"
  return false;
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
      if (isSectionHeader(trimmed)) {
        // No more header lines - we've reached the first section.
        inHeader = false;
        cur = { title: trimmed, lines: [] };
        sections.push(cur);
        continue;
      }
      if (!name) {
        name = trimmed;
        continue;
      }
      // Second non-section, non-name line: title slot, IF it doesn't look
      // like contact info. This makes the parser tolerant of older resumes
      // where line 2 was an email.
      if (title === null && !looksLikeContactLine(trimmed)) {
        title = trimmed;
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

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  // ALL CAPS letters / spaces / & / / / -. No digits.
  return /^[A-Z][A-Z\s&/-]+$/.test(t);
}

// ─── Light ASCII normalisation (defensive — generator already does this) ─────

function asciiSafe(s: string): string {
  return s
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022\u25CF\u25E6]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2026/g, '...')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

export function generateBeautifulPdf(resumeText: string): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const parsed = parse(asciiSafe(resumeText));

  // Thin amber accent at the very top of the page (3pt).
  // Subtle visual identity, no heavy fill.
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, L.pageW, 3, 'F');

  let y = L.mTop;

  // ── Name ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...C.ink);
  doc.text(parsed.name || 'Resume', L.mL, y);
  y += 22;

  // ── Title tagline (JD-aligned current role title) ──────────────────────────
  if (parsed.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(...C.accent);
    doc.text(parsed.title, L.mL, y);
    y += 15;
  }

  // ── Contact info ───────────────────────────────────────────────────────────
  // Joined on one line with " | " separators when it fits; wraps to additional
  // lines automatically. Each item still appears as plain text in the PDF
  // text stream so ATS parsers extract the email / phone / URL cleanly.
  if (parsed.contactLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.stone);
    const joined = parsed.contactLines.join('  |  ');
    const wrapped = doc.splitTextToSize(joined, contentW);
    for (const wl of wrapped) {
      doc.text(wl, L.mL, y);
      y += 12;
    }
  }

  // ── Thin separator below the header ────────────────────────────────────────
  y += 6;
  doc.setDrawColor(...C.faint);
  doc.setLineWidth(0.6);
  doc.line(L.mL, y, L.pageW - L.mR, y);
  y += 16;

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
  doc.text(title, L.mL, y);
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
      doc.text('-', L.mL, y);
      doc.text(wrapped[0], L.mL + L.bulletIndent, y);
      y += L.lineH;
      // Continuation lines (hanging indent)
      for (let i = 1; i < wrapped.length; i++) {
        y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + L.bulletIndent, y);
        y += L.lineH;
      }
      y += 1.5;
    } else {
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 14);
        doc.text(wl, L.mL, y);
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
      doc.text(catText, L.mL, y);
      const catW = doc.getTextWidth(catText);

      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(tools, contentW - catW);
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + catW, y);
        if (i < wrapped.length - 1) y += L.lineH - 1;
      }
      y += L.lineH;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(clean, L.mL, y);
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
        doc.text(wl, L.mL, y);
        y += 13;
      }
    } else if (isClient) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...C.stone);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = pageBreak(doc, y, 13);
        doc.text(wl, L.mL, y);
        y += 11;
      }
      y += 2;
    } else if (isBullet) {
      const text = line.replace(/^[-•*]\s*/, '');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(text, contentW - L.bulletIndent);
      doc.text('-', L.mL, y);
      doc.text(wrapped[0], L.mL + L.bulletIndent, y);
      y += L.lineH;
      for (let i = 1; i < wrapped.length; i++) {
        y = pageBreak(doc, y, 14);
        doc.text(wrapped[i], L.mL + L.bulletIndent, y);
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
        doc.text(wl, L.mL, y);
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

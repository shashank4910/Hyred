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
 * Visual styling (kept minimal so it doesn't fight the parser):
 *   - Top header band with name in bold, contact lines below
 *   - Thin amber rule above each section header
 *   - All bullets are real "- " text characters
 *
 * Input format (produced by generateAtsResume()):
 *   Line 1: Name
 *   Line 2-N: Contact lines (email, phone, location, linkedin) - any order
 *   Then ALL-CAPS section headers and "- " bullets
 */

import { jsPDF } from 'jspdf';

// ─── Design tokens ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  headerBg: [15, 23, 42] as RGB,    // deep navy
  accent:   [234, 179, 8] as RGB,   // amber
  white:    [255, 255, 255] as RGB,
  ink:      [15, 23, 42] as RGB,
  stone:    [80, 92, 110] as RGB,
  light:    [180, 195, 215] as RGB, // contact text on dark band
};

const L = {
  pageW:    595.28, // A4 pt
  pageH:    841.89,
  mL:       44,
  mR:       44,
  mBottom:  52,
  headerH:  92,
  lineH:    13.5,
  bulletIndent: 14, // hanging indent for wrapped bullet text
};

const contentW = L.pageW - L.mL - L.mR;

// ─── Plain-text parser ────────────────────────────────────────────────────────

interface Section { title: string; lines: string[] }
interface ParsedResume {
  name: string;
  contactLines: string[]; // ALL pre-section lines after the name
  sections: Section[];
}

function parse(text: string): ParsedResume {
  const raw = text.split('\n');
  let name = '';
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
      } else {
        // Every non-section line before the first section is contact info.
        contactLines.push(trimmed);
      }
      continue;
    }

    if (isSectionHeader(trimmed)) {
      cur = { title: trimmed, lines: [] };
      sections.push(cur);
      continue;
    }

    if (cur && trimmed) cur.lines.push(trimmed);
  }

  return { name, contactLines, sections };
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
  let y = 0;

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, L.pageW, L.headerH, 'F');

  // Thin amber accent bar at the very top
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, L.pageW, 4, 'F');

  // Name (large bold white)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...C.white);
  y = 32;
  doc.text(parsed.name || 'Resume', L.mL, y);

  // Contact lines (small, light) — render each line on its own row.
  // Joining onto fewer rows would tempt the parser to read "email | phone"
  // as a single garbled token; keeping them separate is parser-safe.
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.light);
  for (const line of parsed.contactLines) {
    if (y > L.headerH - 8) break; // avoid spilling out of the band
    doc.text(line, L.mL, y);
    y += 11;
  }

  y = L.headerH + 18;

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

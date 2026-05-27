/**
 * PDF Resume Generator — matches Shashank Singh's exact resume structure.
 *
 * Structure (in order):
 *  1. Header:       Name (large bold) + Title + Contact line
 *  2. PROFESSIONAL SUMMARY  — paragraph text
 *  3. KEY ACHIEVEMENTS      — bullet list
 *  4. TECHNICAL SKILLS      — "Category: Tool1, Tool2, ..." lines
 *  5. CERTIFICATIONS        — bullet list
 *  6. PROFESSIONAL EXPERIENCE — per role:
 *       Job Title  |  Company, City  |  Date Range   (bold header row)
 *       Client: ClientName (Domain)                  (italic subline)
 *       - bullet
 *       - bullet
 *  7. EDUCATION             — single line
 *
 * Input: plain-text resume produced by generateAtsResume() which uses
 *   ALL CAPS section headers and "- " bullet prefixes.
 */

import { jsPDF } from 'jspdf';

// ─── Design tokens ────────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  headerBg:    [15, 23, 42]   as RGB,  // deep navy
  accent:      [234, 179, 8]  as RGB,  // amber — matches JobRadar brand
  accentLight: [254, 243, 199] as RGB,  // very light amber for skill tag bg
  white:       [255, 255, 255] as RGB,
  ink:         [15, 23, 42]   as RGB,  // near-black body text
  stone:       [100, 116, 139] as RGB,  // muted secondary text
  divider:     [226, 232, 240] as RGB,  // light rule colour
};

const L = {
  pageW:   595.28,  // A4 pt
  pageH:   841.89,
  mL:      44,      // left margin
  mR:      44,      // right margin
  mBottom: 52,
  headerH: 88,      // height of the top header band
  lineH:   13.5,    // standard line height
  bulletX: 52,      // indent for bullet text (after dot)
};

const contentW = L.pageW - L.mL - L.mR;

// ─── Plain-text parser ────────────────────────────────────────────────────────

interface Section { title: string; lines: string[] }
interface ParsedResume {
  name: string;
  titleLine: string;
  contactLine: string;
  sections: Section[];
}

function parse(text: string): ParsedResume {
  const raw = text.split('\n');
  let name = '';
  let titleLine = '';
  let contactLine = '';
  const sections: Section[] = [];
  let cur: Section | null = null;
  let headerDone = false;
  let headerLinesSeen = 0;

  for (const rawLine of raw) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!headerDone) {
      if (!trimmed) continue;
      if (!name) { name = trimmed; continue; }
      if (!titleLine) { titleLine = trimmed; continue; }
      if (!contactLine) { contactLine = trimmed; headerLinesSeen++; continue; }
      // Extra header lines (e.g. second contact row) until we hit a section header
      if (!isSectionHeader(trimmed)) { headerLinesSeen++; continue; }
      headerDone = true;
    }

    if (isSectionHeader(trimmed)) {
      cur = { title: trimmed, lines: [] };
      sections.push(cur);
      continue;
    }

    if (cur && trimmed) cur.lines.push(trimmed);
  }

  return { name, titleLine, contactLine, sections };
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  // All uppercase letters, spaces, ampersands, slashes, hyphens
  return /^[A-Z][A-Z\s&\/\-]+$/.test(t);
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

export function generateBeautifulPdf(resumeText: string): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const parsed = parse(resumeText);
  let y = 0;

  // ── 1. Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...C.headerBg);
  doc.rect(0, 0, L.pageW, L.headerH, 'F');

  // Amber accent bar at very top
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, L.pageW, 4, 'F');

  // Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...C.white);
  y = 32;
  doc.text(parsed.name || 'Resume', L.mL, y);

  // Title (if present)
  if (parsed.titleLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.accent);
    y += 17;
    doc.text(parsed.titleLine, L.mL, y);
  }

  // Contact line
  if (parsed.contactLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 195, 215);
    y += 15;
    // Split if too long
    const parts = parsed.contactLine.split(/\s*[•|]\s*/);
    if (parts.length > 3) {
      const half = Math.ceil(parts.length / 2);
      doc.text(parts.slice(0, half).join('   •   '), L.mL, y);
      y += 11;
      doc.text(parts.slice(half).join('   •   '), L.mL, y);
    } else {
      doc.text(parsed.contactLine, L.mL, y);
    }
  }

  y = L.headerH + 16;

  // ── 2. Body sections ────────────────────────────────────────────────────────
  for (let si = 0; si < parsed.sections.length; si++) {
    const sec = parsed.sections[si];
    const isLast = si === parsed.sections.length - 1;

    // Page break check (leave room for section header + at least 2 lines)
    if (y > L.pageH - L.mBottom - 50) {
      doc.addPage();
      y = 28;
    }

    y = renderSectionHeader(doc, sec.title, y);

    if (/SKILL|TECH|COMPETENC/i.test(sec.title)) {
      y = renderSkillsSection(doc, sec.lines, y);
    } else if (/EXPERIENCE|EMPLOYMENT|WORK HIST/i.test(sec.title)) {
      y = renderExperienceSection(doc, sec.lines, y);
    } else {
      y = renderBulletSection(doc, sec.lines, y);
    }

    if (!isLast) y += 6;
  }

  return doc;
}

// ─── Section header ────────────────────────────────────────────────────────────

function renderSectionHeader(doc: jsPDF, title: string, y: number): number {
  // Amber rule
  doc.setFillColor(...C.accent);
  doc.rect(L.mL, y, contentW, 1.5, 'F');
  y += 11;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.ink);
  doc.text(title, L.mL, y);
  y += 13;
  return y;
}

// ─── Generic bullet / paragraph section ───────────────────────────────────────

function renderBulletSection(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;
  for (const line of lines) {
    y = checkPageBreak(doc, y, 20);
    const isBullet = /^[-•*]\s/.test(line);
    const text = isBullet ? line.replace(/^[-•*]\s*/, '') : line;

    if (isBullet) {
      // Amber dot
      doc.setFillColor(...C.accent);
      doc.circle(L.mL + 3.5, y - 2.8, 2, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(text, contentW - 14);
      for (let i = 0; i < wrapped.length; i++) {
        y = checkPageBreak(doc, y, 14);
        doc.text(wrapped[i], L.bulletX, y);
        y += L.lineH;
      }
      y += 2;
    } else {
      // Plain paragraph / cert name / education line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(text, contentW);
      for (const wl of wrapped) {
        y = checkPageBreak(doc, y, 14);
        doc.text(wl, L.mL, y);
        y += L.lineH;
      }
      y += 2;
    }
  }
  return y;
}

// ─── Technical skills section ─────────────────────────────────────────────────
// Expects lines like: "Performance Testing: JMeter, LoadRunner, Gatling"

function renderSkillsSection(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;
  for (const line of lines) {
    y = checkPageBreak(doc, y, 16);
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const category = line.slice(0, colonIdx).trim();
      const tools = line.slice(colonIdx + 1).trim();

      // Category label (bold amber)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.accent);
      const catW = doc.getTextWidth(category + ': ');
      doc.text(category + ':', L.mL, y);

      // Tools value (normal ink) — wrap if overflows
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.ink);
      const toolsWrapped = doc.splitTextToSize(tools, contentW - catW - 2);
      for (let i = 0; i < toolsWrapped.length; i++) {
        y = checkPageBreak(doc, y, 14);
        doc.text(toolsWrapped[i], L.mL + catW + 2, y);
        if (i < toolsWrapped.length - 1) y += L.lineH - 1;
      }
      y += L.lineH;
    } else {
      // Fallback — render as plain line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      doc.text(line.replace(/^[-•*]\s*/, ''), L.mL, y);
      y += L.lineH;
    }
  }
  return y;
}

// ─── Professional Experience section ──────────────────────────────────────────
// Detects job header lines (contain | or — separating title from company)
// and client lines ("Client: ...") to render them with special styling.

function renderExperienceSection(doc: jsPDF, lines: string[], startY: number): number {
  let y = startY;

  for (const line of lines) {
    y = checkPageBreak(doc, y, 20);
    const isBullet = /^[-•*]\s/.test(line);
    const isClient = /^client:/i.test(line);
    const isJobHeader = !isBullet && !isClient && isJobTitleLine(line);

    if (isJobHeader) {
      // Extra space before each new role
      y += 4;
      y = checkPageBreak(doc, y, 22);

      // Light background row for job header
      doc.setFillColor(248, 250, 252);
      doc.rect(L.mL - 4, y - 10, contentW + 8, 14, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = checkPageBreak(doc, y, 14);
        doc.text(wl, L.mL, y);
        y += 13;
      }

    } else if (isClient) {
      // Client line in italic amber
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.accent);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = checkPageBreak(doc, y, 12);
        doc.text(wl, L.mL, y);
        y += 11;
      }
      y += 2;

    } else if (isBullet) {
      const text = line.replace(/^[-•*]\s*/, '');
      doc.setFillColor(...C.accent);
      doc.circle(L.mL + 3.5, y - 2.8, 2, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      const wrapped = doc.splitTextToSize(text, contentW - 14);
      for (let i = 0; i < wrapped.length; i++) {
        y = checkPageBreak(doc, y, 14);
        doc.text(wrapped[i], L.bulletX, y);
        y += L.lineH;
      }
      y += 1.5;

    } else {
      // Plain line
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.stone);
      const wrapped = doc.splitTextToSize(line, contentW);
      for (const wl of wrapped) {
        y = checkPageBreak(doc, y, 13);
        doc.text(wl, L.mL, y);
        y += L.lineH;
      }
    }
  }
  return y;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isJobTitleLine(line: string): boolean {
  if (/^[-•*]\s/.test(line)) return false;
  return (
    /[|—–]/.test(line) ||
    /\d{4}\s*[-–]\s*(present|current|\d{4})/i.test(line) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{0,30}\d{4}/i.test(line)
  );
}

function checkPageBreak(doc: jsPDF, y: number, neededHeight: number): number {
  if (y + neededHeight > L.pageH - L.mBottom) {
    doc.addPage();
    return 28;
  }
  return y;
}

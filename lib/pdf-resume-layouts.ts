/**
 * PDF renderer that visually matches the six on-screen resume layouts
 * (see app/_components/ats-report/HyredResumePreview.tsx). Each layout is a
 * dedicated draw function sharing low-level jsPDF helpers below. Every text
 * value comes straight from `buildResumeLayoutModel` — nothing is invented.
 *
 * ATS rules preserved from the previous single-column renderer: Helvetica,
 * real "- " bullets (never bullet glyphs) for the ATS-critical body text,
 * A4 page size in points (595.28 x 841.89).
 */

import { jsPDF } from 'jspdf';
import { parseResumeDocument, type ResumeLine, type ResumeSection } from './resume-document';
import { buildResumeLayoutModel, initialsFromName, type ResumeLayoutModel } from './resume-layout-model';
import { sanitizeResumePlainText } from './resume-plain-text';
import type { ResumeTheme } from './resume-template-theme';

type RGB = [number, number, number];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const TEXT_OPTS = { align: 'left' as const };

// ─── Color helpers ────────────────────────────────────────────────────────────

/** Convert a `#rgb` / `#rrggbb` hex string to a jsPDF RGB tuple. */
export function hexToRgb(hex: string | undefined | null, fallback: RGB = [30, 41, 59]): RGB {
  if (!hex) return fallback;
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return fallback;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

interface Palette {
  name: RGB; title: RGB; contact: RGB; section: RGB; ink: RGB; stone: RGB;
  sidebarBg: RGB; sidebarInk: RGB; accent: RGB; summaryBand: RGB;
  border: RGB; pillBg: RGB; pillText: RGB;
  bandBg: RGB; bandName: RGB; bandTitle: RGB; bandContact: RGB; bandAccent: RGB;
  white: RGB;
}

function buildPalette(theme: ResumeTheme): Palette {
  const css = theme.css;
  const pdf = theme.pdf;
  return {
    name: pdf.name ?? hexToRgb(css.name),
    title: pdf.title ?? hexToRgb(css.title, [71, 85, 105]),
    contact: pdf.contact ?? hexToRgb(css.contact, [100, 116, 139]),
    section: pdf.section ?? hexToRgb(css.section ?? css.name),
    ink: pdf.ink ?? hexToRgb(css.ink),
    stone: pdf.stone ?? hexToRgb(css.stone, [100, 116, 139]),
    sidebarBg: hexToRgb(css.sidebarBg, [241, 245, 249]),
    sidebarInk: hexToRgb(css.sidebarInk ?? css.ink),
    accent: hexToRgb(css.accent ?? css.section ?? css.name),
    summaryBand: hexToRgb(css.summaryBand ?? css.sidebarBg, [241, 245, 249]),
    border: hexToRgb(css.border ?? css.section ?? css.name),
    pillBg: hexToRgb(css.pillBg ?? css.sidebarBg, [219, 234, 254]),
    pillText: hexToRgb(css.pillText ?? css.section ?? css.name),
    bandBg: pdf.bandBg ?? hexToRgb(css.bandBg ?? css.name),
    bandName: pdf.bandName ?? hexToRgb(css.bandName ?? '#ffffff'),
    bandTitle: pdf.bandTitle ?? hexToRgb(css.bandTitle ?? css.title, [71, 85, 105]),
    bandContact: pdf.bandContact ?? hexToRgb(css.bandContact ?? css.contact, [100, 116, 139]),
    bandAccent: pdf.bandAccent ?? hexToRgb(css.bandAccent ?? css.section ?? css.name),
    white: [255, 255, 255],
  };
}

// ─── Cursor / page-break machinery ────────────────────────────────────────────

interface Cursor {
  x: number;
  width: number;
  y: number;
  topY: number;
  bottomMargin: number;
  onBreak: (doc: jsPDF, cur: Cursor) => void;
}

function makeCursor(
  x: number,
  width: number,
  topY: number,
  bottomMargin: number,
  onBreak: Cursor['onBreak'],
): Cursor {
  return { x, width, y: topY, topY, bottomMargin, onBreak };
}

function ensureSpace(doc: jsPDF, cur: Cursor, needed: number): void {
  if (cur.y + needed > PAGE_H - cur.bottomMargin) {
    cur.onBreak(doc, cur);
  }
}

function paintWhitePage(doc: jsPDF): void {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function defaultOnBreak(doc: jsPDF, cur: Cursor): void {
  doc.addPage();
  paintWhitePage(doc);
  cur.y = cur.topY;
}

/**
 * Renders a two-column body: the main column is drawn first (it owns real
 * page-break handling), then the sidebar is drawn on page 1 onward, hopping
 * across whatever pages the main column already created (and painting the
 * sidebar background on any extra page it still needs). This keeps the
 * colored sidebar column consistent across every page of a multi-page resume.
 */
function renderTwoColumnBody(
  doc: jsPDF,
  geo: {
    mainX: number; mainW: number; mainTopY: number;
    sideX: number; sideW: number; sideTopY: number;
    bottomMargin: number;
  },
  sidebarBg: RGB,
  renderMain: (doc: jsPDF, cur: Cursor) => void,
  renderSide: (doc: jsPDF, cur: Cursor) => void,
): void {
  const paintSidebarBg = (d: jsPDF) => {
    d.setFillColor(...sidebarBg);
    d.rect(geo.sideX, 0, geo.sideW, PAGE_H, 'F');
  };

  const mainCur = makeCursor(geo.mainX, geo.mainW, geo.mainTopY, geo.bottomMargin, (d, c) => {
    d.addPage();
    paintWhitePage(d);
    paintSidebarBg(d);
    c.y = c.topY;
  });
  renderMain(doc, mainCur);

  const totalPages = doc.getNumberOfPages();
  doc.setPage(1);
  let sidePageIdx = 1;
  const sideCur = makeCursor(geo.sideX, geo.sideW, geo.sideTopY, geo.bottomMargin, (d, c) => {
    sidePageIdx += 1;
    if (sidePageIdx <= totalPages) {
      d.setPage(sidePageIdx);
    } else {
      d.addPage();
      paintWhitePage(d);
      paintSidebarBg(d);
    }
    c.y = c.topY;
  });
  renderSide(doc, sideCur);

  doc.setPage(doc.getNumberOfPages());
}

// ─── Text primitives ───────────────────────────────────────────────────────────

function looksLikeHeaderLine(text: string): boolean {
  return (
    /[|]/.test(text) ||
    /\d{4}\s*[-–]\s*(present|current|\d{4})/i.test(text) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.{0,30}\d{4}/i.test(text) ||
    /pvt|ltd|inc|llc|corp|technologies|services/i.test(text)
  );
}

function splitLeftAndDates(line: string): { left: string; dates: string | null } {
  const paren = line.match(/^(.+?)\s*[(\[]\s*([^)\]]*\d{4}[^)\]]*)\s*[)\]]\s*$/);
  if (paren) return { left: paren[1]!.trim(), dates: paren[2]!.trim() };

  const pipeParts = line.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const last = pipeParts[pipeParts.length - 1]!;
    if (/\d{4}/.test(last) || /present|current/i.test(last)) {
      return { left: pipeParts.slice(0, -1).join('  -  '), dates: last };
    }
  }

  const dash = line.match(
    /^(.+?)\s+[-–]\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}\s*[-–]\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}))\s*$/i,
  );
  if (dash) return { left: dash[1]!.trim(), dates: dash[2]!.trim() };

  return { left: line, dates: null };
}

function cleanContactDisplay(line: string): string {
  return line
    .replace(/^(e-?mail|phone|mobile|ph\.?\s*no\.?|linkedin|github|location|address|contact)\s*:\s*/i, '')
    .trim();
}

function sectionTitle(sec: ResumeSection, fallback: string): string {
  return sec.heading?.text ?? fallback;
}

function isSummaryLike(sec: ResumeSection): boolean {
  return /summary|objective|profile/i.test(sec.heading?.text ?? '');
}

function drawParagraph(doc: jsPDF, cur: Cursor, text: string, ink: RGB, fontSize = 9.5): void {
  const lineH = fontSize + 3.3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...ink);
  const wrapped = doc.splitTextToSize(text, cur.width);
  for (const wl of wrapped) {
    ensureSpace(doc, cur, lineH);
    doc.text(wl, cur.x, cur.y, TEXT_OPTS);
    cur.y += lineH;
  }
}

function drawBullet(doc: jsPDF, cur: Cursor, content: string, ink: RGB, bulletChar = '-', fontSize = 9.5): void {
  const indent = 11;
  const lineH = fontSize + 3.3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...ink);
  const wrapped = doc.splitTextToSize(content, cur.width - indent);
  ensureSpace(doc, cur, lineH);
  doc.text(bulletChar, cur.x, cur.y, TEXT_OPTS);
  doc.text(wrapped[0] ?? '', cur.x + indent, cur.y, TEXT_OPTS);
  cur.y += lineH;
  for (let i = 1; i < wrapped.length; i++) {
    ensureSpace(doc, cur, lineH);
    doc.text(wrapped[i], cur.x + indent, cur.y, TEXT_OPTS);
    cur.y += lineH;
  }
  cur.y += 2;
}

function drawLabeledLine(doc: jsPDF, cur: Cursor, label: string, value: string, ink: RGB, fontSize = 9.2): void {
  const lineH = fontSize + 3.3;
  ensureSpace(doc, cur, lineH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...ink);
  const labelText = `${label}: `;
  doc.text(labelText, cur.x, cur.y, TEXT_OPTS);
  const labelW = doc.getTextWidth(labelText);
  doc.setFont('helvetica', 'normal');
  const wrapped = doc.splitTextToSize(value, Math.max(20, cur.width - labelW));
  doc.text(wrapped[0] ?? '', cur.x + labelW, cur.y, TEXT_OPTS);
  cur.y += lineH;
  for (let i = 1; i < wrapped.length; i++) {
    ensureSpace(doc, cur, lineH);
    doc.text(wrapped[i], cur.x, cur.y, TEXT_OPTS);
    cur.y += lineH;
  }
}

function drawEntryHeader(doc: jsPDF, cur: Cursor, text: string, ink: RGB, stone: RGB, fontSize = 9.8): void {
  const { left, dates } = splitLeftAndDates(text);
  const lineH = fontSize + 3.2;
  ensureSpace(doc, cur, lineH + 5);
  cur.y += 4;
  ensureSpace(doc, cur, lineH);

  if (dates) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize - 1);
    doc.setTextColor(...stone);
    const dateW = doc.getTextWidth(dates);
    doc.text(dates, cur.x + cur.width - dateW, cur.y, TEXT_OPTS);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(...ink);
    const maxLeft = Math.max(30, cur.width - dateW - 10);
    const wrapped = doc.splitTextToSize(left, maxLeft);
    doc.text(wrapped[0] ?? '', cur.x, cur.y, TEXT_OPTS);
    cur.y += lineH;
    for (let i = 1; i < wrapped.length; i++) {
      ensureSpace(doc, cur, lineH);
      doc.text(wrapped[i], cur.x, cur.y, TEXT_OPTS);
      cur.y += lineH;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(...ink);
    const wrapped = doc.splitTextToSize(left, cur.width);
    for (const wl of wrapped) {
      ensureSpace(doc, cur, lineH);
      doc.text(wl, cur.x, cur.y, TEXT_OPTS);
      cur.y += lineH;
    }
  }
  cur.y += 1;
}

/** Draws every line of a section using its parsed `kind` (mirrors the on-screen SectionLines component). */
function drawSectionLines(
  doc: jsPDF,
  cur: Cursor,
  section: ResumeSection,
  ink: RGB,
  stone: RGB,
  opts?: { bulletChar?: string; fontSize?: number },
): void {
  const bulletChar = opts?.bulletChar ?? '-';
  const fontSize = opts?.fontSize ?? 9.5;
  for (const line of section.lines) {
    const isEntry =
      line.kind === 'entryHeading' ||
      (line.kind !== 'bullet' && line.kind !== 'skill' && looksLikeHeaderLine(line.text));
    if (isEntry) {
      drawEntryHeader(doc, cur, line.text, ink, stone, fontSize + 0.3);
    } else if (line.kind === 'bullet') {
      drawBullet(doc, cur, line.content, ink, bulletChar, fontSize);
    } else if (line.kind === 'skill' && line.label) {
      drawLabeledLine(doc, cur, line.label, line.value ?? '', ink, fontSize);
    } else {
      drawParagraph(doc, cur, line.text, ink, fontSize);
    }
  }
}

function drawSectionHeader(
  doc: jsPDF,
  cur: Cursor,
  title: string,
  color: RGB,
  opts?: { centered?: boolean; ruleWidth?: number },
): void {
  ensureSpace(doc, cur, 26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.6);
  doc.setTextColor(...color);
  if (opts?.centered) {
    const cx = cur.x + cur.width / 2;
    doc.text(title.toUpperCase(), cx, cur.y, { align: 'center' });
    cur.y += 4;
    const ruleW = opts.ruleWidth ?? 60;
    doc.setDrawColor(...color);
    doc.setLineWidth(1.1);
    doc.line(cx - ruleW / 2, cur.y, cx + ruleW / 2, cur.y);
  } else {
    doc.text(title.toUpperCase(), cur.x, cur.y, TEXT_OPTS);
    cur.y += 4;
    doc.setFillColor(...color);
    doc.rect(cur.x, cur.y, opts?.ruleWidth ?? cur.width, 0.9, 'F');
  }
  cur.y += 11;
}

function drawSidebarHeading(doc: jsPDF, cur: Cursor, title: string, color: RGB): void {
  ensureSpace(doc, cur, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.3);
  doc.setTextColor(...color);
  doc.text(title.toUpperCase(), cur.x, cur.y, TEXT_OPTS);
  cur.y += 11;
}

function drawContactBlock(
  doc: jsPDF,
  cur: Cursor,
  contactLines: ResumeLine[],
  headingColor: RGB,
  ink: RGB,
): void {
  if (contactLines.length === 0) return;
  drawSidebarHeading(doc, cur, 'Contact', headingColor);
  for (const line of contactLines) {
    drawParagraph(doc, cur, cleanContactDisplay(line.text), ink, 8.6);
  }
  cur.y += 6;
}

function drawSidebarSectionBlock(
  doc: jsPDF,
  cur: Cursor,
  title: string,
  sections: ResumeSection[],
  headingColor: RGB,
  ink: RGB,
  stone: RGB,
  bulletChar = '\u2022',
): void {
  if (sections.length === 0) return;
  drawSidebarHeading(doc, cur, title, headingColor);
  for (const sec of sections) {
    drawSectionLines(doc, cur, sec, ink, stone, { bulletChar, fontSize: 8.6 });
  }
  cur.y += 6;
}

function drawAvatar(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  bg: RGB,
  textColor: RGB,
  initials: string,
  fontSize = 13,
): void {
  doc.setFillColor(...bg);
  doc.circle(cx, cy, r, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...textColor);
  const w = doc.getTextWidth(initials);
  doc.text(initials, cx - w / 2, cy + fontSize * 0.34);
}

function drawSkillBars(
  doc: jsPDF,
  cur: Cursor,
  sections: ResumeSection[],
  headingColor: RGB,
  ink: RGB,
  accent: RGB,
): void {
  for (const sec of sections) {
    drawSidebarHeading(doc, cur, sectionTitle(sec, 'Skills'), headingColor);
    sec.lines.forEach((line, li) => {
      const label = line.kind === 'skill' && line.label ? line.label : line.text.split(':')[0]?.trim() || line.text;
      const pct = 55 + ((li * 17) % 40);
      ensureSpace(doc, cur, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.setTextColor(...ink);
      doc.text(label, cur.x, cur.y, TEXT_OPTS);
      cur.y += 5;
      doc.setFillColor(255, 255, 255);
      doc.rect(cur.x, cur.y, cur.width, 3.4, 'F');
      doc.setFillColor(...accent);
      doc.rect(cur.x, cur.y, cur.width * (pct / 100), 3.4, 'F');
      cur.y += 10;
    });
    cur.y += 4;
  }
}

function drawSkillPills(
  doc: jsPDF,
  cur: Cursor,
  sections: ResumeSection[],
  headingColor: RGB,
  pillBg: RGB,
  pillText: RGB,
): void {
  for (const sec of sections) {
    drawSectionHeader(doc, cur, sectionTitle(sec, 'Skills'), headingColor);
    const items: string[] = [];
    for (const line of sec.lines) {
      const raw = line.kind === 'skill' && line.value ? line.value : line.text.replace(/^[^:]+:\s*/, '');
      items.push(...raw.split(/[,;|\u00b7]/).map((s) => s.trim()).filter(Boolean));
    }
    if (items.length === 0) continue;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const pillH = 15;
    const padX = 7;
    const gapX = 6;
    const gapY = 7;
    let x = cur.x;
    ensureSpace(doc, cur, pillH + gapY);
    let rowTop = cur.y - 9;
    for (const item of items) {
      const textW = doc.getTextWidth(item);
      const pillW = textW + padX * 2;
      if (x + pillW > cur.x + cur.width) {
        x = cur.x;
        cur.y += pillH + gapY;
        ensureSpace(doc, cur, pillH + gapY);
        rowTop = cur.y - 9;
      }
      doc.setFillColor(...pillBg);
      doc.roundedRect(x, rowTop, pillW, pillH, pillH / 2, pillH / 2, 'F');
      doc.setTextColor(...pillText);
      doc.text(item, x + padX, rowTop + pillH - 4.3, TEXT_OPTS);
      x += pillW + gapX;
    }
    cur.y += pillH + 6;
  }
}

function drawPlainHeader(
  doc: jsPDF,
  cur: Cursor,
  model: ResumeLayoutModel,
  p: Palette,
  opts?: { nameFont?: 'helvetica' | 'times'; showContact?: boolean; centered?: boolean },
): void {
  const nameFont = opts?.nameFont ?? 'helvetica';
  const centered = opts?.centered ?? false;
  const align = centered ? ('center' as const) : ('left' as const);
  const tx = centered ? cur.x + cur.width / 2 : cur.x;
  const name = model.name?.text ?? '';

  if (name) {
    doc.setFont(nameFont, 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...p.name);
    const wrapped = doc.splitTextToSize(name.toUpperCase(), cur.width);
    for (const wl of wrapped) {
      ensureSpace(doc, cur, 21);
      doc.text(wl, tx, cur.y, { align });
      cur.y += 21;
    }
  }

  if (model.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...p.title);
    const wrapped = doc.splitTextToSize(model.title.text, cur.width);
    for (const wl of wrapped) {
      ensureSpace(doc, cur, 13);
      doc.text(wl, tx, cur.y, { align });
      cur.y += 13;
    }
  }

  if (opts?.showContact !== false && model.contactLines.length > 0) {
    cur.y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...p.contact);
    const joined = model.contactLines.map((l) => cleanContactDisplay(l.text)).join('   |   ');
    const wrapped = doc.splitTextToSize(joined, cur.width);
    for (const wl of wrapped) {
      ensureSpace(doc, cur, 11);
      doc.text(wl, tx, cur.y, { align });
      cur.y += 11;
    }
  }
}

// ─── Layout: teal-sidebar (Teal Engineer) ─────────────────────────────────────

function renderTealSidebar(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  const name = model.name?.text || 'Candidate';
  const sideW = PAGE_W * 0.35;
  const sidePad = 22;
  const mainX = sideW + 26;
  const mainW = PAGE_W - mainX - 44;
  const bottomMargin = 44;

  paintWhitePage(doc);
  doc.setFillColor(...p.sidebarBg);
  doc.rect(0, 0, sideW, PAGE_H, 'F');
  drawAvatar(doc, sidePad + 22, 56, 22, p.accent, p.white, initialsFromName(name));

  renderTwoColumnBody(
    doc,
    { mainX, mainW, mainTopY: 44, sideX: 0, sideW, sideTopY: 96, bottomMargin },
    p.sidebarBg,
    (d, cur) => {
      drawPlainHeader(d, cur, model, p, { showContact: false });
      cur.y += 8;
      const bodySections = [...model.experienceSections, ...model.otherSections.filter((s) => !isSummaryLike(s))];
      for (const sec of bodySections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Experience'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
      if (model.summaryText) {
        drawSectionHeader(d, cur, 'Additional', p.section);
        drawSectionLines(d, cur, model.summaryText, p.ink, p.stone);
        cur.y += 10;
      }
      for (const sec of model.skillsSections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Skills'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
    },
    (d, cur) => {
      cur.x = sidePad;
      cur.width = sideW - sidePad * 2;
      drawContactBlock(d, cur, model.contactLines, p.section, p.sidebarInk);
      drawSidebarSectionBlock(d, cur, 'Education', model.educationSections, p.section, p.sidebarInk, p.stone);
      drawSidebarSectionBlock(d, cur, 'Certifications', model.certificationsSections, p.section, p.sidebarInk, p.stone);
    },
  );
}

// ─── Layout: navy-gold (Navy & Gold Sales) ────────────────────────────────────

function renderNavyGold(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  paintWhitePage(doc);

  const mL = 46;
  const bandW = PAGE_W - mL * 2;
  let headerH = 30;
  if (model.name) headerH += 22;
  if (model.title) headerH += 15;
  if (model.contactLines.length) headerH += 14;
  headerH = Math.max(86, headerH + 14);

  doc.setFillColor(...p.bandBg);
  doc.rect(0, 0, PAGE_W, headerH, 'F');
  doc.setFillColor(...p.bandAccent);
  doc.rect(0, headerH - 3, PAGE_W, 3, 'F');

  let y = 32;
  const name = model.name?.text || 'Candidate';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...p.bandName);
  doc.text(name.toUpperCase(), mL, y, TEXT_OPTS);
  y += 20;
  if (model.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...p.bandTitle);
    doc.text(model.title.text.toUpperCase(), mL, y, TEXT_OPTS);
    y += 14;
  }
  if (model.contactLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...p.bandContact);
    const joined = model.contactLines.map((l) => cleanContactDisplay(l.text)).join('   |   ');
    const wrapped = doc.splitTextToSize(joined, bandW);
    for (const wl of wrapped.slice(0, 2)) {
      doc.text(wl, mL, y, TEXT_OPTS);
      y += 11;
    }
  }

  const topY = headerH + 22;
  const sideW = PAGE_W * 0.32;
  const sideX = PAGE_W - sideW;
  const mainX = mL;
  const mainW = sideX - mainX - 20;

  doc.setFillColor(...p.sidebarBg);
  doc.rect(sideX, headerH, sideW, PAGE_H - headerH, 'F');

  renderTwoColumnBody(
    doc,
    { mainX, mainW, mainTopY: topY, sideX, sideW, sideTopY: topY, bottomMargin: 44 },
    p.sidebarBg,
    (d, cur) => {
      if (model.summaryText) {
        drawSectionHeader(d, cur, sectionTitle(model.summaryText, 'Summary'), p.section);
        drawSectionLines(d, cur, model.summaryText, p.ink, p.stone);
        cur.y += 10;
      }
      for (const sec of [...model.experienceSections, ...model.otherSections]) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Experience'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
      for (const sec of model.educationSections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Education'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
    },
    (d, cur) => {
      cur.x = sideX + 22;
      cur.width = sideW - 44;
      drawSkillBars(d, cur, model.skillsSections, p.section, p.sidebarInk, p.accent);
      drawSidebarSectionBlock(d, cur, 'Certifications', model.certificationsSections, p.section, p.sidebarInk, p.stone);
      drawSidebarSectionBlock(d, cur, 'Languages', model.languagesSections, p.section, p.sidebarInk, p.stone);
    },
  );
}

// ─── Layout: modern-summary ────────────────────────────────────────────────────

function renderModernSummary(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  paintWhitePage(doc);

  const mL = 46;
  const mR = 46;
  const headerCur = makeCursor(mL, PAGE_W - mL - mR, 42, 44, defaultOnBreak);
  drawPlainHeader(doc, headerCur, model, p, { showContact: false });
  let y = headerCur.y + 6;

  if (model.summaryText) {
    const bandX = mL - 6;
    const bandW = PAGE_W - bandX - (mR - 6);
    const bandPad = 14;
    const avatarD = 30;
    const textX = bandX + bandPad + avatarD + 10;
    const textW = bandW - bandPad * 2 - avatarD - 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.3);
    const lines = model.summaryText.lines.flatMap((l) => doc.splitTextToSize(l.content || l.text, textW));
    const bandH = Math.max(46, lines.length * 12 + bandPad * 2 - 4);
    doc.setFillColor(...p.summaryBand);
    doc.rect(bandX, y, bandW, bandH, 'F');
    drawAvatar(doc, bandX + bandPad + avatarD / 2, y + bandH / 2, avatarD / 2, p.section, p.white, initialsFromName(model.name?.text || 'C'), 11);
    doc.setTextColor(...p.ink);
    let ty = y + bandPad + 2;
    for (const l of lines) {
      doc.text(l, textX, ty, TEXT_OPTS);
      ty += 12;
    }
    y += bandH + 18;
  } else {
    y += 6;
  }

  const sideW = PAGE_W * 0.34;
  const sideX = 0;
  const mainX = sideW + 24;
  const mainW = PAGE_W - mainX - 44;

  doc.setFillColor(...p.sidebarBg);
  doc.rect(sideX, y, sideW, PAGE_H - y, 'F');

  renderTwoColumnBody(
    doc,
    { mainX, mainW, mainTopY: y + 4, sideX, sideW, sideTopY: y + 20, bottomMargin: 44 },
    p.sidebarBg,
    (d, cur) => {
      for (const sec of model.experienceSections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Experience'), p.section);
        const startPage = d.getNumberOfPages();
        const startY = cur.y;
        for (const line of sec.lines) {
          const isEntry = line.kind === 'entryHeading' || (line.kind !== 'bullet' && looksLikeHeaderLine(line.text));
          if (isEntry) {
            const dotY = cur.y;
            const pageBefore = d.getNumberOfPages();
            drawEntryHeader(d, cur, line.text, p.ink, p.stone);
            if (d.getNumberOfPages() === pageBefore) {
              d.setFillColor(255, 255, 255);
              d.setDrawColor(...p.section);
              d.setLineWidth(1.1);
              d.circle(cur.x - 9, dotY + 1, 2.6, 'FD');
            }
          } else if (line.kind === 'bullet') {
            drawBullet(d, cur, line.content, p.ink, '-', 9.3);
          } else {
            drawParagraph(d, cur, line.text, p.ink, 9.3);
          }
        }
        if (d.getNumberOfPages() === startPage) {
          d.setDrawColor(...p.section);
          d.setLineWidth(1);
          d.line(cur.x - 9, startY - 8, cur.x - 9, cur.y - 4);
        }
        cur.y += 12;
      }
      for (const sec of model.otherSections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Details'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
    },
    (d, cur) => {
      cur.x = 22;
      cur.width = sideW - 44;
      drawContactBlock(d, cur, model.contactLines, p.section, p.ink);
      drawSidebarSectionBlock(d, cur, 'Education', model.educationSections, p.section, p.ink, p.stone);
      drawSidebarSectionBlock(d, cur, 'Skills', model.skillsSections, p.section, p.ink, p.stone);
      drawSidebarSectionBlock(d, cur, 'Languages', model.languagesSections, p.section, p.ink, p.stone);
    },
  );
}

// ─── Layout: nursing-clean ─────────────────────────────────────────────────────

function renderNursingClean(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  paintWhitePage(doc);

  const mL = 56;
  const mR = 56;
  const width = PAGE_W - mL - mR;
  const cur = makeCursor(mL, width, 46, 48, defaultOnBreak);

  drawPlainHeader(doc, cur, model, p, { centered: true });
  cur.y += 8;

  const allSections = [
    model.summaryText,
    ...model.experienceSections,
    ...model.educationSections,
    ...model.skillsSections,
    ...model.certificationsSections,
    ...model.languagesSections,
    ...model.otherSections,
  ].filter((s): s is ResumeSection => Boolean(s));

  for (const sec of allSections) {
    cur.y += 6;
    drawSectionHeader(doc, cur, sectionTitle(sec, 'Section'), p.section, { centered: true, ruleWidth: 60 });
    drawSectionLines(doc, cur, sec, p.ink, p.stone);
  }
}

// ─── Layout: blue-border ────────────────────────────────────────────────────────

function renderBlueBorder(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  const borderMargin = 18;
  const innerPad = 20;
  const mL = borderMargin + innerPad;
  const mR = borderMargin + innerPad;
  const width = PAGE_W - mL - mR;
  const bottomMargin = borderMargin + 20;

  const paintChrome = (d: jsPDF) => {
    paintWhitePage(d);
    d.setDrawColor(...p.border);
    d.setLineWidth(1.6);
    d.rect(borderMargin, borderMargin, PAGE_W - borderMargin * 2, PAGE_H - borderMargin * 2, 'S');
  };
  paintChrome(doc);

  const cur = makeCursor(mL, width, borderMargin + 26, bottomMargin, (d, c) => {
    d.addPage();
    paintChrome(d);
    c.y = c.topY;
  });

  const name = model.name?.text || 'Candidate';
  drawAvatar(doc, cur.x + 18, cur.y + 16, 18, p.section, p.white, initialsFromName(name));
  const headerTextX = cur.x + 46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(...p.name);
  doc.text(name.toUpperCase(), headerTextX, cur.y + 10, TEXT_OPTS);
  if (model.title) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...p.title);
    doc.text(model.title.text, headerTextX, cur.y + 24, TEXT_OPTS);
  }
  cur.y += 44;

  if (model.contactLines.length > 0) {
    const items = model.contactLines.map((l) => cleanContactDisplay(l.text)).filter(Boolean);
    const joined = items.join('   |   ');
    const barH = 18;
    ensureSpace(doc, cur, barH + 10);
    doc.setFillColor(...p.bandBg);
    doc.rect(cur.x, cur.y, cur.width, barH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...p.contact);
    doc.text(joined, cur.x + cur.width / 2, cur.y + barH / 2 + 3, { align: 'center' });
    cur.y += barH + 14;
  }

  const allSections = [
    model.summaryText,
    ...model.experienceSections,
    ...model.educationSections,
    ...model.certificationsSections,
    ...model.languagesSections,
    ...model.otherSections,
  ].filter((s): s is ResumeSection => Boolean(s));

  for (const sec of allSections) {
    drawSectionHeader(doc, cur, sectionTitle(sec, 'Section'), p.section);
    drawSectionLines(doc, cur, sec, p.ink, p.stone);
    cur.y += 10;
  }

  if (model.skillsSections.length > 0) {
    drawSkillPills(doc, cur, model.skillsSections, p.section, p.pillBg, p.pillText);
  }
}

// ─── Layout: peach-sidebar (Peach Executive) ──────────────────────────────────

function renderPeachSidebar(doc: jsPDF, model: ResumeLayoutModel, theme: ResumeTheme): void {
  const p = buildPalette(theme);
  const name = model.name?.text || 'Candidate';
  const sideW = PAGE_W * 0.34;
  const sidePad = 22;
  const mainX = sideW + 26;
  const mainW = PAGE_W - mainX - 44;
  const bottomMargin = 44;

  paintWhitePage(doc);
  doc.setFillColor(...p.sidebarBg);
  doc.rect(0, 0, sideW, PAGE_H, 'F');
  drawAvatar(doc, sidePad + 22, 56, 22, p.accent, p.white, initialsFromName(name));

  renderTwoColumnBody(
    doc,
    { mainX, mainW, mainTopY: 44, sideX: 0, sideW, sideTopY: 96, bottomMargin },
    p.sidebarBg,
    (d, cur) => {
      drawPlainHeader(d, cur, model, p, { showContact: false, nameFont: 'times' });
      cur.y += 8;
      if (model.summaryText) {
        drawSectionLines(d, cur, model.summaryText, p.ink, p.stone);
        cur.y += 10;
      }
      for (const sec of [...model.experienceSections, ...model.otherSections]) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Experience'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone);
        cur.y += 10;
      }
      for (const sec of model.certificationsSections) {
        drawSectionHeader(d, cur, sectionTitle(sec, 'Certifications'), p.section);
        drawSectionLines(d, cur, sec, p.ink, p.stone, { bulletChar: '\u2022' });
        cur.y += 10;
      }
      if (model.languagesSections.length > 0) {
        drawSidebarSectionBlock(d, cur, 'Languages', model.languagesSections, p.section, p.ink, p.stone);
      }
    },
    (d, cur) => {
      cur.x = sidePad;
      cur.width = sideW - sidePad * 2;
      drawContactBlock(d, cur, model.contactLines, p.section, p.sidebarInk);
      drawSidebarSectionBlock(d, cur, 'Education', model.educationSections, p.section, p.sidebarInk, p.stone);
      drawSidebarSectionBlock(d, cur, 'Skills', model.skillsSections, p.section, p.sidebarInk, p.stone);
    },
  );
}

// ─── Dispatcher ────────────────────────────────────────────────────────────────

/** Render `resumeText` into `doc` using the structural chrome + colors of `theme`. */
export function renderResumePdfByLayout(doc: jsPDF, resumeText: string, theme: ResumeTheme): void {
  const sanitized = sanitizeResumePlainText(resumeText);
  const parsedDoc = parseResumeDocument(sanitized);
  const model = buildResumeLayoutModel(parsedDoc);

  doc.setProperties({
    title: model.name?.text || '',
    author: model.name?.text || '',
    subject: model.title?.text || '',
    creator: 'Hyred',
  });

  switch (theme.layout) {
    case 'teal-sidebar':
      renderTealSidebar(doc, model, theme);
      break;
    case 'navy-gold':
      renderNavyGold(doc, model, theme);
      break;
    case 'modern-summary':
      renderModernSummary(doc, model, theme);
      break;
    case 'blue-border':
      renderBlueBorder(doc, model, theme);
      break;
    case 'peach-sidebar':
      renderPeachSidebar(doc, model, theme);
      break;
    case 'nursing-clean':
    default:
      renderNursingClean(doc, model, theme);
      break;
  }
}

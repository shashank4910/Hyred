/**
 * Beautiful PDF Resume Generator
 *
 * Parses the ATS plain-text resume (which uses SECTION HEADERS IN CAPS
 * and "- " bullet points) into a professionally designed PDF using jsPDF.
 *
 * Features:
 * - Clean two-tone header with name + contact info
 * - Accent-colored section dividers
 * - Proper typography hierarchy
 * - Skill tags rendered as pill badges
 * - Consistent spacing and margins
 * - Fits nicely on 1-2 pages
 */

import { jsPDF } from 'jspdf';

// ─── Design Tokens ──────────────────────────────────────────────────────────

const COLORS = {
  primary: [34, 139, 96] as RGB,       // Teal/green accent
  primaryLight: [235, 250, 244] as RGB, // Very light green for header bg
  heading: [20, 24, 29] as RGB,         // Near-black for headings
  body: [45, 55, 72] as RGB,            // Dark gray for body text
  muted: [107, 114, 128] as RGB,        // Gray for secondary text
  accent: [34, 139, 96] as RGB,         // Same as primary for bullets
  white: [255, 255, 255] as RGB,
  headerBg: [24, 30, 38] as RGB,        // Dark header background
  headerText: [255, 255, 255] as RGB,   // White text on dark header
  tagBg: [235, 250, 244] as RGB,        // Light green for skill tags
  tagText: [34, 139, 96] as RGB,        // Green text for skill tags
  divider: [229, 231, 235] as RGB,      // Light gray divider
};

type RGB = [number, number, number];

const FONTS = {
  heading: 'helvetica',
  body: 'helvetica',
};

const LAYOUT = {
  pageWidth: 595.28,  // A4 pt
  pageHeight: 841.89, // A4 pt
  marginLeft: 48,
  marginRight: 48,
  marginTop: 48,
  marginBottom: 56,
  headerHeight: 80,
  sectionGap: 16,
  lineHeight: 14,
  bulletIndent: 12,
};

// ─── Parser ─────────────────────────────────────────────────────────────────

type ResumeSection = {
  title: string;
  lines: string[];
};

type ParsedResume = {
  name: string;
  contactLines: string[];
  sections: ResumeSection[];
};

function parseResumeText(text: string): ParsedResume {
  const lines = text.split('\n');
  let name = '';
  const contactLines: string[] = [];
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | null = null;
  let inHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines at the very start
    if (i === 0 && !line) continue;

    // First non-empty line is typically the name
    if (!name && line && inHeader) {
      name = line;
      continue;
    }

    // Contact info lines (email, phone, location, linkedin) before first section
    if (inHeader) {
      if (isSectionHeader(line)) {
        inHeader = false;
        currentSection = { title: cleanSectionTitle(line), lines: [] };
        sections.push(currentSection);
        continue;
      }
      if (line) {
        contactLines.push(line);
      }
      continue;
    }

    // Section headers (ALL CAPS lines with 3+ chars)
    if (isSectionHeader(line)) {
      currentSection = { title: cleanSectionTitle(line), lines: [] };
      sections.push(currentSection);
      continue;
    }

    // Content lines
    if (currentSection && line) {
      currentSection.lines.push(line);
    }
  }

  return { name, contactLines, sections };
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  // ALL CAPS with possible spaces, ampersands, slashes
  return /^[A-Z\s&\/\-]+$/.test(trimmed) && trimmed.length >= 3;
}

function cleanSectionTitle(line: string): string {
  return line.trim().replace(/[-=]+$/g, '').trim();
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

export function generateBeautifulPdf(resumeText: string): jsPDF {
  const parsed = parseResumeText(resumeText);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const contentWidth = LAYOUT.pageWidth - LAYOUT.marginLeft - LAYOUT.marginRight;

  let y = LAYOUT.marginTop;

  // ─── Header Block ──────────────────────────────────────────────────────
  // Dark header background
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, LAYOUT.pageWidth, LAYOUT.headerHeight + 20, 'F');

  // Accent bar at top
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, LAYOUT.pageWidth, 4, 'F');

  // Name
  doc.setFont(FONTS.heading, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.headerText);
  y = 42;
  doc.text(parsed.name || 'Resume', LAYOUT.marginLeft, y);

  // Contact info - single line or two lines
  doc.setFont(FONTS.body, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 220);
  y += 22;

  const contactStr = parsed.contactLines.join('  |  ');
  if (contactStr.length > 90) {
    // Split into two lines
    const mid = Math.ceil(parsed.contactLines.length / 2);
    const line1 = parsed.contactLines.slice(0, mid).join('  |  ');
    const line2 = parsed.contactLines.slice(mid).join('  |  ');
    doc.text(line1, LAYOUT.marginLeft, y);
    y += 13;
    doc.text(line2, LAYOUT.marginLeft, y);
  } else {
    doc.text(contactStr, LAYOUT.marginLeft, y);
  }

  y = LAYOUT.headerHeight + 20 + 20; // Below header with some padding

  // ─── Body Sections ─────────────────────────────────────────────────────
  for (let si = 0; si < parsed.sections.length; si++) {
    const section = parsed.sections[si];

    // Check if we need a new page
    if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 60) {
      doc.addPage();
      y = LAYOUT.marginTop;
    }

    // Section divider
    if (si > 0) {
      y += 6;
    }

    // Section header with accent line
    doc.setFillColor(...COLORS.primary);
    doc.rect(LAYOUT.marginLeft, y, contentWidth, 1.5, 'F');
    y += 12;

    doc.setFont(FONTS.heading, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.heading);
    doc.text(section.title, LAYOUT.marginLeft, y);
    y += 16;

    // Section content
    const isSkillsSection = /skill|tech|competenc/i.test(section.title);

    if (isSkillsSection) {
      // Render skills as tags/pills
      y = renderSkillTags(doc, section.lines, y, contentWidth);
    } else {
      y = renderSectionContent(doc, section.lines, y, contentWidth);
    }

    y += LAYOUT.sectionGap;
  }

  return doc;
}

function renderSkillTags(
  doc: jsPDF,
  lines: string[],
  startY: number,
  contentWidth: number,
): number {
  let y = startY;

  // Combine all lines into skills
  const allSkills: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-•*]\s*/, '');
    // Split by commas, pipes, or "•"
    const parts = cleaned.split(/[,|•]+/).map(s => s.trim()).filter(Boolean);
    allSkills.push(...parts);
  }

  if (allSkills.length === 0) {
    // Fallback: render as regular text
    return renderSectionContent(doc, lines, startY, contentWidth);
  }

  // Render as pill tags
  const tagHeight = 17;
  const tagPaddingX = 8;
  const tagGapX = 6;
  const tagGapY = 6;
  let x = LAYOUT.marginLeft;
  const maxX = LAYOUT.marginLeft + contentWidth;

  doc.setFont(FONTS.body, 'normal');
  doc.setFontSize(8.5);

  for (const skill of allSkills) {
    const textWidth = doc.getTextWidth(skill);
    const tagWidth = textWidth + tagPaddingX * 2;

    // Wrap to next line if doesn't fit
    if (x + tagWidth > maxX) {
      x = LAYOUT.marginLeft;
      y += tagHeight + tagGapY;

      // Check page break
      if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 30) {
        doc.addPage();
        y = LAYOUT.marginTop;
      }
    }

    // Draw tag background (rounded rect)
    doc.setFillColor(...COLORS.tagBg);
    doc.roundedRect(x, y - 11, tagWidth, tagHeight, 3, 3, 'F');

    // Draw tag border
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y - 11, tagWidth, tagHeight, 3, 3, 'S');

    // Draw tag text
    doc.setTextColor(...COLORS.tagText);
    doc.text(skill, x + tagPaddingX, y + 1);

    x += tagWidth + tagGapX;
  }

  y += tagHeight + 4;
  return y;
}

function renderSectionContent(
  doc: jsPDF,
  lines: string[],
  startY: number,
  contentWidth: number,
): number {
  let y = startY;

  for (const line of lines) {
    // Check page break
    if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 20) {
      doc.addPage();
      y = LAYOUT.marginTop;
    }

    const isBullet = /^[-•*]\s/.test(line);
    const isSubheading = isJobTitleLine(line);

    if (isSubheading) {
      // Job title / company line — bold, slightly larger
      y += 4;
      doc.setFont(FONTS.heading, 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.heading);

      const wrappedLines = doc.splitTextToSize(line, contentWidth);
      for (const wl of wrappedLines) {
        if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 20) {
          doc.addPage();
          y = LAYOUT.marginTop;
        }
        doc.text(wl, LAYOUT.marginLeft, y);
        y += LAYOUT.lineHeight;
      }
      y += 2;
    } else if (isBullet) {
      // Bullet point
      const text = line.replace(/^[-•*]\s*/, '');
      const bulletX = LAYOUT.marginLeft + 4;
      const textX = LAYOUT.marginLeft + LAYOUT.bulletIndent;
      const bulletWidth = contentWidth - LAYOUT.bulletIndent;

      // Draw accent bullet dot
      doc.setFillColor(...COLORS.accent);
      doc.circle(bulletX + 1.5, y - 3, 2, 'F');

      // Draw text
      doc.setFont(FONTS.body, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.body);

      const wrappedLines = doc.splitTextToSize(text, bulletWidth);
      for (let i = 0; i < wrappedLines.length; i++) {
        if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 20) {
          doc.addPage();
          y = LAYOUT.marginTop;
        }
        doc.text(wrappedLines[i], i === 0 ? textX : textX, y);
        y += LAYOUT.lineHeight - 1;
      }
      y += 3;
    } else {
      // Regular text line (dates, descriptions)
      doc.setFont(FONTS.body, 'normal');
      doc.setFontSize(9);

      // Check if it looks like a date/duration line
      if (/\d{4}|present|current/i.test(line) && line.length < 60) {
        doc.setTextColor(...COLORS.muted);
        doc.setFontSize(8.5);
      } else {
        doc.setTextColor(...COLORS.body);
      }

      const wrappedLines = doc.splitTextToSize(line, contentWidth);
      for (const wl of wrappedLines) {
        if (y > LAYOUT.pageHeight - LAYOUT.marginBottom - 20) {
          doc.addPage();
          y = LAYOUT.marginTop;
        }
        doc.text(wl, LAYOUT.marginLeft, y);
        y += LAYOUT.lineHeight - 1;
      }
      y += 2;
    }
  }

  return y;
}

/**
 * Heuristic: detect job title / company lines
 * e.g. "Senior Engineer — Google (2020–2024)"
 * or "Performance Engineer | Company Name"
 */
function isJobTitleLine(line: string): boolean {
  // Contains a dash/pipe separating title from company, or has date range
  const hasCompanyPatterns =
    /[—–|]/.test(line) ||
    /\(\d{4}/.test(line) ||
    /\d{4}\s*[-–]\s*(present|\d{4})/i.test(line);

  const isBullet = /^[-•*]\s/.test(line);
  const isShort = line.length < 120;

  return !isBullet && isShort && hasCompanyPatterns;
}

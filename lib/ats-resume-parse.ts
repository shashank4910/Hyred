/**
 * Structured resume parse for evidence-grounded ATS.
 * Deterministic extract only — no meaning / spelling / skill dictionaries.
 */

export interface ParsedContact {
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  location?: string;
}

export interface ParsedSection {
  label: string;
  found: boolean;
  required: boolean;
}

export interface ParsedResume {
  /** Ligature-normalized, CRLF-normalized text */
  text: string;
  lines: string[];
  wordCount: number;
  charCount: number;
  contact: ParsedContact;
  sections: ParsedSection[];
  bulletCount: number;
  /** Experience-like lines that are not proper bullets */
  proseDutyLines: string[];
  /** Date-like tokens found (MM/YYYY, Month YYYY, YYYY–YYYY, etc.) */
  dateTokens: string[];
  /** True when at least one token includes a month (name or MM/) */
  hasMonthInDates: boolean;
  /** Years present without any month nearby on the same line */
  yearOnlyDateLines: string[];
}

const BULLET_CHARS = '-•*→⁃▪▸▹►‣∙○●';
const BULLET_RE = new RegExp(`^[${BULLET_CHARS}]`);

/**
 * Canonical section tokens — NOT a synonym zoo of company/resume quirks.
 * A short heading line that CONTAINS these words counts (e.g. "Accenture Experience").
 */
const CANONICAL_SECTIONS: Array<{
  label: string;
  token: RegExp;
  required: boolean;
}> = [
  {
    label: 'Experience',
    token: /\b(experiences?|employment|work\s+history)\b/i,
    required: true,
  },
  {
    label: 'Education',
    token: /\b(educations?|educational|academic)\b/i,
    required: true,
  },
  {
    label: 'Skills',
    token: /\b(skills?|expertise|competencies|technologies)\b/i,
    required: true,
  },
  {
    label: 'Summary',
    token: /\b(summary|profile|objective)\b/i,
    required: false,
  },
  { label: 'Projects', token: /\bprojects?\b/i, required: false },
  {
    label: 'Certifications',
    token: /\b(certifications?|licenses?)\b/i,
    required: false,
  },
];

/** Short line that looks like a section heading (not a body sentence). */
export function isLikelySectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 72) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/@|https?:\/\//i.test(t)) return false;
  if (/^[\d•\-*]/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 10) return false;
  // Reject long prose that happens to include "experience"
  if (words.length >= 6 && /^(the|a|an|i|my|with|over|demonstrated)\b/i.test(t)) {
    return false;
  }
  return true;
}

function extractSections(lines: string[]): ParsedSection[] {
  const headings = lines.map((l) => l.trim()).filter(isLikelySectionHeading);
  return CANONICAL_SECTIONS.map(({ label, token, required }) => ({
    label,
    required,
    found: headings.some((h) => token.test(h)),
  }));
}

/** Normalize PDF ligatures and line endings so substring grounding works. */
export function normalizeResumeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Common Latin ligatures from PDF extractors
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function extractContact(text: string): ParsedContact {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const phoneRaw = text.match(
    /(\+?\d{1,3}[\s.-]?)?(\(?\d{3,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,6}\b/,
  )?.[0]?.trim();
  const phoneDigits = phoneRaw ? phoneRaw.replace(/\D/g, '') : '';
  const phone = phoneDigits.length >= 8 ? phoneRaw : undefined;
  const linkedin = text.match(/linkedin\.com\/[A-Za-z0-9/_-]+/i)?.[0];
  const github = text.match(/github\.com\/[A-Za-z0-9/_-]+/i)?.[0];
  const top = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(' ');
  const location = top.match(
    /\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)?),\s*([A-Z][a-zA-Z]{1,}(?:\s[A-Z][a-z]+)*)\b/,
  )?.[0];

  return {
    email,
    phone,
    linkedin,
    github,
    location,
  };
}

function countBullets(lines: string[]): number {
  return lines.filter((l) => {
    const t = l.trim();
    return BULLET_RE.test(t) || /^\d+[.)]\s/.test(t);
  }).length;
}

function findProseDutyLines(text: string, limit = 5): string[] {
  const lines = text.split('\n');
  const expIdx = lines.findIndex((l) => {
    const t = l.trim();
    return isLikelySectionHeading(t) && /\b(experiences?|employment|work\s+history)\b/i.test(t);
  });
  const start = expIdx >= 0 ? expIdx + 1 : 0;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length < 28) continue;
    if (isLikelySectionHeading(t)) break;
    if (BULLET_RE.test(t) || /^\d+[.)]\s/.test(t)) continue;
    if (/@|linkedin\.com|^\+?\d[\d\s().-]{7,}/i.test(t)) continue;
    if (/^\d{1,2}\/\d{4}/.test(t) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t))
      continue;
    out.push(t.length > 140 ? `${t.slice(0, 137)}…` : t);
    if (out.length >= limit) break;
  }
  return out;
}

const MONTH_NAME =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\b/i;
/** MM/YYYY or MM-YYYY */
const MONTH_NUM = /\b(0?[1-9]|1[0-2])[/-]((19|20)\d{2})\b/;
const YEAR = /\b((19|20)\d{2})\b/;

function extractDates(lines: string[]): {
  dateTokens: string[];
  hasMonthInDates: boolean;
  yearOnlyDateLines: string[];
} {
  const dateTokens: string[] = [];
  const yearOnlyDateLines: string[] = [];
  let hasMonthInDates = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t || !YEAR.test(t)) continue;

    const hasMonth = MONTH_NAME.test(t) || MONTH_NUM.test(t);
    if (hasMonth) {
      hasMonthInDates = true;
      const m = t.match(MONTH_NUM)?.[0] ?? t.match(MONTH_NAME)?.[0];
      if (m) dateTokens.push(t.length > 80 ? `${t.slice(0, 77)}…` : t);
      else dateTokens.push(t.length > 80 ? `${t.slice(0, 77)}…` : t);
    } else {
      // Year present but no month on this line — only flag if it looks like a tenure line
      if (/\b(present|current|to|-|–|—)\b/i.test(t) || YEAR.test(t)) {
        yearOnlyDateLines.push(t.length > 100 ? `${t.slice(0, 97)}…` : t);
      }
      dateTokens.push(t.length > 80 ? `${t.slice(0, 77)}…` : t);
    }
  }

  return {
    dateTokens: [...new Set(dateTokens)].slice(0, 12),
    hasMonthInDates,
    yearOnlyDateLines: [...new Set(yearOnlyDateLines)].slice(0, 5),
  };
}

export function parseResumeStructure(raw: string): ParsedResume {
  const text = normalizeResumeText(raw);
  const lines = text.split('\n');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const dates = extractDates(lines);

  return {
    text,
    lines,
    wordCount,
    charCount: text.length,
    contact: extractContact(text),
    sections: extractSections(lines),
    bulletCount: countBullets(lines),
    proseDutyLines: findProseDutyLines(text),
    dateTokens: dates.dateTokens,
    hasMonthInDates: dates.hasMonthInDates,
    yearOnlyDateLines: dates.yearOnlyDateLines,
  };
}

/**
 * Return true if `needle` appears in `haystack` (exact or whitespace-flexible).
 * Used by the consistency gate / semantic grounding.
 */
export function resumeContainsEvidence(haystack: string, needle: string): boolean {
  const h = normalizeResumeText(haystack);
  const n = normalizeResumeText(needle).replace(/^…+|…+$/g, '').trim();
  if (!n || n.length < 3) return false;
  if (h.includes(n)) return true;
  // Collapse whitespace for PDF line-break mismatches
  const hFlat = h.replace(/\s+/g, ' ').toLowerCase();
  const nFlat = n.replace(/\s+/g, ' ').toLowerCase();
  if (hFlat.includes(nFlat)) return true;
  // Short prefix match for truncated quotes
  if (nFlat.length >= 24 && hFlat.includes(nFlat.slice(0, 48))) return true;
  return false;
}

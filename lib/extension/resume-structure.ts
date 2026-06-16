import { parseResumePlainText } from '@/lib/pdf-resume';

export type WorkEntry = {
  company?: string;
  title?: string;
  start?: string;
  end?: string;
  summary?: string;
};

export type EducationEntry = {
  school?: string;
  degree?: string;
  field?: string;
  end?: string;
};

export type ResumeStructure = {
  parsed_title?: string;
  latest_company?: string;
  work_history: WorkEntry[];
  education: EducationEntry[];
};

const SECTION_HEADERS =
  /^(experience|work experience|professional experience|employment history|relevant experience|career history|education|academic|qualifications)$/i;

const DATE_RANGE_RE =
  /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b\d{1,2}\/\d{4}|\b\d{4})\s*[-–—to]+\s*(\b(?:present|current|now)\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b\d{4})/i;

const TITLE_RE =
  /\b(senior|junior|lead|staff|principal|engineer|developer|manager|analyst|architect|consultant|specialist|director|tester|qa|sde|performance)\b/i;

function looksLikeJobTitle(s: string): boolean {
  return TITLE_RE.test(s);
}

function isSectionLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (SECTION_HEADERS.test(t)) return true;
  return /^[A-Z][A-Z\s&/-]{2,}$/.test(t) && !/\d{3,}/.test(t);
}

function sectionBounds(lines: string[], headerRe: RegExp): string[] {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i].trim())) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (isSectionLine(lines[i]) && !headerRe.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).map((l) => l.trim()).filter(Boolean);
}

function parseWorkBlock(lines: string[]): WorkEntry | null {
  if (!lines.length) return null;
  const entry: WorkEntry = {};
  const head = lines[0];
  const atSplit = head.split(/\s+at\s+/i);
  const dashSplit = head.split(/\s*[|–—-]\s*/);
  if (atSplit.length === 2) {
    entry.title = atSplit[0].trim();
    entry.company = atSplit[1].trim();
  } else if (dashSplit.length >= 2) {
    const a = dashSplit[0].trim();
    const b = dashSplit.slice(1).join(' - ').trim();
    if (looksLikeJobTitle(a) && !looksLikeJobTitle(b)) {
      entry.title = a;
      entry.company = b;
    } else if (!looksLikeJobTitle(a) && looksLikeJobTitle(b)) {
      entry.company = a;
      entry.title = b;
    } else {
      entry.company = a;
      entry.title = b;
    }
  } else {
    entry.title = looksLikeJobTitle(head) ? head : undefined;
    entry.company = !looksLikeJobTitle(head) ? head : undefined;
  }
  let i = 1;
  if (lines[1] && DATE_RANGE_RE.test(lines[1])) {
    const m = lines[1].match(DATE_RANGE_RE);
    if (m) {
      entry.start = m[1];
      entry.end = m[2];
    }
    i = 2;
  }
  const bullets = lines.slice(i).filter((l) => /^[-•*]/.test(l) || l.length > 20);
  if (bullets.length) entry.summary = bullets.join(' ').slice(0, 500);
  return entry.company || entry.title ? entry : null;
}

function parseWorkHistory(text: string): WorkEntry[] {
  const lines = text.split('\n').map((l) => l.trim());
  const section = sectionBounds(
    lines,
    /^(work )?experience|professional experience|employment/i,
  );
  if (!section.length) return [];

  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of section) {
    if (!line) {
      if (cur.length) {
        blocks.push(cur);
        cur = [];
      }
      continue;
    }
    if (
      cur.length &&
      DATE_RANGE_RE.test(line) &&
      !DATE_RANGE_RE.test(cur[cur.length - 1] || '')
    ) {
      blocks.push(cur);
      cur = [line];
      continue;
    }
    if (
      cur.length >= 2 &&
      !line.startsWith('-') &&
      !line.startsWith('•') &&
      DATE_RANGE_RE.test(cur[1] || '')
    ) {
      blocks.push(cur);
      cur = [line];
      continue;
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  return blocks.map(parseWorkBlock).filter((e): e is WorkEntry => !!e).slice(0, 8);
}

function parseEducation(text: string): EducationEntry[] {
  const lines = text.split('\n').map((l) => l.trim());
  const section = sectionBounds(lines, /^education|academic|qualifications/i);
  if (!section.length) return [];

  const out: EducationEntry[] = [];
  let school = '';
  for (const line of section) {
    if (/^(b\.?tech|b\.?e\.?|m\.?tech|m\.?s\.?|mba|b\.?a\.?|b\.?sc|m\.?sc|ph\.?d|bachelor|master)/i.test(line)) {
      const parts = line.split(/[|,–—-]/).map((s) => s.trim());
      out.push({
        school: school || undefined,
        degree: parts[0],
        field: parts[1],
        end: parts.find((p) => /\b(19|20)\d{2}\b/.test(p)),
      });
      school = '';
    } else if (!school && line.length > 2) {
      school = line;
    }
  }
  if (school && !out.length) out.push({ school });
  return out.slice(0, 4);
}

/** Simplify-style: derive structured autofill data from stored resume text. */
export function extractResumeStructure(resumeText: string | null): ResumeStructure {
  if (!resumeText || resumeText.length < 80) {
    return { work_history: [], education: [] };
  }
  const header = parseResumePlainText(resumeText);
  const work_history = parseWorkHistory(resumeText);
  const education = parseEducation(resumeText);
  const first = work_history[0];
  let latest_company = first?.company;
  if (latest_company && looksLikeJobTitle(latest_company) && first?.title && !looksLikeJobTitle(first.title)) {
    latest_company = first.title;
  }
  return {
    parsed_title: header.title ?? undefined,
    latest_company,
    work_history,
    education,
  };
}

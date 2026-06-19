import type { EducationEntry, WorkEntry } from './resume-structure';

export type StructuredWorkEntry = {
  company?: string;
  title?: string;
  location?: string;
  start?: string;
  end?: string;
  summary?: string;
  confidence?: 'high' | 'low';
};

export type StructuredEducationEntry = {
  school?: string;
  degree?: string;
  field?: string;
  start?: string;
  end?: string;
  confidence?: 'high' | 'low';
};

export type StructureSource = 'ai' | 'regex' | 'manual';

export type ProfileStructureStatus = {
  source: StructureSource | null;
  extracted_at: string | null;
  reviewed_at: string | null;
  warnings: string[];
  work_count: number;
  education_count: number;
  /** ready = reviewed + at least one job; review = extracted but not reviewed; empty = no jobs */
  readiness: 'ready' | 'review' | 'empty';
};

export type StructureApplyRow = {
  structured_work_history?: StructuredWorkEntry[] | null;
  structured_education?: StructuredEducationEntry[] | null;
  structure_extracted_at?: string | null;
  structure_reviewed_at?: string | null;
  structure_source?: string | null;
  structure_warnings?: string[] | null;
};

function cleanStr(v: unknown, max = 2000): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s || /^null$/i.test(s)) return undefined;
  return s.slice(0, max);
}

export function normalizeWorkEntry(raw: unknown): StructuredWorkEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const company = cleanStr(o.company, 200);
  const title = cleanStr(o.title, 200);
  if (!company && !title) return null;
  const entry: StructuredWorkEntry = {
    company,
    title,
    location: cleanStr(o.location, 120),
    start: cleanStr(o.start, 40),
    end: cleanStr(o.end, 40),
    summary: cleanStr(o.summary, 1200),
    confidence: o.confidence === 'low' ? 'low' : 'high',
  };
  if (!isStructuredWorkEntryValid(entry)) return null;
  return entry;
}

/** Drop date-fragment rows (e.g. title="Sep 2024", company="Present"). */
export function isStructuredWorkEntryValid(entry: {
  company?: string;
  title?: string;
}): boolean {
  const company = (entry.company || '').trim();
  const title = (entry.title || '').trim();
  if (!company && !title) return false;
  const dateFrag =
    /^(present|current|now)$/i.test(company) ||
    /^(present|current|now)$/i.test(title) ||
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4}$/i.test(company) ||
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4}$/i.test(title);
  if (dateFrag) return false;
  const titleOk = /\b(engineer|developer|manager|analyst|architect|consultant|tester|lead|director|specialist|performance|sde|qa)\b/i.test(
    title,
  );
  const companyOk = company.length > 2 && !/^\d{4}$/.test(company);
  return titleOk && companyOk;
}

export function normalizeEducationEntry(raw: unknown): StructuredEducationEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const school = cleanStr(o.school, 200);
  const degree = cleanStr(o.degree, 120);
  if (!school && !degree) return null;
  return {
    school,
    degree,
    field: cleanStr(o.field, 120),
    start: cleanStr(o.start, 20),
    end: cleanStr(o.end, 20),
    confidence: o.confidence === 'low' ? 'low' : 'high',
  };
}

export function normalizeWorkHistory(raw: unknown): StructuredWorkEntry[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.map(normalizeWorkEntry).filter((e): e is StructuredWorkEntry => !!e);
  return mergeSameCompanyWorkHistory(rows).slice(0, 8);
}

/** Normalize employer name for dedup (Cognizant Ltd vs Cognizant Technology Solutions). */
export function companyKey(company?: string): string {
  if (!company) return '';
  return company
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(
      /\b(ltd|limited|inc|incorporated|corp|corporation|pvt|private|llc|plc|co)\b/gi,
      '',
    )
    .replace(/\b(technology solutions|technologies)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthYearSortKey(raw?: string, asEnd = false): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/present|current|now/i.test(s)) return asEnd ? 9_999_999 : null;
  const my = s.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*['']?(\d{2,4})\b/i,
  );
  if (my) {
    let year = parseInt(my[2], 10);
    if (year < 100) year += 2000;
    const month = MONTH_INDEX[my[1].slice(0, 3).toLowerCase()] ?? 1;
    return year * 12 + month;
  }
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (y) return parseInt(y[0], 10) * 12 + (asEnd ? 12 : 1);
  return null;
}

function titleSeniorityScore(title?: string): number {
  const t = String(title ?? '').toLowerCase();
  if (/\b(principal|staff|architect)\b/.test(t)) return 5;
  if (/\b(senior|lead|specialist)\b/.test(t)) return 4;
  if (/\b(engineer|analyst|developer)\b/.test(t)) return 3;
  if (/\b(tester|associate)\b/.test(t)) return 2;
  return 1;
}

function extractClientLabel(summary?: string): string | null {
  if (!summary) return null;
  const m = summary.match(/\bclient:\s*([^\n.]+)/i);
  return m?.[1]?.trim() || null;
}

function formatRolePeriod(start?: string, end?: string): string {
  const a = (start || '').trim();
  const b = (end || '').trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || '';
}

function mergeCompanyGroup(rows: StructuredWorkEntry[]): StructuredWorkEntry {
  const sortedByStart = [...rows].sort(
    (a, b) => (monthYearSortKey(a.start) ?? 0) - (monthYearSortKey(b.start) ?? 0),
  );
  const company =
    rows.find((r) => (r.company || '').includes(','))?.company ||
    rows[0]?.company ||
    sortedByStart[0]?.company;
  const title = [...rows].sort(
    (a, b) => titleSeniorityScore(b.title) - titleSeniorityScore(a.title),
  )[0]?.title;
  const starts = rows.map((r) => monthYearSortKey(r.start)).filter((n): n is number => n != null);
  const ends = rows.map((r) => monthYearSortKey(r.end, true)).filter((n): n is number => n != null);
  const anyPresent = rows.some((r) => /present|current|now/i.test(String(r.end || '')));
  const start = sortedByStart[0]?.start;
  const end = anyPresent
    ? 'Present'
    : ends.length
      ? rows.find((r) => monthYearSortKey(r.end, true) === Math.max(...ends))?.end
      : rows[0]?.end;
  const locations = [...new Set(rows.map((r) => r.location?.trim()).filter(Boolean))];
  const summaryParts = rows.map((r) => {
    const client = extractClientLabel(r.summary);
    const period = formatRolePeriod(r.start, r.end);
    const heading = client
      ? `${client} (${period})`
      : period || r.title || 'Project';
    let body = (r.summary || '').trim();
    body = body.replace(/\bclient:\s*[^\n.]+\.?/gi, '').trim();
    if (!body && r.title) body = r.title;
    return `${heading}: ${body}`.trim();
  });
  return {
    company,
    title,
    location: locations.length ? locations.join(' / ') : undefined,
    start,
    end,
    summary: summaryParts.join('\n\n').slice(0, 1200),
    confidence: rows.some((r) => r.confidence === 'low') ? 'low' : 'high',
  };
}

/**
 * One ATS row per employer. Multiple client projects at the same company become
 * a single entry with combined dates + multi-project summary.
 */
export function mergeSameCompanyWorkHistory(
  entries: StructuredWorkEntry[],
): StructuredWorkEntry[] {
  if (entries.length < 2) return entries;
  const groups = new Map<string, StructuredWorkEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const key = companyKey(entry.company);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(entry);
  }
  return order
    .map((key) => {
      const rows = groups.get(key)!;
      return rows.length === 1 ? rows[0] : mergeCompanyGroup(rows);
    })
    .filter((e): e is StructuredWorkEntry => !!e && isStructuredWorkEntryValid(e));
}

export function normalizeEducationHistory(raw: unknown): StructuredEducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeEducationEntry).filter((e): e is StructuredEducationEntry => !!e).slice(0, 4);
}

export function toAutofillWorkEntry(e: StructuredWorkEntry): WorkEntry {
  return {
    company: e.company,
    title: e.title,
    location: e.location,
    start: e.start,
    end: e.end,
    summary: e.summary,
  };
}

export function toAutofillEducationEntry(e: StructuredEducationEntry): EducationEntry {
  return {
    school: e.school,
    degree: e.degree,
    field: e.field,
    end: e.end || e.start,
  };
}

/** AI/manual structured rows only — never regex on autofill read path. */
export function resolveWorkHistory(
  apply: StructureApplyRow | null | undefined,
  _resumeText: string | null,
): WorkEntry[] {
  if (!apply?.structure_extracted_at) return [];
  // Legacy regex rows in DB are unreliable — force re-extract via Profile refresh.
  if (apply.structure_source === 'regex') return [];
  const structured = normalizeWorkHistory(apply.structured_work_history);
  return structured.map(toAutofillWorkEntry);
}

export function resolveEducationHistory(
  apply: StructureApplyRow | null | undefined,
  _resumeText: string | null,
): EducationEntry[] {
  if (!apply?.structure_extracted_at) return [];
  if (apply.structure_source === 'regex') return [];
  const structured = normalizeEducationHistory(apply.structured_education);
  return structured.map(toAutofillEducationEntry);
}

export function buildStructureStatus(apply: StructureApplyRow | null | undefined): ProfileStructureStatus {
  const work = normalizeWorkHistory(apply?.structured_work_history);
  const edu = normalizeEducationHistory(apply?.structured_education);
  const reviewed_at = apply?.structure_reviewed_at ?? null;
  const extracted_at = apply?.structure_extracted_at ?? null;
  const warnings = Array.isArray(apply?.structure_warnings)
    ? apply!.structure_warnings!.map(String).slice(0, 12)
    : [];
  let readiness: ProfileStructureStatus['readiness'] = 'empty';
  if (work.length && reviewed_at) readiness = 'ready';
  else if (work.length && extracted_at) readiness = 'review';
  return {
    source: (apply?.structure_source as StructureSource) ?? null,
    extracted_at,
    reviewed_at,
    warnings,
    work_count: work.length,
    education_count: edu.length,
    readiness,
  };
}

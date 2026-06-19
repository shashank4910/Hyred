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
  return raw.map(normalizeWorkEntry).filter((e): e is StructuredWorkEntry => !!e).slice(0, 8);
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

import type { ResumeInsights } from '../types';
import {
  buildStructureStatus,
  normalizeEducationHistory,
  normalizeWorkHistory,
  resolveEducationHistory,
  resolveWorkHistory,
  type ProfileStructureStatus,
  type StructuredEducationEntry,
  type StructuredWorkEntry,
} from './structured-profile';
import type { EducationEntry, WorkEntry } from './resume-structure';

export type CustomQa = { question: string; answer: string };

export type AutofillProfile = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  location?: { city?: string; region?: string; country?: string; full?: string; zip?: string };
  links?: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
    twitter?: string;
  };
  years_experience?: number;
  skills?: string[];
  summary?: string;
  current_title?: string;
  latest_company?: string;
  work_history?: WorkEntry[];
  education?: EducationEntry[];
  zip_code?: string;
  total_ctc?: string;
  expected_ctc?: string;
  notice_period?: string;
  available_from?: string;
  preferred_work_type?: string;
  willing_to_relocate?: boolean;
  relocation_cities?: string;
  willing_to_travel?: string;
  work_auth_country?: string;
  authorized_to_work?: boolean;
  require_sponsorship?: boolean;
  gender?: string;
  ethnicity?: string;
  veteran_status?: string;
  disability_status?: string;
  answer_about_yourself?: string;
  answer_why_leave?: string;
  answer_strengths?: string;
  answer_weaknesses?: string;
  answer_salary_expectation?: string;
  custom_qa?: CustomQa[];
  /** Structured application profile (Simplify-style) for autofill gating */
  profile_structure?: ProfileStructureStatus;
  structured_work_history?: StructuredWorkEntry[];
  structured_education?: StructuredEducationEntry[];
};

export type ApplyProfileRow = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state_province?: string | null;
  country?: string | null;
  zip_code?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  current_title?: string | null;
  years_experience?: number | null;
  total_ctc?: string | null;
  expected_ctc?: string | null;
  notice_period?: string | null;
  available_from?: string | null;
  preferred_work_type?: string | null;
  willing_to_relocate?: boolean | null;
  relocation_cities?: string | null;
  willing_to_travel?: string | null;
  work_auth_country?: string | null;
  authorized_to_work?: boolean | null;
  require_sponsorship?: boolean | null;
  gender?: string | null;
  ethnicity?: string | null;
  veteran_status?: string | null;
  disability_status?: string | null;
  answer_about_yourself?: string | null;
  answer_why_leave?: string | null;
  answer_strengths?: string | null;
  answer_weaknesses?: string | null;
  answer_salary_expectation?: string | null;
  custom_qa?: CustomQa[] | null;
  structured_work_history?: StructuredWorkEntry[] | null;
  structured_education?: StructuredEducationEntry[] | null;
  structure_extracted_at?: string | null;
  structure_reviewed_at?: string | null;
  structure_source?: string | null;
  structure_warnings?: string[] | null;
};

function ensureHttp(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function extractLinks(text: string) {
  const find = (re: RegExp) => text.match(re)?.[0];
  return {
    linkedin: ensureHttp(
      find(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i),
    ),
    github: ensureHttp(
      find(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+(?!\/)/i),
    ),
    twitter: ensureHttp(
      find(
        /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+/i,
      ),
    ),
    portfolio: ensureHttp(
      find(
        /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+\.(?:dev|me|io|app|tech|page)(?:\/[A-Za-z0-9_\-./]*)?/i,
      ),
    ),
  };
}

function splitName(full: string | null | undefined) {
  if (!full) return { first_name: undefined, last_name: undefined };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: undefined };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

function splitLocation(loc: string | undefined) {
  if (!loc) return undefined;
  const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return { city: parts[0], full: loc };
  if (parts.length === 2)
    return { city: parts[0], country: parts[1], full: loc };
  return { city: parts[0], region: parts[1], country: parts[2], full: loc };
}

function pick<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v as T;
  }
  return undefined;
}

function buildLocation(
  apply: ApplyProfileRow | null | undefined,
  insightsLoc: ReturnType<typeof splitLocation>,
) {
  const city = pick(apply?.city, insightsLoc?.city);
  const region = pick(apply?.state_province, insightsLoc?.region);
  const country = pick(apply?.country, insightsLoc?.country);
  const zip = pick(apply?.zip_code);
  const full =
    [city, region, country].filter(Boolean).join(', ') ||
    insightsLoc?.full ||
    undefined;
  if (!city && !region && !country && !zip && !full) return undefined;
  return { city, region, country, full, zip };
}

/**
 * Build the autofill-shaped profile from profiles + apply_profiles rows.
 * apply_profiles (Settings → Application Profile) wins for explicit fields.
 */
export function buildAutofillProfile(
  row: {
    full_name: string | null;
    email: string;
    resume_text: string | null;
    insights: ResumeInsights | null;
  },
  apply?: ApplyProfileRow | null,
): AutofillProfile {
  const resumeLinks = row.resume_text ? extractLinks(row.resume_text) : {
    linkedin: undefined,
    github: undefined,
    twitter: undefined,
    portfolio: undefined,
  };
  const insightsLoc = splitLocation(row.insights?.current_location);
  const fullName = pick(
    apply?.full_name,
    row.full_name,
    row.insights?.full_name,
  );
  const name = splitName(fullName ?? null);
  const location = buildLocation(apply, insightsLoc);
  const work_history = resolveWorkHistory(apply, row.resume_text);
  const education = resolveEducationHistory(apply, row.resume_text);
  const profile_structure = buildStructureStatus(apply);
  if (apply?.structure_source === 'regex' && apply?.structure_extracted_at) {
    profile_structure.warnings = [
      'Old regex data cleared — tap Refresh from resume in Profile tab.',
      ...profile_structure.warnings,
    ].slice(0, 12);
  }

  return {
    first_name: name.first_name,
    last_name: name.last_name,
    full_name: fullName,
    email: pick(apply?.email, row.email),
    phone: pick(apply?.phone, row.insights?.phone),
    location,
    links: {
      linkedin: pick(apply?.linkedin_url, resumeLinks.linkedin),
      github: pick(apply?.github_url, resumeLinks.github),
      portfolio: pick(apply?.portfolio_url, resumeLinks.portfolio),
      twitter: resumeLinks.twitter,
    },
    years_experience: pick(apply?.years_experience, row.insights?.years_experience),
    skills: row.insights?.top_skills ?? [],
    summary: row.insights?.summary,
    current_title: pick(apply?.current_title, work_history[0]?.title),
    latest_company: work_history[0]?.company,
    work_history,
    education,
    structured_work_history: normalizeWorkHistory(apply?.structured_work_history),
    structured_education: normalizeEducationHistory(apply?.structured_education),
    profile_structure,
    zip_code: pick(apply?.zip_code, location?.zip),
    total_ctc: pick(apply?.total_ctc) ?? undefined,
    expected_ctc: pick(apply?.expected_ctc) ?? undefined,
    notice_period: pick(apply?.notice_period) ?? undefined,
    available_from: apply?.available_from
      ? String(apply.available_from).slice(0, 10)
      : undefined,
    preferred_work_type: pick(apply?.preferred_work_type) ?? undefined,
    willing_to_relocate: apply?.willing_to_relocate ?? undefined,
    relocation_cities: pick(apply?.relocation_cities) ?? undefined,
    willing_to_travel: pick(apply?.willing_to_travel) ?? undefined,
    work_auth_country: pick(apply?.work_auth_country) ?? undefined,
    authorized_to_work: apply?.authorized_to_work ?? undefined,
    require_sponsorship: apply?.require_sponsorship ?? undefined,
    gender: pick(apply?.gender) ?? undefined,
    ethnicity: pick(apply?.ethnicity) ?? undefined,
    veteran_status: pick(apply?.veteran_status) ?? undefined,
    disability_status: pick(apply?.disability_status) ?? undefined,
    answer_about_yourself: pick(apply?.answer_about_yourself) ?? undefined,
    answer_why_leave: pick(apply?.answer_why_leave) ?? undefined,
    answer_strengths: pick(apply?.answer_strengths) ?? undefined,
    answer_weaknesses: pick(apply?.answer_weaknesses) ?? undefined,
    answer_salary_expectation: pick(apply?.answer_salary_expectation) ?? undefined,
    custom_qa: Array.isArray(apply?.custom_qa) ? apply!.custom_qa! : [],
  };
}

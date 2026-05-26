import type { ResumeInsights } from '../types';

export type AutofillProfile = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  location?: { city?: string; region?: string; country?: string; full?: string };
  links?: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
    twitter?: string;
  };
  years_experience?: number;
  skills?: string[];
  summary?: string;
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

/**
 * Build the autofill-shaped profile from a stored profile row.
 */
export function buildAutofillProfile(row: {
  full_name: string | null;
  email: string;
  resume_text: string | null;
  insights: ResumeInsights | null;
}): AutofillProfile {
  const name = splitName(row.full_name ?? row.insights?.full_name ?? null);
  const links = row.resume_text ? extractLinks(row.resume_text) : {};
  const location = splitLocation(row.insights?.current_location);

  return {
    first_name: name.first_name,
    last_name: name.last_name,
    full_name: row.full_name ?? row.insights?.full_name ?? undefined,
    email: row.email,
    phone: row.insights?.phone,
    location,
    links,
    years_experience: row.insights?.years_experience,
    skills: row.insights?.top_skills ?? [],
    summary: row.insights?.summary,
  };
}

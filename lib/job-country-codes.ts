import {
  CITY_KEYS_BY_LENGTH,
  CITY_TO_COUNTRY,
  COUNTRY_ALIASES,
  REGION_TO_COUNTRIES,
} from './data/job-location-dictionary';
import type { Preferences, ResumeInsights } from './types';

const REMOTE_ONLY = /^(remote|anywhere|work from home|wfh|global)$/i;

/** Max distinct countries per ingest (JobsPipe tries each in order). */
const MAX_COUNTRY_CODES = 6;

const COUNTRY_ALIAS_KEYS_BY_LENGTH = Object.keys(COUNTRY_ALIASES).sort(
  (a, b) => b.length - a.length,
);

const REGION_KEYS_BY_LENGTH = Object.keys(REGION_TO_COUNTRIES).sort(
  (a, b) => b.length - a.length,
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLocation(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

/** Split "Indore, Pune" or "Dubai | London" into separate location tokens. */
function splitLocationTokens(value: string): string[] {
  return value
    .split(/[,;|]|(?:\s+and\s+)/i)
    .map(normalizeLocation)
    .filter(Boolean);
}

function locationContainsKey(haystack: string, needle: string): boolean {
  if (haystack === needle) return true;
  if (needle.includes(' ')) return haystack.includes(needle);
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i');
  return re.test(haystack);
}

function resolveLocationSegment(segment: string): string[] {
  if (!segment || REMOTE_ONLY.test(segment)) return [];

  if (COUNTRY_ALIASES[segment]) return [COUNTRY_ALIASES[segment]];

  if (REGION_TO_COUNTRIES[segment]) return REGION_TO_COUNTRIES[segment];

  for (const key of CITY_KEYS_BY_LENGTH) {
    if (locationContainsKey(segment, key)) {
      return [CITY_TO_COUNTRY[key]];
    }
  }

  for (const key of COUNTRY_ALIAS_KEYS_BY_LENGTH) {
    if (locationContainsKey(segment, key)) {
      return [COUNTRY_ALIASES[key]];
    }
  }

  for (const key of REGION_KEYS_BY_LENGTH) {
    if (locationContainsKey(segment, key)) {
      return REGION_TO_COUNTRIES[key];
    }
  }

  return [];
}

/**
 * ISO country codes for paid job APIs (JobsPipe, JobDataLake, JSearch).
 *
 * - Uses onboarding `preferences.locations` + resume `current_location`.
 * - `remote_only` or only "Remote" → undefined (no country filter, global search).
 * - City / region / country names come from `lib/data/job-location-dictionary.ts`.
 * - Unrecognized text → undefined (global, safer than guessing one country).
 */
export function buildJobCountryCodes(
  prefs?: Preferences | null,
  insights?: ResumeInsights | null,
): string[] | undefined {
  if (prefs?.remote_only) return undefined;

  const locStrings = [
    ...(prefs?.locations ?? []),
    insights?.current_location ?? '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  if (locStrings.length === 0) return undefined;

  const allRemote = locStrings.every((l) => REMOTE_ONLY.test(l));
  if (allRemote) return undefined;

  const codes = new Set<string>();
  for (const loc of locStrings) {
    if (REMOTE_ONLY.test(loc)) continue;
    for (const segment of splitLocationTokens(loc)) {
      for (const code of resolveLocationSegment(segment)) {
        codes.add(code);
      }
    }
  }

  if (codes.size === 0) return undefined;
  return [...codes].slice(0, MAX_COUNTRY_CODES);
}

const JSEARCH_COUNTRY_NAMES: Record<string, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  IE: 'Ireland',
  ES: 'Spain',
  IT: 'Italy',
  PT: 'Portugal',
  PL: 'Poland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  CH: 'Switzerland',
  AT: 'Austria',
  BE: 'Belgium',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  RO: 'Romania',
  GR: 'Greece',
  AU: 'Australia',
  NZ: 'New Zealand',
  SG: 'Singapore',
  JP: 'Japan',
  CN: 'China',
  KR: 'South Korea',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  PH: 'Philippines',
  MY: 'Malaysia',
  ID: 'Indonesia',
  TH: 'Thailand',
  VN: 'Vietnam',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
  IL: 'Israel',
  EG: 'Egypt',
  ZA: 'South Africa',
  NG: 'Nigeria',
  KE: 'Kenya',
  MX: 'Mexico',
  BR: 'Brazil',
  AR: 'Argentina',
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Peru',
  TR: 'Turkey',
  RU: 'Russia',
  UA: 'Ukraine',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  LK: 'Sri Lanka',
  NP: 'Nepal',
};

/** JSearch expects a country name, not ISO code. */
export function jsearchCountryParam(codes: string[] | undefined): string | undefined {
  if (!codes?.length) return undefined;
  return JSEARCH_COUNTRY_NAMES[codes[0]];
}

const ADZUNA_COUNTRY_PATHS: Record<string, string> = {
  IN: 'in',
  US: 'us',
  GB: 'gb',
  CA: 'ca',
  DE: 'de',
  FR: 'fr',
  NL: 'nl',
  IE: 'ie',
  ES: 'es',
  IT: 'it',
  PT: 'pt',
  PL: 'pl',
  SE: 'se',
  AT: 'at',
  BE: 'be',
  CH: 'ch',
  AU: 'au',
  NZ: 'nz',
  SG: 'sg',
  MX: 'mx',
  BR: 'br',
  ZA: 'za',
};

/** Adzuna path segment (e.g. jobs/in/search). */
export function adzunaCountryPath(codes: string[] | undefined): string {
  if (!codes?.length) return 'us';
  return ADZUNA_COUNTRY_PATHS[codes[0]] ?? 'us';
}

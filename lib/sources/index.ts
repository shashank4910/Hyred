import type { RawJob } from '../types';
import { fetchRemotive } from './remotive';
import { fetchRemoteOk } from './remoteok';
import { fetchHackerNews } from './hackernews';
import { fetchArbeitnow } from './arbeitnow';
import { fetchAdzuna } from './adzuna';
import { fetchHimalayas } from './himalayas';
import { fetchJSearch } from './jsearch';
import { fetchJobsPipe, describeJobsPipeFetchFailure } from './jobspipe';
import { fetchJobDataLake } from './jobdatalake';
import { getJobdatalakeApiKeys } from '../jobdatalake-keys';
import { fetchLinkedIn } from './linkedin';
import type { SearchProfile } from '../search-profile';
import type { Preferences, ResumeInsights } from '../types';
import { buildJobCountryCodes, jsearchCountryParam } from '../job-country-codes';

export type SourceName =
  | 'remotive'
  | 'remoteok'
  | 'hn'
  | 'arbeitnow'
  | 'adzuna_in'
  | 'himalayas'
  | 'jsearch'
  | 'jobspipe'
  | 'jobdatalake'
  | 'linkedin';

export const ALL_SOURCES: SourceName[] = [
  'remotive',
  'remoteok',
  'hn',
  'arbeitnow',
  'adzuna_in',
  'himalayas',
  'jsearch',
  'jobspipe',
  'jobdatalake',
  'linkedin',
];

export const SOURCE_LABELS: Record<SourceName, string> = {
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  hn: 'HN Who is hiring',
  arbeitnow: 'Arbeitnow',
  adzuna_in: 'Adzuna India',
  himalayas: 'Himalayas',
  jsearch: 'JSearch',
  jobspipe: 'JobsPipe',
  jobdatalake: 'JobDataLake',
  linkedin: 'LinkedIn',
};

/**
 * Major Indian tech-hiring locations to search on LinkedIn — the DEFAULT
 * fallback when the user hasn't set preferred locations during onboarding.
 *
 * LinkedIn's country-level "India" search does NOT surface all city-level
 * jobs for broad keywords. Searching specific metros catches jobs that the
 * country search misses (verified: a Noida "QA Performance Tester" job was
 * invisible under location=India but visible under location=Noida).
 *
 * "India" is kept first as a catch-all; the user's primary metros follow.
 */
const LINKEDIN_LOCATIONS = [
  'India',
  'Noida',
  'Gurgaon',
  'Pune',
  'Bengaluru',
  'Hyderabad',
];

/**
 * Build the LinkedIn location list from the user's onboarding preferences.
 *
 * The user picks preferred locations during onboarding (preferences.locations,
 * e.g. ["Pune", "Noida", "Remote"]). We embed those directly into the LinkedIn
 * search URL so results are personalised to where they actually want to work.
 *
 * Rules:
 *  - "Remote" / "Anywhere" are normalised to the country-level "India" search
 *    (LinkedIn has no literal "Remote" geo for the guest endpoint; remote jobs
 *    surface under country search + the remote flag in the title).
 *  - "India" is always included as a catch-all so nothing national is missed.
 *  - Falls back to the default metro list when the user set no locations.
 *  - Deduplicated, capped at 6 to keep scan time bounded.
 */
function buildLinkedInLocations(prefs?: Preferences | null): string[] {
  const userLocs = (prefs?.locations ?? [])
    .map((l) => l.trim())
    .filter(Boolean);

  if (userLocs.length === 0) return LINKEDIN_LOCATIONS;

  const out = new Set<string>();
  out.add('India'); // national catch-all always first
  for (const loc of userLocs) {
    const lower = loc.toLowerCase();
    // Remote/anywhere don't map to a LinkedIn city — covered by the India search.
    if (/^(remote|anywhere|work from home|wfh)$/.test(lower)) continue;
    out.add(loc);
  }
  return Array.from(out).slice(0, 6);
}

/**
 * Build a high-coverage LinkedIn query set from the search profile.
 *
 * KEY INSIGHT: LinkedIn's keyword search matches ROLE-TITLE PHRASES far better
 * than niche tool names. e.g. searching "loadrunner" misses "Senior Lead -
 * Performance Engineering" at Levi Strauss, but "performance testing" and
 * "performance engineering" surface it. So we prioritise titlePatterns +
 * primaryDomain + adjacentDomains (role phrases), then add a few tool keywords.
 *
 * LinkedIn is free (no API token), so we can afford a broad query set.
 */
function buildLinkedInQueries(profile?: SearchProfile | null): string[] {
  if (!profile) return ['performance testing', 'performance engineer'];
  const out = new Set<string>();
  const add = (s?: string) => {
    const t = (s ?? '').trim().toLowerCase();
    if (t && t.length >= 3) out.add(t);
  };
  // Role-title phrases are the strongest signal on LinkedIn.
  (profile.titlePatterns ?? []).forEach(add);
  // Primary + adjacent domains (e.g. "performance engineering", "sre").
  add(profile.primaryDomain);
  (profile.adjacentDomains ?? []).forEach(add);
  // A few niche tool keywords for specialised coverage.
  (profile.searchKeywords ?? []).slice(0, 4).forEach(add);
  // Cap to keep request count + scan time bounded (LinkedIn is free but slow).
  return Array.from(out).slice(0, 6);
}

/** Role-title phrases work better on JobsPipe than single tool keywords (e.g. "JMeter"). */
function buildJobsPipeQueries(
  profile?: SearchProfile | null,
  searchKeywords?: string[],
): string[] | undefined {
  const out = new Set<string>();
  const add = (s?: string) => {
    const t = (s ?? '').trim();
    if (t.length >= 3) out.add(t);
  };
  (profile?.titlePatterns ?? []).slice(0, 4).forEach(add);
  add(profile?.primaryDomain);
  (profile?.adjacentDomains ?? []).slice(0, 2).forEach(add);
  (searchKeywords ?? []).slice(0, 4).forEach(add);
  if (out.size === 0) return undefined;
  return Array.from(out).slice(0, 6);
}

/**
 * Build the dispatch table at call time.
 *
 * If a SearchProfile is provided, its AI-generated `searchKeywords` are used
 * for sources that support keyword search (e.g. Adzuna, JSearch, Himalayas).
 * The profile is generated by AI from the user's resume — this replaces the
 * previous regex-based query builder.
 */
function buildFns(
  searchProfile?: SearchProfile | null,
  preferences?: Preferences | null,
  insights?: ResumeInsights | null,
): Partial<Record<SourceName, () => Promise<RawJob[]>>> {
  const fns: Partial<Record<SourceName, () => Promise<RawJob[]>>> = {
    remotive: () => fetchRemotive({ limit: 50 }),
    remoteok: () => fetchRemoteOk(),
    hn: () => fetchHackerNews({ limit: 60 }),
    arbeitnow: () => fetchArbeitnow(),
  };

  const countryCodes = buildJobCountryCodes(preferences, insights);

  // Use AI-generated keywords from the search profile if available
  const queries = searchProfile?.searchKeywords?.length
    ? searchProfile.searchKeywords
    : [];

  // Adzuna India — enabled if credentials are configured
  // (supports either ADZUNA_CREDENTIALS or legacy ADZUNA_APP_ID + ADZUNA_APP_KEY)
  if (process.env.ADZUNA_CREDENTIALS || (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)) {
    fns.adzuna_in = () =>
      fetchAdzuna({
        country: 'in',
        queries,
        maxPages: 2,
      });
  }

  // Himalayas — always enabled (free, no auth)
  fns.himalayas = () =>
    fetchHimalayas({
      queries: queries.length > 0 ? queries.slice(0, 3) : undefined,
      limit: 50,
    });

  // JSearch (RapidAPI) — always registered. fetchJSearch() internally
  // checks both env vars AND Admin Center DB keys, returning [] silently
  // when none are configured (never throws), so this won't cause "partial"
  // warnings on scans.
  fns.jsearch = () =>
    fetchJSearch({
      queries: queries.length > 0 ? queries.slice(0, 5) : undefined,
      country: jsearchCountryParam(countryCodes),
      datePosted: 'week',
    });

  // JobsPipe — country from user onboarding (US, IN, etc.), not hardcoded.
  fns.jobspipe = () =>
    fetchJobsPipe({
      queries: buildJobsPipeQueries(searchProfile, queries),
      countryCodes,
      maxAgeDays: 30,
      limit: 25,
    });

  fns.jobdatalake = () =>
    fetchJobDataLake({
      queries: queries.length > 0 ? queries.slice(0, 5) : undefined,
      countryCodes,
      perPage: 50,
    });

  // LinkedIn — PUBLIC GUEST API (free, no auth, no API key).
  // Searches role-title phrases across the user's PREFERRED locations (set
  // during onboarding), falling back to major Indian metros if none chosen.
  // We embed the user's locations into the search URL so results are
  // personalised to where they actually want to work.
  fns.linkedin = () =>
    fetchLinkedIn({
      queries: buildLinkedInQueries(searchProfile),
      locations: buildLinkedInLocations(preferences),
      maxPagesPerQuery: 2,
      maxSearchRequests: 36,
      fetchDescriptions: true,
      maxDescriptions: 24,
    });

  return fns;
}

export async function fetchAllSources(
  sources?: SourceName[],
  searchProfile?: SearchProfile | null,
  preferences?: Preferences | null,
  insights?: ResumeInsights | null,
): Promise<{ jobs: RawJob[]; errors: { source: string; error: string }[] }> {
  const errors: { source: string; error: string }[] = [];
  const all: RawJob[] = [];

  const fns = buildFns(searchProfile, preferences, insights);
  const names = sources ?? (Object.keys(fns) as SourceName[]);
  const explicit = sources?.length ? new Set(sources) : null;

  const results = await Promise.all(
    names.map(async (s) => {
      const fn = fns[s];
      if (!fn) {
        if (explicit?.has(s)) {
          return {
            source: s,
            jobs: [] as RawJob[],
            error: `${SOURCE_LABELS[s] ?? s} is not available (missing API keys or env).`,
          };
        }
        return { source: s, jobs: [] as RawJob[], error: null as string | null };
      }
      try {
        const jobs = await fn();
        return { source: s, jobs, error: null as string | null };
      } catch (e) {
        return { source: s, jobs: [] as RawJob[], error: (e as Error).message };
      }
    }),
  );

  for (const r of results) {
    all.push(...r.jobs);
    if (r.error) {
      errors.push({ source: r.source, error: r.error });
      continue;
    }
    if (!explicit?.has(r.source) || r.jobs.length > 0) continue;

    if (r.source === 'jobspipe') {
      errors.push({ source: r.source, error: await describeJobsPipeFetchFailure() });
    } else if (r.source === 'jobdatalake') {
      const keys = await getJobdatalakeApiKeys();
      errors.push({
        source: r.source,
        error:
          keys.length === 0
            ? 'No JobDataLake API key configured. Add one in Admin → API Key Management.'
            : 'JobDataLake returned 0 jobs for your keywords (India filter).',
      });
    } else if (r.source === 'jsearch') {
      errors.push({
        source: r.source,
        error:
          'JSearch returned 0 jobs. Check RapidAPI keys in Admin or try broader profile keywords.',
      });
    }
  }

  return { jobs: all, errors };
}

import type { RawJob } from '../types';
import type { Preferences, ResumeInsights } from '../types';
import { fetchRemotive } from './remotive';
import { fetchRemoteOk } from './remoteok';
import { fetchHackerNews } from './hackernews';
import { fetchArbeitnow } from './arbeitnow';
import { fetchAdzuna } from './adzuna';

export type SourceName =
  | 'remotive'
  | 'remoteok'
  | 'hn'
  | 'arbeitnow'
  | 'adzuna_in';

export const ALL_SOURCES: SourceName[] = [
  'remotive',
  'remoteok',
  'hn',
  'arbeitnow',
  'adzuna_in',
];

export const SOURCE_LABELS: Record<SourceName, string> = {
  remotive: 'Remotive',
  remoteok: 'RemoteOK',
  hn: 'HN Who is hiring',
  arbeitnow: 'Arbeitnow',
  adzuna_in: 'Adzuna India',
};

/**
 * Build the dispatch table at call time so we can conditionally include
 * sources that require optional env vars (e.g. Adzuna) without crashing
 * on installs that haven't set them up yet.
 *
 * If profile context is provided (preferences + insights), it's used to
 * build smarter search queries for sources that support them (e.g. Adzuna).
 */
function buildFns(context?: {
  preferences?: Preferences;
  insights?: ResumeInsights | null;
}): Partial<Record<SourceName, () => Promise<RawJob[]>>> {
  const fns: Partial<Record<SourceName, () => Promise<RawJob[]>>> = {
    remotive: () => fetchRemotive({ limit: 50 }),
    remoteok: () => fetchRemoteOk(),
    hn: () => fetchHackerNews({ limit: 60 }),
    arbeitnow: () => fetchArbeitnow(),
  };

  // Optional: only enable Adzuna India if creds are configured.
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    // Build search queries from user's preferences and skills
    const queries: string[] = [];

    // Add target roles as search queries
    if (context?.preferences?.roles?.length) {
      queries.push(...context.preferences.roles.slice(0, 4));
    }

    // Add top skills as additional queries (pick the most distinctive ones)
    if (context?.insights?.top_skills?.length) {
      const skills = context.insights.top_skills;
      // Pick 2-3 distinctive skills that are likely to be in job titles
      const skillQueries = skills
        .filter(s => s.length > 3) // Skip very short terms
        .slice(0, 3);
      queries.push(...skillQueries);
    }

    // Fallback: if no queries from profile, use generic performance/testing terms
    if (queries.length === 0) {
      queries.push('performance engineer', 'load testing', 'software engineer');
    }

    fns.adzuna_in = () => fetchAdzuna({
      country: 'in',
      queries,
      maxPages: 2,
    });
  }
  return fns;
}

export async function fetchAllSources(
  sources?: SourceName[],
  context?: {
    preferences?: Preferences;
    insights?: ResumeInsights | null;
  },
): Promise<{ jobs: RawJob[]; errors: { source: string; error: string }[] }> {
  const errors: { source: string; error: string }[] = [];
  const all: RawJob[] = [];

  const fns = buildFns(context);
  const names = sources ?? (Object.keys(fns) as SourceName[]);

  await Promise.all(
    names.map(async (s) => {
      const fn = fns[s];
      if (!fn) {
        // Source not configured (e.g. missing API keys) — silently skip.
        return;
      }
      try {
        const jobs = await fn();
        all.push(...jobs);
      } catch (e) {
        errors.push({ source: s, error: (e as Error).message });
      }
    }),
  );

  return { jobs: all, errors };
}

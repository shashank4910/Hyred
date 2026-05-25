import type { RawJob } from '../types';
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
 */
function buildFns(): Partial<Record<SourceName, () => Promise<RawJob[]>>> {
  const fns: Partial<Record<SourceName, () => Promise<RawJob[]>>> = {
    remotive: () => fetchRemotive({ limit: 50 }),
    remoteok: () => fetchRemoteOk(),
    hn: () => fetchHackerNews({ limit: 60 }),
    arbeitnow: () => fetchArbeitnow(),
  };

  // Optional: only enable Adzuna India if creds are configured.
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    fns.adzuna_in = () => fetchAdzuna({ country: 'in', limit: 50 });
  }
  return fns;
}

export async function fetchAllSources(
  sources?: SourceName[],
): Promise<{ jobs: RawJob[]; errors: { source: string; error: string }[] }> {
  const errors: { source: string; error: string }[] = [];
  const all: RawJob[] = [];

  const fns = buildFns();
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

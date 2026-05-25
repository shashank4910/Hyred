import type { RawJob } from '../types';
import { fetchRemotive } from './remotive';
import { fetchRemoteOk } from './remoteok';
import { fetchHackerNews } from './hackernews';

export type SourceName = 'remotive' | 'remoteok' | 'hn';

export const ALL_SOURCES: SourceName[] = ['remotive', 'remoteok', 'hn'];

export async function fetchAllSources(
  sources: SourceName[] = ALL_SOURCES,
): Promise<{ jobs: RawJob[]; errors: { source: string; error: string }[] }> {
  const errors: { source: string; error: string }[] = [];
  const all: RawJob[] = [];

  const fns: Record<SourceName, () => Promise<RawJob[]>> = {
    remotive: () => fetchRemotive({ limit: 50 }),
    remoteok: () => fetchRemoteOk(),
    hn: () => fetchHackerNews({ limit: 60 }),
  };

  await Promise.all(
    sources.map(async (s) => {
      try {
        const jobs = await fns[s]();
        all.push(...jobs);
      } catch (e) {
        errors.push({ source: s, error: (e as Error).message });
      }
    }),
  );

  return { jobs: all, errors };
}

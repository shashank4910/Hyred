/** Paid job-board APIs tracked in Admin usage dashboard. */
export const JOB_API_SOURCES = ['jsearch', 'jobspipe', 'jobdatalake', 'adzuna_in'] as const;
export type JobApiSource = (typeof JOB_API_SOURCES)[number];

/** Mask an API key for display: first 4 + last 4 chars. */
export function maskKey(key: string): string {
  if (!key || key.length < 10) return key ? '***' : '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** Documented monthly free-tier limits (reference only). */
export const JOB_API_MONTHLY_QUOTA: Record<JobApiSource, number> = {
  jsearch: 200,
  jobspipe: 5000,
  jobdatalake: 1000,
  adzuna_in: 2500,
};

export const JOB_API_SOURCE_LABELS: Record<JobApiSource, string> = {
  jsearch: 'JSearch',
  jobspipe: 'JobsPipe',
  jobdatalake: 'JobDataLake',
  adzuna_in: 'Adzuna India',
};

/** Stable masked id for logs + dashboard rows. */
export function jobApiKeyIdentifier(source: JobApiSource, rawKey: string): string {
  return maskKey(rawKey);
}

/** Load configured keys from env + admin_settings (same merge as ingest). */
export async function getConfiguredJobApiKeys(): Promise<
  Record<JobApiSource, Array<{ raw: string; identifier: string }>>
> {
  const result: Record<JobApiSource, Array<{ raw: string; identifier: string }>> = {
    jsearch: [],
    jobspipe: [],
    jobdatalake: [],
    adzuna_in: [],
  };

  const pushUnique = (source: JobApiSource, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const identifier = jobApiKeyIdentifier(source, trimmed);
    if (result[source].some((k) => k.identifier === identifier)) return;
    result[source].push({ raw: trimmed, identifier });
  };

  // Env
  for (const k of (process.env.JSEARCH_API_KEYS ?? '').split(',')) pushUnique('jsearch', k);
  if (process.env.ADZUNA_CREDENTIALS) {
    for (const c of process.env.ADZUNA_CREDENTIALS.split(',')) pushUnique('adzuna_in', c);
  } else if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    pushUnique('adzuna_in', `${process.env.ADZUNA_APP_ID}:${process.env.ADZUNA_APP_KEY}`);
  }
  const jpMulti = process.env.JOBSPIPE_API_KEYS ?? '';
  if (jpMulti.trim()) {
    for (const k of jpMulti.split(',')) pushUnique('jobspipe', k);
  } else if (process.env.JOBSPIPE_API_KEY) {
    pushUnique('jobspipe', process.env.JOBSPIPE_API_KEY);
  }
  const jdlMulti = process.env.JOBDATALAKE_API_KEYS ?? '';
  if (jdlMulti.trim()) {
    for (const k of jdlMulti.split(',')) pushUnique('jobdatalake', k);
  } else if (process.env.JOBDATALAKE_API_KEY) {
    pushUnique('jobdatalake', process.env.JOBDATALAKE_API_KEY);
  }

  // DB
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('admin_settings')
      .select('value')
      .eq('key', 'api_keys')
      .maybeSingle();
    const stored = (data?.value ?? {}) as Record<string, string[]>;
    for (const k of stored.jsearch ?? []) pushUnique('jsearch', k);
    for (const k of stored.adzuna ?? []) pushUnique('adzuna_in', k);
    for (const k of stored.jobspipe ?? []) pushUnique('jobspipe', k);
    for (const k of stored.jobdatalake ?? []) pushUnique('jobdatalake', k);
  } catch {
    /* ignore */
  }

  return result;
}

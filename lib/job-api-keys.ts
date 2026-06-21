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

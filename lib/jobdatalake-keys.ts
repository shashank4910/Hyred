/**
 * JobDataLake API keys — env vars + Admin Center (admin_settings.api_keys.jobdatalake).
 * https://www.jobdatalake.com/docs
 *
 * Env: JOBDATALAKE_API_KEYS (comma-separated) or JOBDATALAKE_API_KEY (single).
 */

let _dbKeysCache: string[] | null = null;
let _dbKeysCacheTime = 0;

async function loadDbKeys(): Promise<string[]> {
  if (_dbKeysCache && Date.now() - _dbKeysCacheTime < 5 * 60 * 1000) {
    return _dbKeysCache;
  }
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('admin_settings')
      .select('value')
      .eq('key', 'api_keys')
      .maybeSingle();
    const keys = (data?.value as Record<string, string[]> | null)?.jobdatalake ?? [];
    _dbKeysCache = keys;
    _dbKeysCacheTime = Date.now();
    return keys;
  } catch {
    return _dbKeysCache ?? [];
  }
}

function getEnvKeys(): string[] {
  const multi = process.env.JOBDATALAKE_API_KEYS ?? '';
  if (multi.trim()) {
    return multi.split(',').map((k) => k.trim()).filter(Boolean);
  }
  const single = process.env.JOBDATALAKE_API_KEY?.trim();
  return single ? [single] : [];
}

/** Merged JobDataLake keys from Vercel env + Admin Center DB. */
export async function getJobdatalakeApiKeys(): Promise<string[]> {
  const envKeys = getEnvKeys();
  const dbKeys = await loadDbKeys();
  return Array.from(new Set([...envKeys, ...dbKeys]));
}

export function clearJobdatalakeKeysCache(): void {
  _dbKeysCache = null;
  _dbKeysCacheTime = 0;
}

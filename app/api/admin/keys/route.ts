import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { supabaseAdmin } from '@/lib/supabase/server';
import { clearJobdatalakeKeysCache } from '@/lib/jobdatalake-keys';

export const runtime = 'nodejs';

/**
 * Admin API Keys Management.
 *
 * GET  /api/admin/keys — list all configured API keys (masked) + their usage
 * POST /api/admin/keys — save/update keys for a source
 *
 * Keys are stored in Supabase table: admin_settings (key-value store)
 * Row: { key: 'api_keys', value: { jsearch: [...], adzuna: [...], jobspipe: [...], jobdatalake: [...] } }
 *
 * Migration SQL:
 * CREATE TABLE IF NOT EXISTS admin_settings (
 *   key text PRIMARY KEY,
 *   value jsonb NOT NULL DEFAULT '{}',
 *   updated_at timestamptz DEFAULT now()
 * );
 */

async function requireAdmin(_req: NextRequest): Promise<boolean> {
  return isCurrentUserAdmin();
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Get stored keys
  const { data } = await sb
    .from('admin_settings')
    .select('value')
    .eq('key', 'api_keys')
    .maybeSingle();

  const keys = (data?.value ?? {}) as Record<string, string[]>;

  // Mask keys for display
  const masked: Record<string, Array<{ full: string; masked: string; index: number }>> = {};
  for (const [source, keyList] of Object.entries(keys)) {
    masked[source] = (keyList ?? []).map((k, i) => ({
      full: k, // We send full keys to admin (it's their own keys)
      masked: k.length > 10 ? `${k.slice(0, 4)}...${k.slice(-4)}` : '***',
      index: i,
    }));
  }

  // Also check env vars for keys not stored in DB (legacy setup)
  const envKeys: Record<string, string[]> = {};
  if (process.env.JSEARCH_API_KEYS) {
    envKeys.jsearch = process.env.JSEARCH_API_KEYS.split(',').filter(Boolean);
  }
  if (process.env.ADZUNA_CREDENTIALS) {
    envKeys.adzuna = process.env.ADZUNA_CREDENTIALS.split(',').filter(Boolean);
  } else if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    envKeys.adzuna = [`${process.env.ADZUNA_APP_ID}:${process.env.ADZUNA_APP_KEY}`];
  }
  if (process.env.JOBSPIPE_API_KEYS) {
    envKeys.jobspipe = process.env.JOBSPIPE_API_KEYS.split(',').filter(Boolean);
  } else if (process.env.JOBSPIPE_API_KEY) {
    envKeys.jobspipe = [process.env.JOBSPIPE_API_KEY];
  }
  if (process.env.JOBDATALAKE_API_KEYS) {
    envKeys.jobdatalake = process.env.JOBDATALAKE_API_KEYS.split(',').filter(Boolean);
  } else if (process.env.JOBDATALAKE_API_KEY) {
    envKeys.jobdatalake = [process.env.JOBDATALAKE_API_KEY];
  }

  return NextResponse.json({ stored: masked, env: envKeys });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { source, keys: newKeys } = body as { source: string; keys: string[] };

  if (!source || !Array.isArray(newKeys)) {
    return NextResponse.json({ error: 'Invalid body: need { source, keys: string[] }' }, { status: 400 });
  }

  const validSources = ['jsearch', 'adzuna', 'jobspipe', 'jobdatalake'];
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Get current keys
  const { data: existing } = await sb
    .from('admin_settings')
    .select('value')
    .eq('key', 'api_keys')
    .maybeSingle();

  const currentKeys = (existing?.value ?? {}) as Record<string, string[]>;
  currentKeys[source] = newKeys.filter(Boolean);

  // Upsert
  await sb.from('admin_settings').upsert(
    { key: 'api_keys', value: currentKeys, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );

  if (source === 'jobdatalake') clearJobdatalakeKeysCache();

  return NextResponse.json({ ok: true, count: currentKeys[source].length });
}

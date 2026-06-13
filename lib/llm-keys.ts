/**
 * LLM Key Manager — reads keys from Supabase `llm_keys` table, handles
 * rotation, usage tracking, and daily reset. This replaces hardcoded
 * GROQ_API_KEY / OPENAI_API_KEY env vars for multi-key setups.
 *
 * The provider chain in lib/gemini.ts calls `getNextAvailableKey(provider)`
 * to get a key that hasn't exceeded its daily limit, logs usage after each
 * call, and marks keys as rate-limited when they 429.
 *
 * ENV VARS STILL WORK as a fallback: if no DB keys are configured for a
 * provider, the system falls back to the env var (GROQ_API_KEY, OPENAI_API_KEY,
 * CEREBRAS_API_KEY). This keeps existing deployments working without migration.
 */

import { supabaseAdmin } from './supabase/server';

export type LlmKey = {
  id: string;
  provider: string;
  api_key: string;
  label: string | null;
  model: string | null;
  base_url: string | null;
  daily_token_limit: number;
  tokens_used_today: number;
  requests_today: number;
  last_reset_at: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type LlmProvider = 'cerebras' | 'groq' | 'openai' | 'gemini' | 'mistral' | 'sambanova' | 'bluesminds';

export const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  cerebras: { baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash-lite' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  sambanova: { baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct' },
  bluesminds: { baseUrl: 'https://api.bluesminds.com/v1', model: 'deepseek-v4-flash' },
};

/**
 * Check if a key's daily counter needs reset (new UTC day since last_reset_at).
 * If yes, resets tokens_used_today and requests_today in the DB.
 */
async function maybeResetDaily(key: LlmKey): Promise<LlmKey> {
  const lastReset = new Date(key.last_reset_at);
  const now = new Date();
  // Compare UTC dates
  if (
    lastReset.getUTCFullYear() === now.getUTCFullYear() &&
    lastReset.getUTCMonth() === now.getUTCMonth() &&
    lastReset.getUTCDate() === now.getUTCDate()
  ) {
    return key; // same day, no reset needed
  }

  // New UTC day → reset counters
  const sb = supabaseAdmin();
  await sb
    .from('llm_keys')
    .update({
      tokens_used_today: 0,
      requests_today: 0,
      last_reset_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', key.id);

  return { ...key, tokens_used_today: 0, requests_today: 0, last_reset_at: now.toISOString() };
}

/**
 * Get the next available key for a provider. Picks the active key with the
 * lowest usage that hasn't exceeded its daily limit.
 *
 * Returns null if no keys are available (all exhausted or none configured).
 */
export async function getNextAvailableKey(provider: string): Promise<LlmKey | null> {
  const sb = supabaseAdmin();

  const { data: keys, error } = await sb
    .from('llm_keys')
    .select('*')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('tokens_used_today', { ascending: true });

  if (error || !keys?.length) return null;

  // Find the first key that hasn't exceeded its daily limit (with daily reset check)
  for (const rawKey of keys) {
    const key = await maybeResetDaily(rawKey as LlmKey);
    if (key.tokens_used_today < key.daily_token_limit) {
      return key;
    }
  }

  return null; // All keys exhausted for today
}

/**
 * Get ALL keys for a provider (for admin display).
 */
export async function getAllKeysForProvider(provider: string): Promise<LlmKey[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('llm_keys')
    .select('*')
    .eq('provider', provider)
    .order('priority', { ascending: true });
  return (data ?? []) as LlmKey[];
}

/**
 * Get ALL configured LLM keys (across all providers).
 */
export async function getAllLlmKeys(): Promise<LlmKey[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('llm_keys')
    .select('*')
    .order('provider')
    .order('priority', { ascending: true });
  return (data ?? []) as LlmKey[];
}

export type LlmActivityEntry = {
  id: string;
  createdAt: string;
  provider: string;
  model: string | null;
  operation: string;
  tokensIn: number;
  tokensOut: number;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  keyId: string | null;
  keyLabel: string;
};

/**
 * Recent per-call LLM activity for the admin live log panel. Returns the latest
 * `limit` usage-log rows (newest first) with the human-friendly key label resolved.
 */
export async function getRecentLlmActivity(limit = 50): Promise<LlmActivityEntry[]> {
  const sb = supabaseAdmin();
  const { data: logs } = await sb
    .from('llm_usage_log')
    .select('id, created_at, provider, model, operation, tokens_in, tokens_out, status, error_message, duration_ms, key_id')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  const entries = (logs ?? []) as Array<{
    id: string;
    created_at: string;
    provider: string;
    model: string | null;
    operation: string;
    tokens_in: number | null;
    tokens_out: number | null;
    status: string;
    error_message: string | null;
    duration_ms: number | null;
    key_id: string | null;
  }>;

  // Resolve key labels in one batched query
  const keyIds = [...new Set(entries.map((e) => e.key_id).filter(Boolean))] as string[];
  const labels: Record<string, string> = {};
  if (keyIds.length) {
    const { data: keys } = await sb
      .from('llm_keys')
      .select('id, label, api_key')
      .in('id', keyIds);
    for (const k of (keys ?? []) as Array<{ id: string; label: string | null; api_key: string }>) {
      labels[k.id] = k.label
        || (k.api_key && k.api_key.length > 10 ? `${k.api_key.slice(0, 4)}...${k.api_key.slice(-4)}` : k.id.slice(0, 6));
    }
  }

  return entries.map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    provider: e.provider,
    model: e.model,
    operation: e.operation,
    tokensIn: e.tokens_in ?? 0,
    tokensOut: e.tokens_out ?? 0,
    status: e.status,
    errorMessage: e.error_message,
    durationMs: e.duration_ms,
    keyId: e.key_id,
    keyLabel: e.key_id ? (labels[e.key_id] ?? e.key_id.slice(0, 6)) : 'env-var',
  }));
}

/**
 * Record token usage for a key after a successful (or failed) call.
 * Updates the key's daily counter AND inserts a usage log entry.
 */
export async function recordUsage(opts: {
  keyId: string;
  provider: string;
  model?: string;
  operation: string;
  tokensIn: number;
  tokensOut: number;
  durationMs?: number;
  status?: 'success' | 'error' | 'rate_limited';
  errorMessage?: string;
  profileId?: string;
}): Promise<void> {
  const sb = supabaseAdmin();
  const totalTokens = opts.tokensIn + opts.tokensOut;

  // Atomic increment via RPC (best), with fallback to read-then-write
  try {
    const { error: rpcError } = await sb.rpc('increment_llm_key_usage', {
      key_id: opts.keyId,
      token_count: totalTokens,
    });
    if (rpcError) {
      // RPC doesn't exist yet (pre-migration) — do a simple update
      const { data: current } = await sb
        .from('llm_keys')
        .select('tokens_used_today, requests_today')
        .eq('id', opts.keyId)
        .single();
      if (current) {
        const row = current as { tokens_used_today: number; requests_today: number };
        await sb
          .from('llm_keys')
          .update({
            tokens_used_today: row.tokens_used_today + totalTokens,
            requests_today: row.requests_today + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', opts.keyId);
      }
    }
  } catch {
    // Never crash the pipeline for usage tracking failures
  }

  // Insert usage log entry (fire and forget)
  sb.from('llm_usage_log')
    .insert({
      key_id: opts.keyId,
      provider: opts.provider,
      model: opts.model ?? null,
      operation: opts.operation,
      tokens_in: opts.tokensIn,
      tokens_out: opts.tokensOut,
      profile_id: opts.profileId ?? null,
      duration_ms: opts.durationMs ?? null,
      status: opts.status ?? 'success',
      error_message: opts.errorMessage?.slice(0, 500) ?? null,
    })
    .then(() => {});
}

/**
 * Mark a key as temporarily exhausted (hit rate limit).
 * Sets tokens_used_today = daily_token_limit so it won't be picked again today.
 */
export async function markKeyExhausted(keyId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('llm_keys')
    .select('daily_token_limit')
    .eq('id', keyId)
    .single();
  if (data) {
    await sb
      .from('llm_keys')
      .update({
        tokens_used_today: data.daily_token_limit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', keyId);
  }
}

/**
 * Add a new LLM key.
 */
export async function addLlmKey(opts: {
  provider: string;
  apiKey: string;
  label?: string;
  model?: string;
  baseUrl?: string;
  dailyTokenLimit?: number;
  priority?: number;
}): Promise<LlmKey | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('llm_keys')
    .insert({
      provider: opts.provider,
      api_key: opts.apiKey,
      label: opts.label ?? null,
      model: opts.model ?? null,
      base_url: opts.baseUrl ?? null,
      daily_token_limit: opts.dailyTokenLimit ?? 1000000,
      priority: opts.priority ?? 0,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as LlmKey;
}

/**
 * Update an existing key.
 */
export async function updateLlmKey(
  keyId: string,
  patch: Partial<Pick<LlmKey, 'label' | 'is_active' | 'daily_token_limit' | 'priority' | 'model' | 'base_url'>>,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from('llm_keys')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', keyId);
}

/**
 * Delete a key.
 */
export async function deleteLlmKey(keyId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('llm_keys').delete().eq('id', keyId);
}

/**
 * Get usage summary for admin dashboard (last N days).
 */
export async function getLlmUsageSummary(daysBack = 7): Promise<{
  byProvider: Record<string, { totalTokens: number; totalRequests: number; errors: number; rateLimited: number }>;
  byKey: Array<{
    id: string;
    provider: string;
    label: string | null;
    tokensToday: number;
    dailyLimit: number;
    percentUsed: number;
    requestsToday: number;
    isActive: boolean;
    totalTokensInPeriod: number;
  }>;
  totalTokens: number;
  totalRequests: number;
  dailyBreakdown: Array<{ date: string; tokens: number; requests: number }>;
}> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  // Get all keys with current usage
  const { data: keys } = await sb
    .from('llm_keys')
    .select('*')
    .order('provider')
    .order('priority', { ascending: true });

  // Get usage logs for the period
  const { data: logs } = await sb
    .from('llm_usage_log')
    .select('key_id, provider, tokens_in, tokens_out, status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000);

  const entries = logs ?? [];
  const allKeys = (keys ?? []) as LlmKey[];

  // Aggregate by provider
  const byProvider: Record<string, { totalTokens: number; totalRequests: number; errors: number; rateLimited: number }> = {};
  for (const e of entries) {
    if (!byProvider[e.provider]) {
      byProvider[e.provider] = { totalTokens: 0, totalRequests: 0, errors: 0, rateLimited: 0 };
    }
    byProvider[e.provider].totalTokens += (e.tokens_in ?? 0) + (e.tokens_out ?? 0);
    byProvider[e.provider].totalRequests++;
    if (e.status === 'error') byProvider[e.provider].errors++;
    if (e.status === 'rate_limited') byProvider[e.provider].rateLimited++;
  }

  // Per-key summary
  const keyTokensInPeriod: Record<string, number> = {};
  for (const e of entries) {
    const kid = e.key_id ?? 'unknown';
    keyTokensInPeriod[kid] = (keyTokensInPeriod[kid] ?? 0) + (e.tokens_in ?? 0) + (e.tokens_out ?? 0);
  }

  const byKey = allKeys.map((k) => ({
    id: k.id,
    provider: k.provider,
    label: k.label,
    tokensToday: k.tokens_used_today,
    dailyLimit: k.daily_token_limit,
    percentUsed: k.daily_token_limit > 0 ? Math.round((k.tokens_used_today / k.daily_token_limit) * 100) : 0,
    requestsToday: k.requests_today,
    isActive: k.is_active,
    totalTokensInPeriod: keyTokensInPeriod[k.id] ?? 0,
  }));

  // Daily breakdown
  const dailyMap: Record<string, { tokens: number; requests: number }> = {};
  for (const e of entries) {
    const date = e.created_at.slice(0, 10);
    if (!dailyMap[date]) dailyMap[date] = { tokens: 0, requests: 0 };
    dailyMap[date].tokens += (e.tokens_in ?? 0) + (e.tokens_out ?? 0);
    dailyMap[date].requests++;
  }
  const dailyBreakdown = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return {
    byProvider,
    byKey,
    totalTokens: entries.reduce((s, e) => s + (e.tokens_in ?? 0) + (e.tokens_out ?? 0), 0),
    totalRequests: entries.length,
    dailyBreakdown,
  };
}

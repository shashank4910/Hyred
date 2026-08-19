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
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash-lite' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  sambanova: { baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct' },
  bluesminds: { baseUrl: 'https://api.bluesminds.com/v1', model: 'gpt-4o' },
};

/** How each provider's daily budget is tracked (stored in daily_token_limit column). */
export type ProviderBudgetMode = 'tokens' | 'requests' | 'pi_credits';

export type ProviderBudgetConfig = {
  mode: ProviderBudgetMode;
  /** Default for daily_token_limit when adding a key (meaning depends on mode). */
  defaultDailyLimit: number;
  rpm: number;
  /** Shown in Admin UI */
  limitLabel: string;
  freeTierNote: string;
};

/**
 * Provider budget semantics — must match how each vendor actually bills.
 * Bluesminds: pi credits + 300 req/day on free tier (NOT raw LLM tokens).
 * @see https://doc.bluesminds.com/
 */
export const PROVIDER_BUDGET: Record<string, ProviderBudgetConfig> = {
  cerebras: {
    mode: 'tokens',
    defaultDailyLimit: 1_000_000,
    rpm: 10,
    limitLabel: 'tokens/day',
    freeTierNote: '1M tokens/day free',
  },
  groq: {
    mode: 'tokens',
    defaultDailyLimit: 100_000,
    rpm: 15,
    limitLabel: 'tokens/day',
    freeTierNote: '~100K tokens/day',
  },
  openai: {
    mode: 'tokens',
    defaultDailyLimit: 999_999_999,
    rpm: 60,
    limitLabel: 'tokens/day',
    freeTierNote: 'Paid',
  },
  gemini: {
    mode: 'tokens',
    defaultDailyLimit: 500_000,
    rpm: 10,
    limitLabel: 'tokens/day',
    freeTierNote: 'Free tier',
  },
  mistral: {
    mode: 'tokens',
    defaultDailyLimit: 500_000,
    rpm: 20,
    limitLabel: 'tokens/day',
    freeTierNote: 'Free tier',
  },
  sambanova: {
    mode: 'tokens',
    defaultDailyLimit: 500_000,
    rpm: 15,
    limitLabel: 'tokens/day',
    freeTierNote: 'Free tier',
  },
  bluesminds: {
    mode: 'requests',
    defaultDailyLimit: 300,
    rpm: 20,
    limitLabel: 'requests/day',
    freeTierNote: '500 pi credits · 300 req/day · 20 RPM (free)',
  },
};

export function getProviderBudget(provider: string): ProviderBudgetConfig {
  return (
    PROVIDER_BUDGET[provider] ?? {
      mode: 'tokens',
      defaultDailyLimit: 1_000_000,
      rpm: 10,
      limitLabel: 'tokens/day',
      freeTierNote: '',
    }
  );
}

/** Whether a key still has daily budget left (provider-specific semantics). */
export function isKeyWithinDailyBudget(key: LlmKey): boolean {
  const cfg = getProviderBudget(key.provider);
  if (key.daily_token_limit <= 0) return true;
  switch (cfg.mode) {
    case 'requests':
      return key.requests_today < key.daily_token_limit;
    case 'pi_credits':
      return key.tokens_used_today < key.daily_token_limit;
    default:
      return key.tokens_used_today < key.daily_token_limit;
  }
}

/** Usage % for admin bars — requests for Bluesminds, tokens for others. */
export function keyBudgetPercentUsed(key: LlmKey): number {
  const cfg = getProviderBudget(key.provider);
  const limit = key.daily_token_limit;
  if (limit <= 0) return 0;
  const used =
    cfg.mode === 'requests' ? key.requests_today : key.tokens_used_today;
  return Math.round((used / limit) * 100);
}

/** Budget used/limit pair for admin display. */
export function keyBudgetDisplay(key: LlmKey): {
  used: number;
  limit: number;
  unit: string;
  percent: number;
} {
  const cfg = getProviderBudget(key.provider);
  const used =
    cfg.mode === 'requests' ? key.requests_today : key.tokens_used_today;
  return {
    used,
    limit: key.daily_token_limit,
    unit: cfg.limitLabel,
    percent: keyBudgetPercentUsed(key),
  };
}

/**
 * Rough pi-credit estimate for Bluesminds logging (credits vary by model).
 * Free tier gives 500 pi credits that do not expire — see doc.bluesminds.com.
 */
export function estimateBluesmindsPiCredits(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const total = tokensIn + tokensOut;
  // gpt-4o costs more than mini; use a conservative per-request floor + token factor
  const perToken = model.includes('mini') ? 0.002 : 0.005;
  return Math.max(1, Math.ceil(total * perToken));
}

/**
 * Check if a key's daily counter needs reset (new UTC day since last_reset_at).
 * If yes, resets tokens_used_today and requests_today in the DB.
 */
export async function resetLlmKeyDailyIfNeeded(key: LlmKey): Promise<LlmKey> {
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
    const key = await resetLlmKeyDailyIfNeeded(rawKey as LlmKey);
    if (isKeyWithinDailyBudget(key)) {
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
 *
 * Synthetic keyIds (starting with 'env:') are used for env-var fallback
 * providers (Gemini, Cerebras, Groq, OpenAI from env vars). These skip
 * the DB key increment but still get logged to llm_usage_log so they
 * appear in the Live Key Activity panel.
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
  const isEnvKey = opts.keyId.startsWith('env:');

  // Atomic increment via RPC — only for real DB keys, skip for env-var fallbacks
  if (!isEnvKey) {
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
  }

  // Insert usage log entry (fire and forget)
  // Use null for key_id on env-var fallbacks (no real DB key to reference)
  sb.from('llm_usage_log')
    .insert({
      key_id: isEnvKey ? null : opts.keyId,
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
 * Batch-reset daily counters for keys whose last_reset_at is before today (UTC).
 * Called at the start of each provider-chain build so Cerebras/Groq keys refresh
 * at midnight UTC even if no individual key was fetched.
 */
export async function resetStaleDailyCounters(provider?: string): Promise<number> {
  const sb = supabaseAdmin();
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  let query = sb
    .from('llm_keys')
    .update({
      tokens_used_today: 0,
      requests_today: 0,
      last_reset_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .lt('last_reset_at', todayStart);

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query.select('id');
  if (error) {
    console.error('[llm-keys] resetStaleDailyCounters failed:', error.message);
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(`[llm-keys] UTC daily reset: ${count} key(s)${provider ? ` (${provider})` : ''}`);
  }
  return count;
}

/** Admin: force-reset counters + fix Bluesminds keys misconfigured with token limits. */
export async function repairBluesmindsKeyBudgets(): Promise<{
  reset: number;
  repaired: number;
}> {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const defaultLimit = getProviderBudget('bluesminds').defaultDailyLimit;

  const { data: repaired } = await sb
    .from('llm_keys')
    .update({
      daily_token_limit: defaultLimit,
      updated_at: now,
    })
    .eq('provider', 'bluesminds')
    .gt('daily_token_limit', 1000)
    .select('id');

  const reset = await forceResetProviderCounters('bluesminds');
  return { reset, repaired: repaired?.length ?? 0 };
}

/** Admin: force-reset counters to zero (same day) for one provider or all. */
export async function forceResetProviderCounters(provider?: string): Promise<number> {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  let query = sb
    .from('llm_keys')
    .update({
      tokens_used_today: 0,
      requests_today: 0,
      last_reset_at: now,
      updated_at: now,
    });

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query.select('id');
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** True if the provider has at least one is_active DB key. */
export async function providerHasActiveDbKeys(provider: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from('llm_keys')
    .select('id', { count: 'exact', head: true })
    .eq('provider', provider)
    .eq('is_active', true);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** True if any row exists for this provider (active or disabled). */
export async function providerHasAnyDbKeys(provider: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from('llm_keys')
    .select('id', { count: 'exact', head: true })
    .eq('provider', provider);
  if (error) return false;
  return (count ?? 0) > 0;
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
  const defaults = PROVIDER_DEFAULTS[opts.provider];
  const budget = getProviderBudget(opts.provider);
  const { data, error } = await sb
    .from('llm_keys')
    .insert({
      provider: opts.provider,
      api_key: opts.apiKey,
      label: opts.label ?? null,
      model: opts.model ?? defaults?.model ?? null,
      base_url: opts.baseUrl ?? defaults?.baseUrl ?? null,
      daily_token_limit: opts.dailyTokenLimit ?? budget.defaultDailyLimit,
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
    percentUsed: keyBudgetPercentUsed(k),
    budgetMode: getProviderBudget(k.provider).mode,
    budgetUnit: getProviderBudget(k.provider).limitLabel,
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

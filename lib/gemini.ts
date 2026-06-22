/**
 * AI helpers — Groq (Llama 3.3 70B) is the FREE primary for chat; OpenAI
 * gpt-4o-mini is the paid fallback. Embeddings are OpenAI-only.
 *
 * Chat-based calls (scoreJob, matchSkills, generateAtsResume, etc.) try Groq
 * first (free, if GROQ_API_KEY is set) and fall back to OpenAI (paid, if
 * OPENAI_API_KEY is set). Both use the OpenAI-compatible chat-completions API,
 * so a single code path serves both — Groq just points the same OpenAI SDK at
 * its base URL.
 *
 * ORDER IS CONFIGURABLE via LLM_PRIMARY ("groq" | "openai", default "groq").
 * Vercel and GitHub Actions have separate env, so you can keep Groq primary on
 * the dashboard (on-demand calls = free) while setting LLM_PRIMARY=openai for
 * the ingest cron if Groq's free tokens-per-minute cap throttles the 30-80 job
 * scoring burst. If the chosen primary fails, the chain falls through to the
 * other provider automatically.
 *
 * WHY GROQ INSTEAD OF GEMINI (May 2026): the previous fallback `gemini-2.0-flash`
 * is deprecated (shuts down 2026-06-01) and since 2026-03-06 is "existing
 * customers only", so free/new keys get `429 ResourceExhausted` with `limit: 0`
 * — which LOOKS like a rate limit but means "model not on your plan". Google
 * also cut free-tier limits 50-80% in Dec 2025 and the free tier trains on data
 * (a problem for resumes/PII). Groq's free tier is ~14,400 req/day and fast.
 *
 * NO SILENT MASKING: chat() no longer swallows the OpenAI error with a
 * console.warn. If a provider fails we record its error and try the next; if
 * ALL providers fail we throw a single combined, readable error so the real
 * cause (e.g. OpenAI key missing/exhausted) is visible instead of being hidden
 * behind a fallback failure.
 *
 * Embeddings are OpenAI text-embedding-3-small (1536 dims). Gemini's
 * text-embedding-004 was deprecated by Google on 2026-01-14 (v1beta returns
 * 404). There is no Groq embeddings endpoint, so embeddings are OpenAI-only.
 *
 * NOTE: existing rows have 768-dim vectors stored as JSONB. Cosine similarity
 * returns 0 on length mismatch, so old vectors are silently ignored — no
 * schema migration needed. Run scripts/clear-embeddings.sql once to wipe
 * stale vectors and the next ingest re-embeds at 1536 dims.
 */

import OpenAI from 'openai';
import type { ResumeInsights } from './types';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';
import { isSkillPresentInJd } from './jd-skill-match';
import {
  enrichScoreJobSkills,
  supplementMatchedFromProfile,
  filterMissingSkillsForJd,
} from './match-skill-enrich';
import {
  computeExperienceScoreCap,
  experienceIneligibilityReason,
  inferJdSeniorityFromTitle,
  isExperienceEligible,
  resolveCandidateYears,
  resolveRequiredYears,
  type JdSeniority,
} from './experience-match';
import {
  recordUsage,
  PROVIDER_DEFAULTS,
  resetLlmKeyDailyIfNeeded,
  resetStaleDailyCounters,
  providerHasActiveDbKeys,
  providerHasAnyDbKeys,
  isKeyWithinDailyBudget,
  type LlmKey,
} from './llm-keys';
import { getRateLimiter, keyBucket, RateLimiter } from './rate-limiter';
import {
  getKeyHealthStore,
  computeCapacityScore,
  computeRpmHeadroomScore,
  computeKeyScore,
  estimateProviderRpmLimit,
} from './key-rotator';
import {
  getCooldownKeyIds,
  getKeyFailureCount,
  setKeyCooldownDb,
  clearKeyCooldownDb,
  isKeyOnCooldownDb,
} from './llm-key-runtime';
import { withLlmChatSlot } from './llm-concurrency';

const OPENAI_CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_CHAT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CEREBRAS_CHAT_MODEL = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
const GEMINI_CHAT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const EMBED_MODEL = 'text-embedding-3-small';

// Chat: all free tiers first, OpenAI paid last. LLM_PRIMARY picks which free
// provider is tried first (default cerebras). Embeddings stay OpenAI-only in embed().
const LLM_PRIMARY = (process.env.LLM_PRIMARY || 'cerebras').toLowerCase();

const FREE_CHAT_PROVIDERS = [
  'cerebras',
  'groq',
  'gemini',
  'bluesminds',
  'mistral',
  'sambanova',
] as const;

const PAID_CHAT_PROVIDER = 'openai';

/** Free providers in priority order, then OpenAI always last. */
function getChatProviderOrder(): string[] {
  const primary = LLM_PRIMARY;
  if (primary === PAID_CHAT_PROVIDER) {
    return [...FREE_CHAT_PROVIDERS, PAID_CHAT_PROVIDER];
  }
  return [
    primary,
    ...FREE_CHAT_PROVIDERS.filter((p) => p !== primary),
    PAID_CHAT_PROVIDER,
  ];
}

// Env-var fallbacks for free chat providers only (OpenAI appended separately at end).
const ENV_FALLBACK_PROVIDERS = ['cerebras', 'groq', 'gemini', 'bluesminds'];

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function getGroqClient(): OpenAI | null {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: GROQ_BASE_URL });
}

function getCerebrasClient(): OpenAI | null {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: CEREBRAS_BASE_URL });
}

function getGeminiClient(): OpenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: GEMINI_BASE_URL });
}

function getBluesmindsClient(): OpenAI | null {
  const key = process.env.BLUESMINDS_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: PROVIDER_DEFAULTS.bluesminds.baseUrl,
  });
}

type ProviderEntry = {
  name: string;
  client: OpenAI;
  model: string;
  keyId?: string;
  provider: string;
  keyRow?: LlmKey;
};

/** Round-robin offset per provider (spreads load across scored keys). */
const ROUND_ROBIN_INDEX: Map<string, number> = new Map();
const PROVIDER_CALL_ROTATE: Map<string, number> = new Map();
const EMBED_ROUND_ROBIN_INDEX = { n: 0 };

/** Paid last-resort — skip per-call key rotation (single env key usual). */
const PAID_CHAT_PROVIDERS = new Set([PAID_CHAT_PROVIDER]);

/**
 * Spread parallel chat() calls across keys within each free provider group.
 * Chain cache is shared for 30s — without this, every concurrent scoreJob hits
 * the same first Cerebras key → 429 → cooldown → OpenAI for the rest of the scan.
 */
function spreadProviderChainPerCall(entries: ProviderEntry[]): ProviderEntry[] {
  if (entries.length <= 1) return entries;

  const groups: ProviderEntry[][] = [];
  let current: ProviderEntry[] = [];

  for (const entry of entries) {
    if (current.length === 0 || current[0].provider === entry.provider) {
      current.push(entry);
    } else {
      groups.push(current);
      current = [entry];
    }
  }
  if (current.length) groups.push(current);

  const out: ProviderEntry[] = [];
  for (const group of groups) {
    const provider = group[0].provider;
    if (PAID_CHAT_PROVIDERS.has(provider) || group.length <= 1) {
      out.push(...group);
      continue;
    }
    const idx = (PROVIDER_CALL_ROTATE.get(provider) ?? 0) % group.length;
    PROVIDER_CALL_ROTATE.set(provider, idx + 1);
    out.push(...group.slice(idx), ...group.slice(0, idx));
  }
  return out;
}

async function sortAndRotateProviderEntries(
  provider: string,
  entries: ProviderEntry[],
): Promise<ProviderEntry[]> {
  if (entries.length <= 1) return entries;

  const healthStore = getKeyHealthStore();
  const rpmLimit = estimateProviderRpmLimit(provider);

  const scored = entries.map((e) => {
    const key = e.keyRow;
    if (!key || !e.keyId) return { e, score: 50 };
    const score = computeKeyScore({
      capacityRemaining: computeCapacityScore(key.tokens_used_today, key.daily_token_limit),
      healthScore: healthStore.getHealthScore(e.keyId),
      rpmHeadroom: computeRpmHeadroomScore(healthStore.getRpmCount(e.keyId), rpmLimit),
      latencyScore: healthStore.getLatencyScore(e.keyId),
      priority: key.priority,
      onCooldown: false,
    });
    return { e, score: Math.max(score, 0) };
  });

  scored.sort((a, b) => b.score - a.score);
  const sorted = scored.map((s) => s.e);
  const idx = (ROUND_ROBIN_INDEX.get(provider) ?? 0) % sorted.length;
  ROUND_ROBIN_INDEX.set(provider, idx + 1);
  return [...sorted.slice(idx), ...sorted.slice(0, idx)];
}

/**
 * Get ALL active DB keys for a provider, ordered for round-robin rotation.
 * Skips keys that are on cooldown or have exceeded their daily token limit.
 */
async function getAvailableKeysForProvider(provider: string): Promise<ProviderEntry[]> {
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();

    const { data: keys } = await sb
      .from('llm_keys')
      .select('*')
      .eq('provider', provider)
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (!keys?.length) return [];

    const rawKeys = keys as LlmKey[];
    const resetKeys: LlmKey[] = [];
    for (const raw of rawKeys) {
      resetKeys.push(await resetLlmKeyDailyIfNeeded(raw));
    }

    const eligible = resetKeys.filter((key) => isKeyWithinDailyBudget(key));
    const cooling = await getCooldownKeyIds(eligible.map((k) => k.id));

    const entries: ProviderEntry[] = [];
    const defaults = PROVIDER_DEFAULTS[provider];

    for (const key of eligible) {
      if (cooling.has(key.id)) continue;

      const baseUrl = key.base_url || defaults?.baseUrl || '';
      const model = key.model || defaults?.model || '';
      const client = new OpenAI({ apiKey: key.api_key, baseURL: baseUrl });
      entries.push({
        name: `${provider}[DB:${key.label || key.id.slice(0, 6)}]`,
        client,
        model,
        keyId: key.id,
        provider,
        keyRow: key,
      });
    }

    return sortAndRotateProviderEntries(provider, entries);
  } catch (e) {
    // Graceful fallback for environments (like CLI scripts) without DB config
    return [];
  }
}

/**
 * Build the full provider chain: ALL DB keys (round-robin) per provider,
 * then env-var fallbacks when DB keys are exhausted or missing.
 */
async function buildProviderChain(): Promise<ProviderEntry[]> {
  // UTC midnight reset for all keys (Cerebras/Groq refresh daily budget)
  await resetStaleDailyCounters();

  const chain: ProviderEntry[] = [];

  // 1. Free providers only — OpenAI is always appended last (step 3).
  for (const providerName of getChatProviderOrder()) {
    if (providerName === PAID_CHAT_PROVIDER) continue;
    const dbKeys = await getAvailableKeysForProvider(providerName);
    chain.push(...dbKeys);
  }

  // 2. Env-var fallbacks when no DB key is available right now.
  for (const providerName of ENV_FALLBACK_PROVIDERS) {
    const alreadyInChain = chain.some((p) => p.provider === providerName);
    if (alreadyInChain) continue;

    const hasActive = await providerHasActiveDbKeys(providerName);
    const hasAny = await providerHasAnyDbKeys(providerName);
    if (hasAny && !hasActive) continue; // deliberately disabled

    const fallbackClient = getEnvFallbackClient(providerName);
    if (fallbackClient) {
      chain.push({
        name: `${providerName.charAt(0).toUpperCase() + providerName.slice(1)}[env]`,
        client: fallbackClient,
        model: getEnvFallbackModel(providerName),
        provider: providerName,
        keyId: `env:${providerName}`,
      });
    }
  }

  // 3. OpenAI (paid) — absolute last resort after every free provider/key failed.
  const openaiDbKeys = await getAvailableKeysForProvider(PAID_CHAT_PROVIDER);
  chain.push(...openaiDbKeys);
  if (!chain.some((p) => p.provider === PAID_CHAT_PROVIDER)) {
    const openaiClient = getOpenAIClient();
    if (openaiClient) {
      chain.push({
        name: `OpenAI[env] ${OPENAI_CHAT_MODEL}`,
        client: openaiClient,
        model: OPENAI_CHAT_MODEL,
        provider: PAID_CHAT_PROVIDER,
        keyId: 'env:openai',
      });
    }
  }

  return chain;
}

function getEnvFallbackClient(provider: string): OpenAI | null {
  switch (provider) {
    case 'bluesminds': return getBluesmindsClient();
    case 'cerebras': return getCerebrasClient();
    case 'groq': return getGroqClient();
    case 'gemini': return getGeminiClient();
    default: return null;
  }
}

function getEnvFallbackModel(provider: string): string {
  switch (provider) {
    case 'bluesminds': return PROVIDER_DEFAULTS.bluesminds.model;
    case 'cerebras': return CEREBRAS_CHAT_MODEL;
    case 'groq': return GROQ_CHAT_MODEL;
    case 'gemini': return GEMINI_CHAT_MODEL;
    default: return '';
  }
}

/**
 * Core chat function with intelligent multi-key rotation and usage tracking.
 *
 * Strategy (best practice for free-tier multi-key LLM):
 * 1. Round-robin across ALL keys of the primary provider (spreads RPM load)
 * 2. On 429: cooldown that key for 60s (NOT mark as daily-exhausted) + try next key
 * 3. On success: record ACTUAL tokens from API response (accurate tracking)
 * 4. Only after ALL keys of a provider are exhausted/cooling → try next provider
 * 5. OpenAI (paid) is the absolute last resort
 *
 * This means 5 Cerebras keys with 5 RPM each = effectively 25 RPM (one every 2.4s).
 */
/**
 * Estimate RPM limit for a provider. Checks the estimated RPM for provider type
 * and uses the actual DB key count to scale: if a provider has 5 keys each at
 * ~10 RPM, the effective limit is ~50 RPM.
 */
function getEffectiveRpmLimit(provider: string, keyCount: number): number {
  return estimateProviderRpmLimit(provider) * Math.max(1, keyCount);
}

/**
 * Pre-compute and cache the sorted provider chain with health scoring.
 * The chain is rebuilt every 30s to pick up new/disabled keys without
 * querying the DB on every single chat() call.
 */
const CHAIN_CACHE_TTL = 30_000;
let chainCache: { timestamp: number; entries: ProviderEntry[] } | null = null;

async function buildProviderChainCached(): Promise<ProviderEntry[]> {
  const now = Date.now();
  if (chainCache && now - chainCache.timestamp < CHAIN_CACHE_TTL) {
    return spreadProviderChainPerCall(chainCache.entries);
  }
  const entries = await buildProviderChain();
  chainCache = { timestamp: now, entries };
  return spreadProviderChainPerCall(entries);
}

/**
 * Core chat function with intelligent multi-key rotation and usage tracking.
 *
 * Strategy (best practice for free-tier multi-key LLM):
 * 1. Check per-user rate limits BEFORE making any API call (fail fast)
 * 2. Round-robin across ALL keys of the primary provider (spreads RPM load)
 * 3. On 429: apply exponential backoff cooldown + try next key
 * 4. On success: record ACTUAL tokens from API response (accurate tracking)
 * 5. Only after ALL keys of a provider are exhausted/cooling → try next provider
 * 6. OpenAI (paid) is the absolute last resort
 *
 * Multi-tenant rate limiting:
 *   - Per-user: 120 req/min, 500K tokens/min (prevents one user from hogging)
 *   - Per-key: RPM limit varies by provider (avoids 429s)
 *   - Global: 600 req/min circuit breaker (+ DB semaphore for in-flight cap)
 *
 * To enable per-user rate limiting, pass the user's profileId.
 */
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  jsonMode = false,
  operation = 'chat',
  profileId?: string,
): Promise<string> {
  return withLlmChatSlot(async () => {
    const estimatedTokens = RateLimiter.estimateTokenCost(systemPrompt, userPrompt, 500);
    const rateLimiter = getRateLimiter();

    const bucketKeys: string[] = ['global'];
    if (profileId) bucketKeys.push(`user:${profileId}`);

    const rateResult = rateLimiter.check(bucketKeys, { cost: estimatedTokens });
    if (!rateResult.allowed) {
      console.warn(`[chat] Rate limit hit for ${profileId || 'anonymous'}: ${rateResult.reason}`);
      if (!profileId) {
        throw new Error(`Global rate limit exceeded. ${rateResult.reason}`);
      }
    }

    const providers = await buildProviderChainCached();
    if (providers.length === 0) {
      throw new Error(
        'No chat LLM configured. Add keys in Admin Center or set CEREBRAS_API_KEY / GROQ_API_KEY / OPENAI_API_KEY env vars.',
      );
    }

    const healthStore = getKeyHealthStore();
    const errors: string[] = [];

    for (const provider of providers) {
      if (provider.keyId && (await isKeyOnCooldownDb(provider.keyId))) {
        errors.push(`${provider.name} → on DB cooldown`);
        continue;
      }

      const tryBuckets = [...bucketKeys];
      if (provider.keyId) tryBuckets.push(keyBucket(provider.keyId));
      const keyRate = rateLimiter.check(tryBuckets, { cost: estimatedTokens });
      if (!keyRate.allowed) {
        errors.push(`${provider.name} → ${keyRate.reason ?? 'rate limited'}`);
        continue;
      }

      const startMs = Date.now();
      try {
        const res = await provider.client.chat.completions.create({
          model: provider.model,
          temperature,
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        const content = (res.choices[0]?.message?.content ?? '').trim();

        const tokensIn = res.usage?.prompt_tokens ?? 0;
        const tokensOut = res.usage?.completion_tokens ?? 0;
        const durationMs = Date.now() - startMs;

        if (provider.keyId) {
          healthStore.recordSuccess(provider.keyId, durationMs);
          await clearKeyCooldownDb(provider.keyId);
        }

        if (provider.keyId) {
          recordUsage({
            keyId: provider.keyId,
            provider: provider.provider,
            model: provider.model,
            operation,
            tokensIn,
            tokensOut,
            durationMs: Date.now() - startMs,
            status: 'success',
            profileId,
          });
        }

        return content;
      } catch (e) {
        const msg = (e as Error).message;
        const is429 =
          msg.includes('429') ||
          msg.toLowerCase().includes('rate') ||
          msg.toLowerCase().includes('limit');
        errors.push(`${provider.name} → ${msg}`);
        console.warn(`[chat] ${provider.name} failed, trying next provider: ${msg}`);

        if (provider.keyId) {
          healthStore.recordFailure(provider.keyId);
          if (is429) {
            const failures = (await getKeyFailureCount(provider.keyId)) + 1;
            await setKeyCooldownDb(provider.keyId, failures);
          }
          recordUsage({
            keyId: provider.keyId,
            provider: provider.provider,
            model: provider.model,
            operation,
            tokensIn: 0,
            tokensOut: 0,
            durationMs: Date.now() - startMs,
            status: is429 ? 'rate_limited' : 'error',
            errorMessage: msg,
            profileId,
          });
        }
      }
    }

    throw new Error(`All chat providers failed. ${errors.join(' || ')}`);
  });
}

/** JSON-mode chat shared by ingest helpers (Groq primary, OpenAI fallback). */
export async function llmJsonChat(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
  profileId?: string,
): Promise<string> {
  return chat(systemPrompt, userPrompt, temperature, true, 'llmJsonChat', profileId);
}

const RESUME_EXCERPT_CHARS = 2800;

/**
 * Compact resume context for scoring — avoids re-sending the full 6k resume
 * on every scoreJob call while keeping enough raw text for niche tools.
 */
export function buildResumeContextForScoring(
  resume: string,
  insights?: ResumeInsights | null,
): string {
  if (!insights) return resume.slice(0, 6000);

  const lines: string[] = ['CANDIDATE PROFILE (structured):'];
  if (insights.summary) lines.push(`Summary: ${insights.summary}`);
  if (insights.years_experience != null) {
    lines.push(
      `Experience: ${insights.years_experience} years${insights.seniority ? ` (${insights.seniority})` : ''}`,
    );
  }
  if (insights.top_skills?.length) {
    lines.push(`Core skills: ${insights.top_skills.slice(0, 15).join(', ')}`);
  }
  if (insights.suggested_roles?.length) {
    lines.push(`Target roles: ${insights.suggested_roles.join(', ')}`);
  }
  if (insights.current_location) {
    lines.push(`Location: ${insights.current_location}`);
  }
  lines.push('');
  lines.push('Resume excerpt (full details):');
  lines.push(resume.slice(0, RESUME_EXCERPT_CHARS));
  return lines.join('\n');
}

/**
 * Embed a piece of text using OpenAI text-embedding-3-small (1536 dims).
 * Throws if OPENAI_API_KEY is not set — embeddings are OpenAI-only. Groq has no
 * embeddings endpoint, and Gemini's text-embedding-004 was deprecated.
 */
export async function embed(
  text: string,
  operation = 'embed',
  profileId?: string,
): Promise<number[]> {
  return withLlmChatSlot(async () => {
    const providers = await getOpenAIEmbedProviders();
    if (providers.length === 0) {
      throw new Error('Missing OPENAI_API_KEY or active OpenAI key in Admin');
    }

    const rateLimiter = getRateLimiter();
    const trimmed = text.slice(0, 8000);
    const estimatedTokens = Math.ceil(trimmed.length / 4);
    const bucketKeys: string[] = ['global'];
    if (profileId) bucketKeys.push(`user:${profileId}`);

    const startIdx = EMBED_ROUND_ROBIN_INDEX.n++ % providers.length;
    const rotated = [...providers.slice(startIdx), ...providers.slice(0, startIdx)];
    const errors: string[] = [];

    for (const provider of rotated) {
      if (await isKeyOnCooldownDb(provider.keyId)) {
        errors.push(`${provider.keyId} → on cooldown`);
        continue;
      }

      const tryBuckets = [...bucketKeys, keyBucket(provider.keyId)];
      const rateResult = rateLimiter.check(tryBuckets, { cost: estimatedTokens });
      if (!rateResult.allowed) {
        errors.push(`${provider.keyId} → ${rateResult.reason ?? 'rate limited'}`);
        continue;
      }

      const startMs = Date.now();
      try {
        const result = await provider.client.embeddings.create({
          model: EMBED_MODEL,
          input: trimmed,
        });
        const vector = result.data[0]?.embedding;
        if (!vector) throw new Error('OpenAI embeddings response had no vector');

        const tokensIn = result.usage?.prompt_tokens ?? estimatedTokens;
        await clearKeyCooldownDb(provider.keyId);
        recordUsage({
          keyId: provider.keyId,
          provider: 'openai',
          model: EMBED_MODEL,
          operation,
          tokensIn,
          tokensOut: 0,
          durationMs: Date.now() - startMs,
          status: 'success',
          profileId,
        });

        return vector;
      } catch (e) {
        const msg = (e as Error).message;
        const is429 =
          msg.includes('429') ||
          msg.toLowerCase().includes('rate') ||
          msg.toLowerCase().includes('limit');
        errors.push(`${provider.keyId} → ${msg}`);
        if (is429) {
          const failures = (await getKeyFailureCount(provider.keyId)) + 1;
          await setKeyCooldownDb(provider.keyId, failures);
        }
        recordUsage({
          keyId: provider.keyId,
          provider: 'openai',
          model: EMBED_MODEL,
          operation,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: Date.now() - startMs,
          status: is429 ? 'rate_limited' : 'error',
          errorMessage: msg,
          profileId,
        });
      }
    }

    throw new Error(`All OpenAI embed keys failed. ${errors.join(' || ')}`);
  });
}

async function getOpenAIEmbedProviders(): Promise<Array<{ client: OpenAI; keyId: string }>> {
  const out: Array<{ client: OpenAI; keyId: string }> = [];
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();
    const { data: keys } = await sb
      .from('llm_keys')
      .select('*')
      .eq('provider', 'openai')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    for (const raw of keys ?? []) {
      const key = await resetLlmKeyDailyIfNeeded(raw as LlmKey);
      if (!isKeyWithinDailyBudget(key)) continue;
      const baseUrl = key.base_url || PROVIDER_DEFAULTS.openai.baseUrl;
      out.push({
        client: new OpenAI({ apiKey: key.api_key, baseURL: baseUrl }),
        keyId: key.id,
      });
    }
  } catch {
    // DB unavailable — env only
  }

  if (out.length === 0) {
    const envClient = getOpenAIClient();
    if (envClient) out.push({ client: envClient, keyId: 'env:openai' });
  }

  return out;
}

/**
 * Score a job against a resume on a 0–100 scale and return short reasoning.
 */
export async function scoreJob(args: {
  resume: string;
  insights?: ResumeInsights | null;
  preferences?: string;
  jobTitle: string;
  jobCompany: string | null;
  jobLocation: string | null;
  jobDescription: string | null;
  profileId?: string;
}): Promise<{ score: number; reason: string; matchedSkills: string[]; missingSkills: string[] }> {
  const resumeBlock = buildResumeContextForScoring(args.resume, args.insights);
  // Defensive — strip HTML before any prompt sees it. Some old DB rows still
  // contain raw <p>/<strong> markup that would otherwise confuse the LLM and
  // burn context tokens.
  const cleanJd = sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 4000);
  const candidateYears = resolveCandidateYears({
    insightsYears: args.insights?.years_experience,
  });
  const candidateSeniority = args.insights?.seniority ?? null;
  const titleSeniority = inferJdSeniorityFromTitle(args.jobTitle);
  const preRequiredYears = resolveRequiredYears({
    jdText: cleanJd,
    jobTitle: args.jobTitle,
    jdSeniority: titleSeniority,
  });
  if (
    candidateYears != null &&
    preRequiredYears > 0 &&
    !isExperienceEligible(candidateYears, preRequiredYears)
  ) {
    return {
      score: 0,
      reason: experienceIneligibilityReason(candidateYears, preRequiredYears),
      matchedSkills: [],
      missingSkills: [],
    };
  }
  const userPrompt = `Score how well this job matches the candidate.

CANDIDATE RESUME:
${resumeBlock}

${args.preferences ? `CANDIDATE PREFERENCES:\n${args.preferences}\n` : ''}

JOB POSTING:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Unknown'}
Location: ${args.jobLocation ?? 'Unknown'}
Description:
${cleanJd}

Score this match on a scale of 0-100 where:
  85-100 = excellent fit, most skills match, domain aligns perfectly, seniority matches
  70-84  = strong fit, many skills overlap, worth applying
  55-69  = decent fit, some relevant skills, candidate could adapt
  40-54  = weak fit, few matching skills but adjacent domain
  <40    = poor fit, completely different domain OR seniority is wildly off

SCORING GUIDELINES — READ CAREFULLY:

THE TESTING SUB-SPECIALTIES (CRITICAL RULE):
Performance Engineering, Site Reliability Engineering (SRE), and functional Test Automation / QA are distinct sub-specialties under the broad QA/Testing domain. Do not treat them as identical.
  - If a candidate's background is primarily in Performance Engineering (load testing, profiling, tuning, JMeter, Gatling, LoadRunner) and the job is a general QA / functional Test Automation role (writing Selenium/Cypress E2E tests, manual testing, general QA planning), cap the score at 65. They are adjacent but not a direct fit.
  - If a candidate's background is primarily in general QA / functional Test Automation, and the job is a specialized Performance Engineering role (requiring profiling, load testing, performance tuning), cap the score at 60.
  - Only score 75+ if the sub-specialty matches (e.g., Performance Engineer matching a Performance Engineering/Testing role, or a general QA Automation Engineer matching a QA/Automation role).

OTHER DOMAIN SUB-SPECIALTIES (CRITICAL RULE):
Apply a similar cap for other distinct sub-specialties that are under a shared broad category:
  - Frontend Developer vs. Backend Developer: Cap at 60 unless the candidate's resume explicitly shows professional experience in both or the job is a hybrid "Fullstack" role.
  - Data Scientist vs. Data Engineer vs. Data Analyst: Cap at 60. A statistical ML researcher is not a direct fit for building production database pipelines (ETL/Spark) or writing business intelligence reports (SQL/Tableau).
  - Product Manager vs. Project Manager / Scrum Master: Cap at 50. Product strategy is entirely distinct from scrum facilitation and timeline tracking.
  - DevOps / Platform Engineer vs. Software Developer (Backend/Frontend): Cap at 60. Building infrastructure pipelines is distinct from writing feature code.

⚠️ SENIORITY / EXPERIENCE GAP (HARD CAP — APPLY AFTER skill match):
First, identify the JD's experience requirement and seniority level:
  - Required years: parse the JD ("18+ years", "10+ years", "5-7 years", "minimum 8 years"). If multiple appear, use the HIGHEST. If only "Senior" / "Lead" / "Principal" appears with no years, infer: Senior ≈ 5+, Lead ≈ 8+, Principal/Staff ≈ 10+, Manager ≈ 8+, Director ≈ 12+, VP/Head/Chief ≈ 15+.
  - JD seniority level: one of "ic" (individual contributor), "lead", "manager", "director", "vp", "executive" — based on title keywords (Director, VP, Head of X, Chief, Manager, Lead, Principal, Staff, Senior, etc.).

Then compare to the candidate (CANDIDATE_YEARS=${candidateYears ?? 'unknown'}, CANDIDATE_SENIORITY=${candidateSeniority ?? 'unknown'}):

  YEARS GAP (gap = required - candidate):
    gap ≤ 1     → no penalty
    gap = 2-3   → cap at 78 (decent fit, slightly under)
    gap = 4-6   → cap at 65 (meaningful gap; candidate is genuinely under-experienced)
    gap = 7-10  → cap at 50 (large gap; this is a stretch role at best)
    gap > 10    → cap at 40 (wildly out of range — do NOT score above 40)

  SENIORITY-LEVEL GAP (independent of years; applies on top of years cap):
    Candidate is IC/Senior IC, JD is "director"           → cap at 50
    Candidate is IC/Senior IC, JD is "vp" or "executive"  → cap at 40
    Candidate is "manager", JD is "vp" or "executive"     → cap at 50
    Same level or one step up                              → no penalty

  TAKE THE LOWER of the years cap, the seniority cap, and any domain/testing sub-specialty cap (if applicable). Never override the cap upward — the cap is a HARD ceiling.

WORKED EXAMPLES (apply the rules above):
  • Candidate 7 years, JD "Director of Performance Engineering, 18+ years"
    → Skills/domain align (both performance engineering → would otherwise be 80-90)
    → Years gap = 11 → cap 40. Seniority IC→director → cap 50. Take lower → 40.
    → FINAL: 40-45 with reason mentioning the experience gap.

  • Candidate is Performance Engineer (7 years), JD is "Senior QA Automation Engineer, 5+ years"
    → Skills/domain mismatch (Performance Engineering vs general QA Automation).
    → Apply Testing Sub-specialty Cap: cap at 65.
    → FINAL: 60-65 with reason mentioning that candidate specializes in performance engineering whereas the role is general QA automation.

  • Candidate 7 years (senior), JD "Senior Performance Engineer, 5+ years"
    → Years gap = -2 (over). Seniority same. → No cap.
    → FINAL: 80-90 (skills + domain).

  • Candidate 12 years, JD "Lead Performance Engineer, 10+ years"
    → Years gap = -2. Seniority IC→lead is one step → no penalty.
    → FINAL: 80-90.

OTHER RULES:
- The word "performance" is ambiguous. "Performance Marketer", "Investment Performance Analyst", "Asset Performance Manager" are FINANCE/MARKETING roles, NOT engineering. Score these <40.
- "Performance Test Engineer", "Performance Engineer", "Performance Tester" are the ENGINEERING meaning. Score 75-90 (subject to the seniority cap above).
- Tools are interchangeable: JMeter ≈ Gatling ≈ LoadRunner ≈ Neoload. Don't penalize tool mismatches if the discipline matches.
- A Performance/Testing engineer applying to general "Java Developer" or "Backend Engineer" → score 50-60.
- For genuinely different domains (Frontend Dev, Mobile Dev, Sales, Marketing, Product Mgmt, Data Science) → score <40.
- Location mismatch alone should NEVER drop score below 60 if skills + seniority match.
- Remote jobs get a small boost.

Respond with strict JSON:
{
  "score": <int 0-100>,
  "reason": "<one or two sentences. If a seniority/years cap was applied, explicitly say so (e.g. 'Capped due to 11-year experience gap').>",
  "requiredYears": <int — the JD's required years, your best parse, or 0 if none>,
  "jdSeniority": "<one of: ic, lead, manager, director, vp, executive>",
  "matchedSkills": [<up to 5 SHORT skill/tool/domain keywords that appear in BOTH the JD and the resume — e.g. "JMeter", "Load Testing", "Java". These are WHY it matched.>],
  "missingSkills": [<up to 5 SHORT skill/tool keywords the JD asks for that are NOT clearly in the resume — e.g. "Kubernetes", "Gatling". These are the GAPS. Empty array if none.>]
}

matchedSkills/missingSkills RULES:
- Keep each entry 1-3 words max. Real tools/skills/domains only, no sentences.
- matchedSkills: only include terms genuinely present in BOTH the JOB POSTING (Title or Description) and the resume. Use the exact skill/tool terminology from the JOB POSTING, not the resume (e.g., if the JD requires "JMeter" and candidate knows "LoadRunner", score high under interchangeable tools guidelines but output "JMeter" as matched only if "JMeter" is in the JD). Under no circumstances include tools that are NOT physically present in the JOB POSTING.
- missingSkills: only include terms the JOB POSTING explicitly requires that the resume lacks. Under no circumstances include tools that are NOT physically present in the JOB POSTING.
- If the JD is too short to tell, return best-effort based on the title.`;

  const text = await chat(
    'You are a senior tech recruiter. Respond with JSON only.',
    userPrompt,
    0.2,
    true,
    'scoreJob',
    args.profileId,
  );
  try {
    const parsed = JSON.parse(text);
    let score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    let reason = String(parsed.reason ?? '').slice(0, 500);
    const jdSeniorityRaw = String(parsed.jdSeniority ?? '').toLowerCase().trim();
    const llmSeniority: JdSeniority = ['ic', 'lead', 'manager', 'director', 'vp', 'executive'].includes(
      jdSeniorityRaw,
    )
      ? (jdSeniorityRaw as JdSeniority)
      : 'unknown';
    const jdSeniority: JdSeniority =
      llmSeniority !== 'unknown' ? llmSeniority : titleSeniority;
    const requiredYears = Math.min(
      50,
      resolveRequiredYears({
        jdText: cleanJd,
        jobTitle: args.jobTitle,
        llmRequiredYears: Number(parsed.requiredYears) || 0,
        jdSeniority,
      }),
    );

    // ── Defense-in-depth (server-side cap) ───────────────────────────────
    const { cap, reason: capReason } = computeExperienceScoreCap({
      candidateYears,
      requiredYears,
      candidateSeniority,
      jdSeniority,
    });
    if (
      candidateYears != null &&
      requiredYears > 0 &&
      !isExperienceEligible(candidateYears, requiredYears)
    ) {
      return {
        score: 0,
        reason: experienceIneligibilityReason(candidateYears, requiredYears),
        matchedSkills: [],
        missingSkills: [],
      };
    }
    if (cap < score) {
      score = cap;
      // Append the cap reason if the model didn't already mention it.
      const lower = reason.toLowerCase();
      if (!lower.includes('cap') && !lower.includes('experience gap') && !lower.includes('seniority')) {
        reason = (reason ? reason.replace(/\s*$/, '. ') : '') + `Score capped due to ${capReason}.`;
        reason = reason.slice(0, 500);
      }
    }

    // Strip HTML once so skill lookups work on plain text, not raw markup.
    const sanitizedJd = sanitizeJobDescriptionForAI(args.jobDescription);

    // cleanMatchedSkills: only keep skills the LLM found that also appear in the JD text.
    // This guards against the LLM hallucinating matched skills.
    const cleanMatchedSkills = (arr: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0 && s.length <= 40)
        .filter((s) => isSkillPresentInJd(s, sanitizedJd, args.jobTitle))
        .slice(0, 5);
    };

    // cleanMissingSkills: the LLM already determined these skills are required by the JD
    // but absent from the resume — trust that judgment, just clean the format.
    // Do NOT re-filter through isSkillPresentInJd (that check is for matched skills only).
    const cleanMissingSkills = (arr: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      return filterMissingSkillsForJd(
        arr.map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length <= 40),
        args.jobDescription,
        args.jobTitle,
      );
    };

    const baseMatched = cleanMatchedSkills(parsed.matchedSkills);
    const baseMissing = cleanMissingSkills(parsed.missingSkills);

    const enriched = await enrichScoreJobSkills({
      matchedSkills: baseMatched,
      missingSkills: baseMissing,
      score,
      resume: args.resume,
      topSkills: args.insights?.top_skills,
      jobTitle: args.jobTitle,
      jobDescription: args.jobDescription,
      profileId: args.profileId,
    });

    return {
      score,
      reason,
      matchedSkills: enriched.matchedSkills,
      missingSkills: enriched.missingSkills,
    };
  } catch {
    return { score: 0, reason: 'Failed to parse model response', matchedSkills: [], missingSkills: [] };
  }
}

/**
 * Generate a tailored cover letter for a specific job.
 */
export async function generateCoverLetter(args: {
  resume: string;
  candidateName: string | null;
  jobTitle: string;
  jobCompany: string | null;
  jobDescription: string | null;
  profileId?: string;
}): Promise<string> {
  const userPrompt = `Write a concise, confident cover letter (max 220 words) for this job.
Avoid clichés ("I am writing to apply..."). Lead with a hook tied to the company or role.
Reference 2-3 concrete achievements from the resume that map directly to job requirements.
End with a clear call to action. No emojis. No placeholders like [Your Name] - use the real name if provided.

CANDIDATE NAME: ${args.candidateName ?? 'the candidate'}

CANDIDATE RESUME:
${args.resume.slice(0, 6000)}

JOB:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'the company'}
Description:
${sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 4000)}

Output the cover letter only, no preamble.`;

  return chat(
    'You write tailored cover letters for senior tech roles.',
    userPrompt,
    0.7,
    false,
    'generateCoverLetter',
    args.profileId,
  );
}

/**
 * Extract structured insights from a resume.
 */
export async function extractResumeInsights(
  resume: string,
  profileId?: string,
): Promise<ResumeInsights> {
  const userPrompt = `Read this resume and extract structured insights.

RESUME:
${resume.slice(0, 8000)}

Return strict JSON in this shape:
{
  "full_name": "<candidate's full name as it appears on the resume>",
  "email": "<primary email address from the resume, or null if not present>",
  "current_location": "<city and country, e.g. 'Noida, India', or null>",
  "phone": "<phone number with country code, or null>",
  "years_experience": <number total years of professional experience, decimal allowed (e.g. 7.7 if resume says 7.7 years)>,
  "seniority": "junior" | "mid" | "senior" | "staff" | "principal",
  "top_skills": [<up to 12 most prominent technical skills, lowercase, deduped>],
  "suggested_roles": [<up to 6 specific job titles this candidate is well-positioned for>],
  "summary": "<1-2 sentence professional summary, 200 chars max>"
}

Rules:
- Use null for any field not clearly present in the resume. Do not guess.
- full_name: clean it up if needed but keep it as the candidate writes it.
- current_location: prefer "City, Country". If only city, return city.
- Be specific in suggested_roles (e.g. "Staff Performance Engineer" not "Engineer").
- For seniority: <2y=junior, 2-5y=mid, 5-9y=senior, 9-13y=staff, >13y=principal.
- top_skills must be concrete tools/technologies (e.g. "kubernetes", "jmeter"), not soft skills.
- summary must avoid first person ("Performance engineer with 7+ years..." not "I am a...").`;

  const text = await chat(
    'You parse resumes into structured JSON. Output JSON only.',
    userPrompt,
    0.2,
    true,
    'extractResumeInsights',
    profileId,
  );
  try {
    const parsed = JSON.parse(text);
    const cleanString = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const t = v.trim();
      if (!t || t.toLowerCase() === 'null') return undefined;
      return t;
    };
    return {
      full_name: cleanString(parsed.full_name),
      email: cleanString(parsed.email),
      current_location: cleanString(parsed.current_location),
      phone: cleanString(parsed.phone),
      years_experience:
        typeof parsed.years_experience === 'number'
          ? Math.max(0, Math.round(parsed.years_experience * 10) / 10) // preserve one decimal (e.g. 7.7) instead of rounding to integer
          : undefined,
      seniority: ['junior', 'mid', 'senior', 'staff', 'principal'].includes(
        parsed.seniority,
      )
        ? parsed.seniority
        : 'unknown',
      top_skills: Array.isArray(parsed.top_skills)
        ? parsed.top_skills.slice(0, 12).map(String)
        : [],
      suggested_roles: Array.isArray(parsed.suggested_roles)
        ? parsed.suggested_roles.slice(0, 6).map(String)
        : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : '',
    };
  } catch {
    return { seniority: 'unknown', top_skills: [], suggested_roles: [] };
  }
}

export type StructuredApplicationProfile = {
  work_history: Array<{
    company?: string;
    title?: string;
    location?: string;
    start?: string;
    end?: string;
    summary?: string;
    confidence?: 'high' | 'low';
  }>;
  education: Array<{
    school?: string;
    degree?: string;
    field?: string;
    start?: string;
    end?: string;
    confidence?: 'high' | 'low';
  }>;
  warnings: string[];
};

/**
 * AI extraction of work experience + education for extension / autofill profile.
 * One call — structured like Simplify Copilot's application profile.
 */
export async function extractStructuredApplicationProfile(
  resume: string,
): Promise<StructuredApplicationProfile> {
  const userPrompt = `Read this resume and extract work experience and education for job application autofill.

RESUME:
${resume.slice(0, 12000)}

Return strict JSON:
{
  "work_history": [
    {
      "company": "Employer name only",
      "title": "Job title",
      "location": "City, State/Region, Country if known",
      "start": "Month YYYY or YYYY (e.g. Sep 2024)",
      "end": "Present or Month YYYY",
      "summary": "2-4 sentence role description from resume bullets (third person, no I/me)",
      "confidence": "high" | "low"
    }
  ],
  "education": [
    {
      "school": "University name",
      "degree": "Degree type (e.g. Bachelor's)",
      "field": "Field of study (e.g. Computer Science) — NOT city name",
      "start": "YYYY if known",
      "end": "YYYY graduation",
      "confidence": "high" | "low"
    }
  ],
  "warnings": ["optional strings for ambiguous dates, missing locations, etc."]
}

Rules:
- work_history: newest job first, up to 8 roles. Include ALL employers you can find.
- ONE row per employer company. If the same company appears for multiple client projects, merge into a single entry: span from earliest start to latest end, use the most senior title, and combine summaries with client/project labels (e.g. "Family Dollar (Sep 2020 – Dec 2021): ... Warner Bros (Oct 2018 – Aug 2020): ...").
- Each job MUST have separate "title" (job role) and "company" (employer). NEVER put dates in title or company.
- "start" and "end" are date fields only (e.g. "Sep 2024", "Present") — not title/company.
- summary: synthesize from bullets; max 600 chars per job. Include concrete metrics (%, counts, time saved) and client names when present in the resume.
- location: separate from company — do not put city only in field of study.
- Use null-omission: omit unknown fields rather than guessing.
- confidence low if dates or employer unclear.
- warnings: note anything the candidate should verify.`;

  const text = await chat(
    'You extract resume work history and education into strict JSON. Output JSON only.',
    userPrompt,
    0.15,
    true,
    'extractStructuredApplicationProfile',
  );
  try {
    const parsed = JSON.parse(text);
    return {
      work_history: Array.isArray(parsed.work_history) ? parsed.work_history : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.map(String).slice(0, 8)
        : [],
    };
  } catch {
    return { work_history: [], education: [], warnings: ['AI JSON parse failed'] };
  }
}

/**
 * Compare a JD against a resume. Returns matched and missing skills.
 */
export async function matchSkills(args: {
  jobDescription: string;
  resumeText?: string;
  topSkills?: string[];
  candidateSkills?: string[];
  profileId?: string;
}): Promise<{ matched: string[]; missing: string[] }> {
  const topSkills = args.topSkills ?? args.candidateSkills ?? [];
  const resumeText = args.resumeText ?? '';

  if (!resumeText && topSkills.length === 0) {
    return { matched: [], missing: [] };
  }

  const resumeBlock = resumeText
    ? `\nCANDIDATE RESUME:\n${resumeText.slice(0, 6000)}\n`
    : '';
  const topSkillsBlock = topSkills.length
    ? `\nCANDIDATE TOP SKILLS: ${topSkills.join(', ')}\n`
    : '';
  const jdText = sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 5000);

  const userPrompt = `Compare this job description against the candidate's resume and classify requirements.

JOB DESCRIPTION:
${jdText}
${resumeBlock}${topSkillsBlock}

Extract 8-12 of the MOST IMPORTANT skills/tools the JD requires. Only extract skills/tools that are physically present in the job description text (case-insensitively).
Then classify each as matched (present in resume) or missing (absent from resume).

Synonym rules — count as MATCHED:
- JD "load testing" + resume "performance testing" → MATCHED
- JD "Gatling" + resume "JMeter" → MATCHED (same tool category)
- JD "framework design" + resume "designed test framework" → MATCHED

Return strict JSON:
{
  "jdRequirements": ["skill1", "skill2", ...],
  "matched": ["skill1", ...],
  "missing": ["skill2", ...]
}

INVARIANTS: matched ∪ missing = jdRequirements, matched ∩ missing = ∅`;

  const text = await chat(
    'You compare candidate resumes against job descriptions. Output JSON only.',
    userPrompt,
    0.1,
    true,
    'matchSkills',
    args.profileId,
  );

  let parsed: { jdRequirements?: unknown; matched?: unknown; missing?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return { matched: [], missing: [] };
  }

  const cleanList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map(String).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 80)
      : [];

  const jdRequirements = cleanList(parsed.jdRequirements).filter((r) =>
    isSkillPresentInJd(r, args.jobDescription, null)
  );
  const jdLower = jdRequirements.map(r => r.toLowerCase());
  const isFromJd = (item: string) => {
    const l = item.toLowerCase();
    return jdLower.some(r => r === l || r.includes(l) || l.includes(r)) &&
      isSkillPresentInJd(item, args.jobDescription, null);
  };

  let matched = cleanList(parsed.matched).filter(isFromJd);
  let missing = cleanList(parsed.missing).filter(isFromJd);
  const matchedKeys = new Set(matched.map(m => m.toLowerCase()));
  missing = missing.filter(m => !matchedKeys.has(m.toLowerCase()));

  const dedupe = (arr: string[]) => [...new Map(arr.map(s => [s.toLowerCase(), s])).values()];
  return { matched: dedupe(matched).slice(0, 15), missing: dedupe(missing).slice(0, 8) };
}

// A keyword's placement type, decided by the LLM at extraction time (NOT by a
// hardcoded word list). "tool" => belongs in TECHNICAL SKILLS; "activity" =>
// an activity / methodology / metric / concept that belongs in prose / CORE
// COMPETENCIES, never in the tools list.
export type KeywordType = 'tool' | 'activity';
export type TypedKeyword = { keyword: string; type: KeywordType };

/**
 * Extract ATS-relevant keywords from a job description AND classify each one as
 * a "tool" (named product/technology) or an "activity" (everything else). The
 * LLM does the classification because it understands any tool/activity in any
 * domain - this scales to the whole world of jobs, unlike a hardcoded list. The
 * type travels with each keyword so downstream placement (skills vs prose) is
 * driven by the model's judgement, with the keyword-shape heuristic kept only as
 * a fallback for keywords that arrive without a type.
 */
export async function extractJdKeywordsTyped(args: {
  jobTitle: string;
  jobDescription: string;
}): Promise<TypedKeyword[]> {
  if (!args.jobDescription || args.jobDescription.length < 50) return [];
  const cleanJd = sanitizeJobDescriptionForAI(args.jobDescription);
  if (cleanJd.length < 50) return [];

  const userPrompt = `Extract the ATS-relevant keywords from this job description AND classify each one.

ATS keywords are the specific tools, technologies, frameworks, methodologies, certifications, testing types, metrics, and named processes an automated resume scanner would search for. Skip vague soft-skill phrases ("strong communicator", "team player", "self-starter").

For EACH keyword set "type":
- "tool"     = a concrete, NAMED tool / technology / framework / programming language / platform / library / product (e.g. JMeter, LoadRunner, Splunk, Kubernetes, Python, SoapUI, Grafana). These belong in a TECHNICAL SKILLS list.
- "activity" = anything that is NOT a named product: an activity / testing type / methodology / metric / concept / process / certification / domain term (e.g. load testing, stress testing, baseline testing, distributed systems, KPI, SLA, Agile, Shift-Left Testing, troubleshooting). These belong in prose or a competencies section, NOT in a tools list.

JOB TITLE: ${args.jobTitle}

JOB DESCRIPTION:
${cleanJd.slice(0, 7000)}

RULES:
- Use the EXACT phrasing from the JD whenever possible (e.g. "JMeter" not "Apache JMeter"; "load testing" not "performance testing").
- Each keyword: 1-3 words max.
- Order by importance: most-mentioned + must-have requirements first.
- Skip generic words: "communication", "leadership", "passion", "ownership".
- Aim for 18-25 keywords. Fewer is fine if the JD is short.
- When unsure whether something is a named product, classify it as "activity".

Return strict JSON: {"keywords": [{"keyword": "JMeter", "type": "tool"}, {"keyword": "load testing", "type": "activity"}]}`;

  const text = await chat(
    'You extract ATS keywords from job descriptions and classify each as a "tool" (named product) or "activity" (everything else). Output JSON only.',
    userPrompt,
    0.1,
    true,
    'extractJdKeywords',
  );

  try {
    const parsed = JSON.parse(text);
    const list: unknown[] = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const out: TypedKeyword[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      // Accept both {keyword,type} objects and bare strings (model-drift safety).
      let keyword = '';
      let type: KeywordType = 'activity';
      if (typeof item === 'string') {
        keyword = item.trim();
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        keyword = String(o.keyword ?? o.name ?? '').trim();
        type = o.type === 'tool' ? 'tool' : 'activity';
      }
      if (keyword.length < 2 || keyword.length > 60) continue;
      const lc = keyword.toLowerCase();
      if (seen.has(lc)) continue;
      seen.add(lc);
      out.push({ keyword, type });
    }
    return out.slice(0, 25);
  } catch {
    return [];
  }
}

/**
 * Backward-compatible string-only view of extractJdKeywordsTyped. Existing
 * callers that only need the keyword text keep working unchanged.
 */
export async function extractJdKeywords(args: {
  jobTitle: string;
  jobDescription: string;
}): Promise<string[]> {
  const typed = await extractJdKeywordsTyped(args);
  return typed.map((t) => t.keyword);
}

/**
 * Replace common non-ASCII characters with ASCII equivalents. Older ATS
 * parsers (Taleo, iCIMS) sometimes choke on smart quotes, em-dashes, and
 * unicode bullets. Defense-in-depth on top of the prompt's "ASCII only" rule.
 */
function normalizeAscii(s: string): string {
  return s
    .replace(/[\u2014\u2013]/g, '-')          // em-dash, en-dash
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // smart double quotes
    .replace(/[\u2022\u25CF\u25E6\u2043\u00B7]/g, '-') // bullet variants
    // Arrows → these are NOT in Latin-1, so jsPDF mangles them into garbage
    // (e.g. "source -> SAP" rendered as "s o u r c e !'"). Map to ASCII.
    .replace(/[\u2192\u21D2\u2794\u2799\u279C\u279E\u27A1\u2B95\u27F6\u21FE]/g, '->') // right arrows
    .replace(/[\u2190\u21D0\u27F5]/g, '<-')   // left arrows
    .replace(/[\u2194\u21D4\u27F7]/g, '<->')  // bi-directional arrows
    .replace(/\u00A0/g, ' ')                  // non-breaking space
    .replace(/\u2026/g, '...')                // ellipsis
    .replace(/[\u200B-\u200D\uFEFF]/g, '');   // zero-width chars
}

/**
 * Pull the candidate's OWN LinkedIn URL out of their resume text, normalised to
 * the display form "linkedin.com/in/<handle>" (no protocol/www). Returns null
 * if the resume has no LinkedIn. NEVER fall back to a hard-coded value — doing
 * so leaks one user's contact into another user's resume (multi-tenant bug).
 */
function extractLinkedinFromResume(resume: string): string | null {
  const m = resume.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i,
  );
  if (!m) return null;
  return m[0].replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/** Role-word detector shared by JD title cleaning and resume title extraction. */
const ROLE_TITLE_WORD_RE =
  /\b(engineer|engineering|tester|testing|developer|development|analyst|architect|consultant|specialist|sdet|sre|administrator|coordinator|lead|manager|designer|technician|scientist|programmer)\b/i;

const EXPERIENCE_SECTION_RE =
  /^(PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|WORK HISTORY|EMPLOYMENT|EXPERIENCE|CAREER HISTORY|RELEVANT EXPERIENCE)$/i;

const DATE_IN_LINE_RE =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b\d{4}\b|Present|Current/i;

function isResumeSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  return /^[A-Z][A-Z\s&/-]+$/.test(t);
}

function findExperienceSectionIndex(lines: string[]): number {
  const exact = lines.findIndex((l) => EXPERIENCE_SECTION_RE.test(l.trim()));
  if (exact >= 0) return exact;
  // PDF uploads often use mixed-case headers like "Work Experience" or
  // "Professional experience" that still need to match.
  return lines.findIndex((l) => {
    const t = l.trim();
    return t.length >= 8 &&
      t.length <= 40 &&
      /\b(experience|employment|career)\b/i.test(t) &&
      !t.startsWith('-');
  });
}

function looksLikeResumeContactLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.includes('@')) return true;
  if (/^\+?\d[\d\s().-]{6,}/.test(t)) return true;
  if (/https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (/linkedin\.com|github\.com/i.test(t)) return true;
  const commaMatch = t.match(/^([A-Za-z .'-]{3,30}),\s*([A-Za-z .'-]{2,30})$/);
  if (commaMatch && !ROLE_TITLE_WORD_RE.test(commaMatch[1]) && commaMatch[1].length <= 24) {
    return true;
  }
  return false;
}

/** Pull the job title from a PROFESSIONAL EXPERIENCE header line. */
function parseJobHeaderTitle(line: string): string | null {
  const t = line.trim();
  if (!t || t.startsWith('-') || /^Client:/i.test(t)) return null;

  if (t.includes('|')) {
    const title = t.split('|')[0].trim();
    if (title.length >= 3 && title.length <= 80) return title;
  }

  const atMatch = t.match(/^(.+?)\s+at\s+.+/i);
  if (atMatch) {
    const title = atMatch[1].trim();
    if (title.length >= 3 && title.length <= 80) return title;
  }

  // Common PDF layout: title on its own line (no pipes), often before dates/company.
  if (
    t.length >= 3 &&
    t.length <= 80 &&
    !DATE_IN_LINE_RE.test(t) &&
    ROLE_TITLE_WORD_RE.test(t)
  ) {
    return t.split('|')[0].trim();
  }

  return null;
}

/**
 * Extract the candidate's current/most-recent role title from THEIR resume text.
 * Never returns a hard-coded default — multi-tenant safety.
 */
function extractCurrentRoleTitleFromResume(resume: string): string | null {
  const lines = resume
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Generated / structured resumes: line 2 is often the title tagline.
  if (lines.length >= 2) {
    const line2 = lines[1].split('|')[0].trim();
    if (
      !looksLikeResumeContactLine(line2) &&
      !isResumeSectionHeader(line2) &&
      line2.length >= 3 &&
      line2.length <= 80 &&
      !DATE_IN_LINE_RE.test(line2)
    ) {
      return line2;
    }
  }

  const expIdx = findExperienceSectionIndex(lines);
  if (expIdx >= 0) {
    for (let i = expIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isResumeSectionHeader(line)) break;
      if (line.startsWith('-') || /^Client:/i.test(line)) continue;

      const parsed = parseJobHeaderTitle(line);
      if (parsed) return parsed;

      // PDF layout: company line then title line, or title then dates.
      const next = lines[i + 1]?.trim() ?? '';
      const bare = line.split('|')[0].trim();
      if (
        bare.length >= 3 &&
        bare.length <= 80 &&
        ROLE_TITLE_WORD_RE.test(bare) &&
        !DATE_IN_LINE_RE.test(bare)
      ) {
        if (
          DATE_IN_LINE_RE.test(next) ||
          next.startsWith('-') ||
          parseJobHeaderTitle(next) !== null
        ) {
          return bare;
        }
        // First role-like line after experience header is usually current title.
        return bare;
      }
    }
  }

  return null;
}

/**
 * Deterministic guarantee: line 2 of the generated resume MUST be the role
 * title when we resolved one. The LLM sometimes drops it despite the prompt.
 */
function ensureContactBlockTitle(
  text: string,
  candidateName: string,
  title: string,
): { text: string; inserted: boolean } {
  const roleTitle = title.trim();
  const name = candidateName.trim();
  if (!roleTitle || !name) return { text, inserted: false };

  const lines = text.split('\n');
  let nameIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || HEADER_LABELS_TO_SKIP.test(t)) continue;
    nameIdx = i;
    break;
  }
  if (nameIdx < 0) return { text, inserted: false };

  // Ensure line 1 is the candidate name (LLM sometimes drifts).
  if (lines[nameIdx].trim() !== name) {
    lines[nameIdx] = name;
  }

  let insertAt = nameIdx + 1;
  while (insertAt < lines.length && !lines[insertAt].trim()) insertAt++;

  if (insertAt >= lines.length) {
    lines.splice(nameIdx + 1, 0, '', roleTitle);
    return { text: lines.join('\n'), inserted: true };
  }

  const line2 = lines[insertAt].trim();
  if (line2.toLowerCase() === roleTitle.toLowerCase()) {
    // ALL CAPS titles match isResumeSectionHeader() and break pdf-resume.ts
    // unless normalized to mixed case (see parse() title-before-section fix).
    if (isResumeSectionHeader(line2) && line2 !== roleTitle) {
      lines[insertAt] = roleTitle;
      return { text: lines.join('\n'), inserted: true };
    }
    return { text: lines.join('\n'), inserted: false };
  }

  if (looksLikeResumeContactLine(line2) || isResumeSectionHeader(line2)) {
    lines.splice(insertAt, 0, roleTitle);
    return { text: lines.join('\n'), inserted: true };
  }

  // Wrong/missing title on line 2 — replace in place.
  lines[insertAt] = roleTitle;
  return { text: lines.join('\n'), inserted: true };
}

/** Skip labels the PDF parser also ignores (shared with pdf-resume.ts). */
const HEADER_LABELS_TO_SKIP = /^(resume|curriculum\s+vitae|cv|profile|c\.?v\.?)$/i;

/**
 * Resolve the title to align the candidate's current role with the JD.
 * Priority: cleaned JD title → candidate's own resume title → null (keep as-is).
 */
function resolveTargetCurrentRoleTitle(
  jdTitle: string,
  resumeText: string,
): string | null {
  const fromJd = cleanJdTitle(jdTitle);
  if (fromJd) return fromJd;
  return extractCurrentRoleTitleFromResume(resumeText);
}

/**
 * Whole-token, case-insensitive keyword matcher. Replaces the old
 * `text.toLowerCase().includes(kw.toLowerCase())` substring check, which
 * produced false positives — "AI" matched "available", "Java" matched
 * "JavaScript", "SRE" matched "ensure" — inflating the ATS Match Score and
 * making the same keyword show as both present and missing.
 *
 * Instead of `\b` (which breaks on keywords ending in non-word chars like
 * "C++", "CI/CD", ".NET"), we require the keyword to be bounded by either the
 * string edge or a non-alphanumeric character on each side. Multi-word
 * keywords ("load testing") and symbol-bearing keywords ("C++") are handled.
 */
export function keywordInText(keyword: string, text: string): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  if (keywordLiteralInText(kw, text)) return true;

  // Multi-word JD phrases often appear in singular/plural in prose
  // ("performance bottleneck" vs "performance bottlenecks"). Accept a single
  // trailing s toggle on the last token so we don't mark a woven keyword missing.
  const parts = kw.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last.length > 3 && /[a-z]/i.test(last)) {
      if (last.endsWith('s')) {
        const singular = [...parts.slice(0, -1), last.slice(0, -1)].join(' ');
        if (keywordLiteralInText(singular, text)) return true;
      } else {
        const plural = [...parts.slice(0, -1), `${last}s`].join(' ');
        if (keywordLiteralInText(plural, text)) return true;
      }
    }
  }
  return false;
}

function keywordLiteralInText(keyword: string, text: string): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return re.test(text);
}

/**
 * Defense-in-depth safety net for the "model added a keyword I never selected"
 * bug. Unselected JD tool/tech keywords (e.g. Grafana, InfluxDB) that the model
 * invents almost always land as comma-separated items on a TECHNICAL SKILLS
 * "Category: a, b, c" line. This removes EXACT item matches from those skills
 * lines only - prose bullets and summaries are never touched (a bullet starts
 * with "- ", so it never matches the category-line pattern). Returns the cleaned
 * text and the list of items actually removed.
 *
 * This is intentionally conservative: it cannot create dangling commas (it
 * rebuilds the list from kept items) and drops a category line entirely if every
 * item on it was unauthorized.
 */
export function stripUnauthorizedSkillKeywords(
  text: string,
  unauthorized: string[],
): { text: string; removed: string[] } {
  if (unauthorized.length === 0) return { text, removed: [] };
  const unauthSet = new Set(unauthorized.map(k => k.toLowerCase()));
  const removed = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    // A skills category line: a label, then a colon, then the list. Bullets
    // ("- ...") and the contact block never match because they don't have a
    // leading "Label:" of word characters.
    const m = line.match(/^(\s*[A-Za-z][A-Za-z0-9 &\/+().'-]*:\s*)(.+)$/);
    if (!m) { out.push(line); continue; }
    const items = m[2].split(',').map(s => s.trim()).filter(Boolean);
    // Only treat it as a skills list if it actually looks like a comma list OR
    // the single item is one of the unauthorized keywords (single-tool category).
    const kept = items.filter(it => {
      if (unauthSet.has(it.toLowerCase())) { removed.add(it); return false; }
      return true;
    });
    if (kept.length === items.length) { out.push(line); continue; }
    if (kept.length === 0) continue; // whole category was unauthorized -> drop line
    out.push(m[1] + kept.join(', '));
  }
  return { text: out.join('\n'), removed: [...removed] };
}

/**
 * Deterministic LAST-RESORT net for TOOL-like keywords only. Appends the given
 * keywords verbatim to the TECHNICAL SKILLS section - prepended to the first
 * "Category: ..." line (creating a line or the section if absent). Prose bullets
 * are never touched.
 *
 * IMPORTANT: callers must pass only genuine tool/technology keywords here (see
 * isSkillLikeKeyword). Activities, methodologies, metrics, and concepts
 * (e.g. "load testing", "KPI", "distributed systems") must NEVER be force-listed
 * as skills - they are placed in prose by the LLM repair pass instead. This net
 * exists purely so a skipped TOOL keyword (e.g. "JMeter") never silently drops.
 *
 * Because we insert the EXACT keyword text, keywordInText() matches it on the
 * re-score, so the chip reliably moves to "Added". Returns the cleaned text and
 * the keywords actually inserted.
 */
export function ensureSelectedKeywordsPresent(
  text: string,
  required: string[],
): { text: string; added: string[] } {
  if (required.length === 0) return { text, added: [] };

  // Keep only the genuinely-absent selections (case-insensitive, de-duped).
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const kw of required) {
    const k = kw.trim();
    if (!k) continue;
    const lc = k.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    if (!keywordInText(k, text)) missing.push(k);
  }
  if (missing.length === 0) return { text, added: [] };

  const lines = text.split('\n');

  // An ALL-CAPS section header alone on a line (e.g. "TECHNICAL SKILLS").
  const isSectionHeader = (l: string) => {
    const t = l.trim();
    return t.length >= 3 && /^[A-Z][A-Z0-9 &/]*$/.test(t) && t === t.toUpperCase();
  };
  // A "Label: item, item" skills/category line (same shape strip uses).
  const catRe = /^(\s*[A-Za-z][A-Za-z0-9 &\/+().'-]*:\s*)(.+)$/;

  const skillsHeaderIdx = lines.findIndex(l => /^\s*TECHNICAL SKILLS\s*$/i.test(l));

  // No skills section -> append a fresh one at the end of the resume.
  if (skillsHeaderIdx === -1) {
    const block = ['', 'TECHNICAL SKILLS', `Additional Skills: ${missing.join(', ')}`];
    return { text: [...lines, ...block].join('\n'), added: missing };
  }

  // Find the first category line inside the section (stop at the next header).
  let catIdx = -1;
  for (let i = skillsHeaderIdx + 1; i < lines.length; i++) {
    if (isSectionHeader(lines[i])) break;
    if (catRe.test(lines[i])) { catIdx = i; break; }
  }

  if (catIdx !== -1) {
    const m = lines[catIdx].match(catRe)!;
    const existing = m[2].split(',').map(s => s.trim()).filter(Boolean);
    lines[catIdx] = m[1] + [...missing, ...existing].join(', ');
    return { text: lines.join('\n'), added: missing };
  }

  // Skills section exists but has no category line -> insert one under it.
  lines.splice(skillsHeaderIdx + 1, 0, `Additional Skills: ${missing.join(', ')}`);
  return { text: lines.join('\n'), added: missing };
}

// Activity / process words. A keyword containing any of these (as a whole word)
// is an action or methodology, not a tool, and must NOT be listed under
// TECHNICAL SKILLS (e.g. "load testing", "performance test reports").
const ACTIVITY_WORDS = new Set([
  'testing', 'test', 'tests', 'analysis', 'analytics', 'analyzing', 'analysing',
  'reporting', 'report', 'reports', 'tuning', 'optimization', 'optimisation',
  'planning', 'management', 'engineering', 'assessment', 'tracking',
  'troubleshooting', 'benchmarking', 'monitoring', 'governance', 'strategy',
  'methodology', 'methodologies', 'lifecycle', 'process', 'processes',
  'migration', 'administration', 'mentoring', 'leadership', 'collaboration',
  'coordination', 'debugging', 'diagnostics', 'design', 'development',
  'validation', 'verification', 'review', 'reviews',
]);

// Concept / metric keywords that read as jargon in a skills list and belong in
// prose (summary / achievements / experience) instead.
const CONCEPT_TERMS = new Set([
  'kpi', 'kpis', 'sla', 'slo', 'sli', 'sla/slo/sli', 'roi', 'mttr', 'mtbf',
  'distributed systems', 'distributed system', 'shift-left', 'shift left',
  'shift-left testing', 'agile', 'scrum', 'agile/scrum', 'devops', 'waterfall',
  'microservices', 'observability', 'reliability', 'scalability',
]);

// Known multi-word tool/product names that would otherwise be mis-read as prose
// (they have spaces but no tool-ish suffix). A concrete named product belongs in
// TECHNICAL SKILLS, not CORE COMPETENCIES.
const KNOWN_TOOL_PHRASES = new Set([
  'soap ui', 'soapui', 'load runner', 'loadrunner', 'visual studio',
  'visual studio code', 'sql server', 'power bi', 'azure devops',
  'apache jmeter', 'rest assured', 'selenium grid', 'spring boot',
]);

/**
 * Heuristic: is this keyword a concrete tool/technology (belongs in TECHNICAL
 * SKILLS) versus an activity / methodology / metric / concept (belongs in CORE
 * COMPETENCIES / woven into prose)? Deliberately conservative - it biases toward
 * "prose" so activities are never force-listed as skills. Consulted only by the
 * deterministic guarantee to decide WHICH section a leftover lands in; the LLM
 * repair pass does the natural placement first.
 */
export function isSkillLikeKeyword(keyword: string): boolean {
  const lc = keyword.trim().toLowerCase();
  if (!lc) return false;
  if (KNOWN_TOOL_PHRASES.has(lc)) return true;
  if (CONCEPT_TERMS.has(lc)) return false;
  // Tool-ish suffix (e.g. "JVM monitoring tools", "X framework") => a skill,
  // even if it contains an activity word - checked before ACTIVITY_WORDS.
  if (/(tools?|frameworks?|platforms?|suites?|libraries|library|sdk|db)$/.test(lc)) return true;
  const words = lc.split(/[^a-z0-9+#.]+/).filter(Boolean);
  if (words.some(w => ACTIVITY_WORDS.has(w))) return false;
  // A single non-concept token is almost always a concrete tool/language
  // (JMeter, Splunk, Python, Gatling, k6, Docker).
  if (words.length === 1) return true;
  // Multi-word and not a recognised tool pattern: treat as prose to be safe.
  return false;
}

/**
 * Hard deterministic guarantee for ACTIVITY / METHODOLOGY / METRIC / CONCEPT
 * keywords (e.g. "load testing", "KPI", "distributed systems"). These are NOT
 * tools, so they must never be force-listed under TECHNICAL SKILLS. Instead we
 * guarantee their presence in a CORE COMPETENCIES section - a standard ATS
 * section for exactly this kind of term. The LLM repair pass weaves them into
 * prose first when it can; this net only fires for whatever the model still
 * skipped, so nothing the user selected is ever silently dropped.
 *
 * Existing CORE COMPETENCIES / AREAS OF EXPERTISE section -> append to it.
 * Otherwise create one (placed right before TECHNICAL SKILLS if present, else at
 * the end). Returns the updated text and the keywords actually inserted.
 */
export function ensureCompetencyKeywordsPresent(
  text: string,
  required: string[],
): { text: string; added: string[] } {
  if (required.length === 0) return { text, added: [] };

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const kw of required) {
    const k = kw.trim();
    if (!k) continue;
    const lc = k.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    if (!keywordInText(k, text)) missing.push(k);
  }
  if (missing.length === 0) return { text, added: [] };

  const lines = text.split('\n');
  const isSectionHeader = (l: string) => {
    const t = l.trim();
    return t.length >= 3 && /^[A-Z][A-Z0-9 &/]*$/.test(t) && t === t.toUpperCase();
  };
  const compHeaderRe = /^\s*(CORE COMPETENCIES|AREAS OF EXPERTISE|KEY COMPETENCIES)\s*$/i;

  const compIdx = lines.findIndex(l => compHeaderRe.test(l));
  if (compIdx !== -1) {
    // Append to the first content line under the header, or insert one.
    let contentIdx = -1;
    for (let i = compIdx + 1; i < lines.length; i++) {
      if (isSectionHeader(lines[i])) break;
      if (lines[i].trim()) { contentIdx = i; break; }
    }
    if (contentIdx !== -1) {
      const existing = lines[contentIdx].split(',').map(s => s.trim()).filter(Boolean);
      lines[contentIdx] = [...missing, ...existing].join(', ');
    } else {
      lines.splice(compIdx + 1, 0, missing.join(', '));
    }
    return { text: lines.join('\n'), added: missing };
  }

  // No competencies section -> create one, preferably just before TECHNICAL SKILLS.
  const skillsIdx = lines.findIndex(l => /^\s*TECHNICAL SKILLS\s*$/i.test(l));
  if (skillsIdx !== -1) {
    lines.splice(skillsIdx, 0, 'CORE COMPETENCIES', missing.join(', '), '');
    return { text: lines.join('\n'), added: missing };
  }
  return { text: [...lines, '', 'CORE COMPETENCIES', missing.join(', ')].join('\n'), added: missing };
}

/**
 * Focused LLM repair pass. Runs only when the main generation skipped some of
 * the user's selected keywords. It re-inserts ONLY those few missing keywords,
 * each in its natural place: tools go to TECHNICAL SKILLS, but activities /
 * methodologies / metrics / concepts (load testing, KPI, distributed systems,
 * etc.) are woven into the summary / achievements / experience instead of being
 * force-listed as skills. Returns the full updated resume (ASCII-normalised).
 */
async function weaveKeywordsIntoResume(args: {
  resume: string;
  missingKeywords: string[];
  jobTitle: string;
}): Promise<string> {
  const prompt = `You are editing an already-formatted ATS resume. Insert each of the MISSING KEYWORDS below so it appears at least once, placing EACH in the MOST NATURAL location.

PLACEMENT RULES (this is the whole point of this edit):
- If a keyword is a concrete TOOL / TECHNOLOGY / FRAMEWORK / PROGRAMMING LANGUAGE / PLATFORM / LIBRARY (a named product or language, e.g. JMeter, Splunk, Kubernetes, Python), add it to the most appropriate "Category: ..." line under TECHNICAL SKILLS.
- If a keyword is an ACTIVITY, TESTING TYPE, METHODOLOGY, METRIC, or CONCEPT (e.g. load testing, stress testing, endurance testing, baseline testing, distributed systems, KPI, SLA), it is NOT a skill. DO NOT list it under TECHNICAL SKILLS. Instead weave it naturally into the PROFESSIONAL SUMMARY, a KEY ACHIEVEMENTS bullet, or a relevant PROFESSIONAL EXPERIENCE bullet, rephrasing the sentence minimally and truthfully so it reads like real experience.
- Use the EXACT keyword wording given (e.g. write "load testing", not "load tests").

HARD RULES:
- Insert ONLY the MISSING KEYWORDS listed below. Do NOT introduce any other new tool, technology, methodology, or skill.
- Preserve every existing fact, company, date, number, section header, and bullet. Do not delete content; only the minimal rephrasing needed to weave a keyword in is allowed.
- Do NOT fabricate experience. The candidate's resume already describes performance/QA/testing work - attach each activity keyword to that existing work.
- Output plain ASCII only. No markdown fences, no preamble, no commentary.
- The FIRST non-empty line MUST stay the candidate's name; the SECOND line the role title tagline.

MISSING KEYWORDS (insert each at least once, placed per the rules above):
${args.missingKeywords.map(k => `  - ${k}`).join('\n')}

TARGET ROLE (for natural phrasing context only): ${args.jobTitle}

CURRENT RESUME (return the COMPLETE updated resume):
${args.resume.slice(0, 16000)}`;

  const raw = await chat(
    'You make minimal, truthful edits to an ATS resume so specific keywords appear in the most natural place. Tools go in the skills section; activities and metrics are woven into prose. Output ONLY the full updated resume in plain ASCII.',
    prompt,
    0.2,
    false,
    'generateAtsResume',
  );
  return normalizeAscii(raw);
}

/**
 * Clean a job-listing title down to a recruiter-presentable role title.
 * The JD's listing title is full of noise that should never reach the
 * candidate's resume - department codes (CX, RX), version numbers (II, III),
 * year ranges, location pipes, hiring tail words, parenthetical departments,
 * dash-separated designations ("- Assistant Manager"), and slash-separated
 * specializations ("/ Backend").
 * If the parenthetical contents look like a real role (engineer / tester /
 * developer / etc.), prefer the parenthetical because it's usually the
 * better-formed title (e.g. "Tester II, Product (Performance Tester)" =>
 * "Performance Tester").
 *
 * Examples:
 *   "Specialist Performance Engineer, CX"                       -> "Specialist Performance Engineer"
 *   "Tester II, Product (Performance Tester)"                   -> "Performance Tester"
 *   "Senior Performance Testing Engineer - Assistant Manager"   -> "Senior Performance Testing Engineer"
 *   "Performance Engineer / Backend"                            -> "Performance Engineer"
 *   "Sr Performance Engineer - 5-8 yrs - Pune"                  -> "Sr Performance Engineer"
 *   "Performance Tester | Bangalore | Hybrid"                   -> "Performance Tester"
 *   "Senior SDET (BFSI)"                                        -> "Senior SDET"
 *   "QA Engineer III"                                           -> "QA Engineer"
 *   ""                                                          -> null (caller uses resume title)
 */
function cleanJdTitle(raw: string): string | null {
  const ROLE_RE = ROLE_TITLE_WORD_RE;
  // Domain / specialization words. A title side that has one of these names
  // the ACTUAL role (e.g. "Performance Engineering"), and should win over a
  // bare seniority phrase like "Senior Lead" that only has a generic role word.
  const DOMAIN_RE = /\b(performance|load|stress|qa|quality|automation|sdet|test|testing|reliability|sre|backend|frontend|fullstack|full-stack|devops|data|ml|ai|security|cloud|platform|infrastructure|mobile|android|ios|web|api|database|network|systems?|embedded|firmware|analytics)\b/i;
  let t = (raw ?? '').trim();

  // 0. Normalise hyphen separators that have a space on AT LEAST one side
  //    into a canonical " - ". This catches "Senior Lead- Performance" (space
  //    only after the dash) which the old code missed. Hyphenated compound
  //    words like "full-stack" / "front-end" / "e-commerce" have NO adjacent
  //    spaces, so they are left intact.
  t = t.replace(/\s+-\s*/g, ' - ').replace(/\s*-\s+/g, ' - ');

  // 1. If there's a parenthetical that looks like a real role, prefer IT.
  //    Otherwise just strip parentheticals (they're usually department/skill
  //    annotations like "(BFSI)", "(WFH)", "(Pune)").
  const parenMatch = t.match(/\(([^)]+)\)/);
  if (parenMatch && ROLE_RE.test(parenMatch[1])) {
    t = parenMatch[1].trim();
  } else {
    t = t.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  }

  // 2. Strip everything after the first comma (department/location).
  t = t.split(',')[0].trim();

  // 2.5. Resolve " - " / " / " separators by picking the side that names the
  //      ACTUAL role. Old bug: "Senior Lead - Performance Engineering" became
  //      "Senior Lead" because "lead" is a role word — losing the real
  //      specialization. Now we prefer the side that has a DOMAIN word.
  //        "Senior Lead - Performance Engineering"          -> "Performance Engineering"
  //        "Senior Performance Testing Engineer - Asst Mgr" -> "Senior Performance Testing Engineer"
  //        "QA Engineer / Backend"                          -> "QA Engineer"
  //        "Performance Tester - Banking"                   -> "Performance Tester"
  for (const sep of [' - ', ' / ']) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      const before = t.slice(0, idx).trim();
      const after = t.slice(idx + sep.length).trim();
      const beforeRole = ROLE_RE.test(before);
      const afterRole = ROLE_RE.test(after);
      const beforeDomain = DOMAIN_RE.test(before);
      const afterDomain = DOMAIN_RE.test(after);
      // The after-side names a specialization the before-side lacks -> take it.
      if (afterRole && afterDomain && !beforeDomain) {
        t = after;
        break;
      }
      // Otherwise the before-side is the role (it has a domain, or the after
      // side is just a designation/department with no specialization).
      if (beforeRole && (beforeDomain || !afterDomain)) {
        t = before;
        break;
      }
      // Fallback: whichever side has a role word.
      if (afterRole) {
        t = after;
        break;
      }
    }
  }

  // 3. Strip year ranges ("- 4 to 8 years", "- 5-8 yrs"). Largely redundant
  //    after step 2.5 but kept as a safety net for "Engineer- 5 yrs" without
  //    the surrounding spaces that step 2.5 requires.
  t = t.replace(/\s*-\s*\d.*$/i, '').trim();

  // 4. Strip pipe-separated trail (location, work mode).
  t = t.replace(/\s*\|\s*.*$/, '').trim();

  // 5. Strip "at Company X".
  t = t.replace(/\s+at\s+.*$/i, '').trim();

  // 6. Strip hiring/work-mode tail keywords.
  t = t.replace(
    /\s*\b(opening|openings|jobs?|hiring|wfh|remote|fulltime|full-time|contract|permanent|onsite|hybrid|immediate joiner|notice period)\b.*$/i,
    '',
  ).trim();

  // 7. Strip trailing Roman numerals (II, III, IV ...).
  t = t.replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)$/g, '').trim();

  // 8. Strip a trailing 1-3 letter ALL-CAPS dept code (CX, RX, EU, US, APAC,
  //    etc.) as long as it's NOT the only word and the title still has at
  //    least one role-like keyword left after stripping. Without that guard
  //    we'd murder titles like "AI Engineer" -> "Engineer".
  const words = t.split(/\s+/);
  if (words.length > 1) {
    const last = words[words.length - 1];
    if (/^[A-Z]{1,3}$/.test(last)) {
      const candidate = words.slice(0, -1).join(' ').trim();
      if (ROLE_RE.test(candidate)) t = candidate;
    }
  }

  // 9. Strip stray dept descriptor tail words that often follow a comma we
  //    already stripped (defensive, in case the title used " - " instead of
  //    a comma to attach the dept). GUARDED: only strip when a role keyword
  //    still remains afterwards, so "Performance Engineering" keeps its
  //    "Engineering" (stripping it would leave a bare "Performance").
  {
    const stripped = t
      .replace(/\s+(product|platform|engineering|operations|infrastructure|technology|technologies)\b\s*$/i, '')
      .trim();
    if (stripped !== t && ROLE_RE.test(stripped)) t = stripped;
  }

  // 9.5. Strip a trailing requisition-ID-like token (contains 3+ digits),
  //      e.g. "QA Performance Tester IRC294922" -> "QA Performance Tester",
  //      "Performance Engineer REQ-12345" -> "Performance Engineer". Guarded:
  //      only strip when a role keyword still remains.
  {
    const stripped = t.replace(/\s+[A-Za-z]*\d{3,}[A-Za-z0-9-]*$/i, '').trim();
    if (stripped !== t && ROLE_RE.test(stripped)) t = stripped;
  }

  // 10. Final tidy.
  t = t.replace(/[,;:\-]\s*$/, '').trim();

  // 11. Sanity check. Return null if unusable — NEVER fall back to a
  //     hard-coded title (that leaked the owner's role into every tenant).
  if (t.length < 4 || t.length > 70) return null;
  if (t.split(/\s+/).length > 8) return null;
  if (!ROLE_RE.test(t)) return null;
  return t;
}

/**
 * Generate an ATS-optimised plain-text resume tailored to a specific job.
 *
 * Two-pass design:
 *   1. extractJdKeywords() reads the JD and returns the keywords that matter
 *      for THIS job (not a static list).
 *   2. The resume prompt is built around those JD keywords, with conditional
 *      directives (AI summary only if JD mentions AI; JMeter Performance
 *      Center bullet only for performance/test/QA roles).
 *
 * Returns an honest ATS Match Score (% of JD keywords actually present in
 * the generated resume) so the user can see whether to regenerate.
 */
export async function generateAtsResume(args: {
  resumeText: string;
  jobTitle: string;
  jobCompany: string | null;
  jobDescription: string;
  candidateName: string | null;
  email: string;
  phone?: string | null;
  location?: string | null;
  selectedKeywords?: string[];
  excludedKeywords?: string[]; // user-specified keywords that MUST NOT appear
  jdKeywords?: string[]; // optional: caller can supply pre-extracted keywords
  keywordTypes?: Record<string, KeywordType>; // optional: LLM-decided tool/activity tags, keyed by keyword
}): Promise<{
  resume: string;
  ats_match_score: number;
  jd_keywords: string[];
  added: string[];
  alreadyHad: string[];
  missing: string[];
}> {
  const { selectedKeywords = [], excludedKeywords = [] } = args;

  // ── Pass 1: extract JD-specific keywords (unless caller already did) ────────
  // typeMap (lowercased keyword -> 'tool'|'activity') is the LLM's placement
  // judgement. It is the source of truth for skills-vs-prose placement; the
  // keyword-shape heuristic (isSkillLikeKeyword) is only a fallback for keywords
  // that arrive without an LLM type.
  const typeMap = new Map<string, KeywordType>();
  let jdKeywords: string[];
  if (args.jdKeywords?.length) {
    jdKeywords = args.jdKeywords;
  } else {
    const typed = await extractJdKeywordsTyped({
      jobTitle: args.jobTitle,
      jobDescription: args.jobDescription,
    });
    jdKeywords = typed.map(t => t.keyword);
    for (const t of typed) typeMap.set(t.keyword.toLowerCase(), t.type);
  }
  // Client-supplied tags (captured at extraction time in the GET route) are
  // authoritative when present.
  if (args.keywordTypes) {
    for (const [k, v] of Object.entries(args.keywordTypes)) {
      if (v === 'tool' || v === 'activity') typeMap.set(k.toLowerCase(), v);
    }
  }

  // Placement decision: prefer the LLM's tag; fall back to the keyword-shape
  // heuristic only when no tag exists for this keyword.
  const isToolKeyword = (kw: string): boolean => {
    const t = typeMap.get(kw.toLowerCase());
    if (t) return t === 'tool';
    return isSkillLikeKeyword(kw);
  };

  // Split the keyword universe by role.
  //   - keywordsToAdd   = ONLY what the user explicitly selected (minus excluded).
  //                       These are the ONLY keywords we permit to be introduced
  //                       as NEW vocabulary, and they MUST appear in the output.
  //   - contextKeywords = the remaining JD keywords. NOT placed in the prompt
  //                       (see keywordsBlock note) - computed only for diagnostic
  //                       logging so we can see what was intentionally withheld.
  // excludedKeywords are the user's "remove these" list - dropped from both sets.
  const excludedSet = new Set(excludedKeywords.map(s => s.toLowerCase()));
  const keywordsToAdd = [...new Set(selectedKeywords)]
    .filter(k => !excludedSet.has(k.toLowerCase()));
  const keywordsToAddSet = new Set(keywordsToAdd.map(k => k.toLowerCase()));
  const contextKeywords = jdKeywords.filter(
    k => !keywordsToAddSet.has(k.toLowerCase()) && !excludedSet.has(k.toLowerCase()),
  );

  // Diagnostic log (visible in Vercel function logs). Evidence trail for the
  // "unselected keywords got added" investigation: shows exactly what the user
  // selected, what we will permit as new vocabulary, and what JD keywords we are
  // deliberately NOT feeding to the model. If a contextKeyword still shows up in
  // `added` below, the model invented it from the JD text - not from our prompt.
  console.log('[generateAtsResume] keyword inputs', JSON.stringify({
    selectedKeywords,
    excludedKeywords,
    keywordsToAdd,
    contextKeywords_withheld: contextKeywords,
    jdKeywordCount: jdKeywords.length,
  }));

  // ── Conditional directives based on JD content ──────────────────────────────
  const jdLower = args.jobDescription.toLowerCase();
  const titleLower = args.jobTitle.toLowerCase();

  const isAiRole =
    /\b(ai|artificial intelligence|ml|machine learning|llm|gpt|agentic|automation agent|copilot|generative ai|prompt engineer)\b/.test(jdLower) ||
    /\b(ai|ml|llm|agentic|generative ai)\b/.test(titleLower);

  // NOTE: this resume writer is multi-tenant. NEVER hard-code any one person's
  // contact details, achievements, or domain into the prompt — the ONLY source
  // of the candidate's facts is args.resumeText below. (A previous version baked
  // in the owner's LinkedIn + a JMeter achievement + a "BFSI" client domain,
  // which leaked into every other user's generated resume.)
  const summaryDirective = isAiRole
    ? 'This JD mentions AI/ML/automation. If — and only if — the candidate\'s OWN resume shows genuine AI/automation experience, surface it in the Professional Summary as supporting evidence. Lead with the candidate\'s core specialization that the JD asks for. NEVER invent AI experience the candidate does not have.'
    : 'Lead the Professional Summary with the candidate\'s own core specialization (taken from their resume) that maps most directly to this JD. Do NOT lead with AI/automation unless the JD explicitly asks for it AND the candidate actually has it.';

  // ── Role title alignment with JD ────────────────────────────────────────────
  // ATS systems weight the candidate's most recent role title heavily in
  // matching. We clean the JD's listing title aggressively so noise like
  // department codes (CX, RX), version numbers (II, III), parenthetical
  // role hints, and trailing "openings/WFH/Pune" phrases never reach the
  // candidate's resume - that noise is a recruiter red flag ("did the AI
  // just paste the JD listing into the resume?").
  const targetCurrentRoleTitle = resolveTargetCurrentRoleTitle(
    args.jobTitle ?? '',
    args.resumeText,
  );

  // ── Contact block — built ENTIRELY from THIS candidate's data ───────────────
  // Every line comes from the signed-in user's profile/resume. Missing fields
  // are OMITTED (never defaulted to another person's value). LinkedIn is parsed
  // from the user's own resume; if absent, no LinkedIn line is emitted.
  const candidateName =
    args.candidateName?.trim() ||
    args.resumeText.split('\n').map(l => l.trim()).find(Boolean) ||
    '';
  const linkedinUrl = extractLinkedinFromResume(args.resumeText);
  const contactBlock = [
    candidateName,
    targetCurrentRoleTitle,
    args.email?.trim() || null,
    args.phone?.trim() || null,
    args.location?.trim() || null,
    linkedinUrl,
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n');

  // IMPORTANT: we deliberately do NOT enumerate the unselected JD keywords
  // (contextKeywords) anywhere in the prompt. Listing them - even under a
  // "do not add these" caveat - primes the model to weave them in (negation is
  // a weak instruction against an explicit list). That was the root cause of
  // "Grafana/InfluxDB got added even though I didn't select them". The full JD
  // is already in the prompt for relevance/emphasis; the model does not need a
  // keyword list to know what to surface. The ONLY keyword list we show is the
  // user's explicit selection. We also avoid naming ANY real tool in examples
  // (a previous example literally said "Grafana", which the model copied
  // verbatim into TECHNICAL SKILLS).
  const keywordsBlock = `
${keywordsToAdd.length > 0 ? `KEYWORDS TO ADD (the user explicitly selected these - they MUST appear in the final resume):
${keywordsToAdd.map(k => `  - ${k}`).join('\n')}

KEYWORDS-TO-ADD RULES:
- Each keyword above MUST appear at least once in the final resume - the user explicitly flagged these as critical for the ATS scan.
- PLACE EACH KEYWORD WHERE IT NATURALLY BELONGS - do NOT dump them all into TECHNICAL SKILLS:
  - TOOLS / TECHNOLOGIES / FRAMEWORKS / PROGRAMMING LANGUAGES / PLATFORMS / LIBRARIES (a named product or language, e.g. JMeter, Splunk, Kubernetes, Python) go in the most appropriate "Category: ..." line under TECHNICAL SKILLS.
  - ACTIVITIES / TESTING TYPES / METHODOLOGIES / METRICS / CONCEPTS (e.g. load testing, stress testing, endurance testing, baseline testing, distributed systems, KPI, SLA) are NOT skills. DO NOT list them under TECHNICAL SKILLS. Weave them naturally into the PROFESSIONAL SUMMARY, a KEY ACHIEVEMENTS bullet, or a relevant PROFESSIONAL EXPERIENCE bullet.
- Use the keyword's EXACT wording (e.g. write "JMeter" not "Apache JMeter performance tool"; if the keyword is "load testing", use that phrase even if the candidate normally writes "performance testing").
- Do NOT fabricate experience. The candidate already describes related performance/QA/testing work - attach each activity keyword to that existing work rather than inventing new jobs or bullets. Do NOT add any related, sibling, or commonly-grouped tool that is not in the list above.
- For genuine TOOL keywords only, reorder TECHNICAL SKILLS entries so they appear FIRST in their category line.
` : ''}STRICT KEYWORD SCOPE (this is the single most important rule - the user explicitly asked for it and was frustrated when it was violated):
- The ONLY new tools / technologies / frameworks / methodologies / certifications / named processes you may introduce into the resume are the exact keywords listed under KEYWORDS TO ADD above${keywordsToAdd.length === 0 ? '. That list is currently EMPTY, so you must NOT introduce ANY new tool/technology/skill at all - only reformat, reorder, and re-emphasize what is already in the candidate resume.' : '.'}
- Do NOT add a tool/technology/platform/skill just because it appears in the TARGET JOB description. The JD below is provided ONLY so you can decide which of the candidate's EXISTING experience to emphasize and reorder. It is NOT a source of keywords to add.
- Tools/skills already present in the candidate's CURRENT RESUME may stay - those are the candidate's real, existing experience.
- Before you write ANY tool/technology name, check: is it in KEYWORDS TO ADD, OR already in the candidate's current resume? If neither, DO NOT write it. This applies even to a tool commonly grouped with one you are legitimately adding (e.g. do not add a second monitoring/observability/time-series tool just because you added one the user selected).
${excludedKeywords.length > 0 ? `
EXCLUDED KEYWORDS (the user explicitly does NOT want these in the resume):
${excludedKeywords.map(k => `  - ${k}`).join('\n')}
- These keywords MUST NOT appear ANYWHERE in the final resume - not in PROFESSIONAL SUMMARY, not in KEY ACHIEVEMENTS, not in TECHNICAL SKILLS, not in any bullet, not even inside other words.
- If any of these keywords are currently in the candidate's CURRENT RESUME (for example because they were added in a previous generation that the user now wants undone), REMOVE every occurrence and rephrase the surrounding sentence so the resume still reads naturally.
- Exclusion takes precedence over everything. The user's explicit "remove" decision is final.
` : ''}`;

  const roleTitleDirective = targetCurrentRoleTitle
    ? `ROLE TITLE ALIGNMENT (important for ATS scoring):
- Set the candidate's CURRENT (most recent) role title in PROFESSIONAL EXPERIENCE to: ${targetCurrentRoleTitle}
- The title above has ALREADY been cleaned of department codes (CX, RX), version numbers (II, III), parenthetical noise, year ranges, location/hiring tails, and dash-separated designations (e.g. "- Assistant Manager", "- Senior Manager", "- Vice President", "/ Backend"). Use it EXACTLY AS GIVEN. Do NOT append anything from the original JD posting like ", CX", ", Product", "II", "WFH", "- Assistant Manager", or any parenthetical - those would tip off a recruiter that the title was machine-pasted from a job listing.
- This replaces whatever current-role title is in the candidate's input resume. The candidate's actual responsibilities are unchanged - only the title label is aligned with the JD's wording so the ATS title-match component scores higher.
- Past roles (every role except the most recent one) MUST keep their original titles from the input resume. Do not change historical titles.
- Use the exact same title as a tagline on line 2 of the contact block (described below).`
    : `ROLE TITLE (multi-tenant safety):
- Keep the candidate's CURRENT (most recent) role title EXACTLY as it appears in the input resume. Do NOT rename it to match the JD or any invented/default title.
- For the contact block: reproduce line 2 ONLY if a role title tagline is already present in the input resume header; otherwise omit line 2 entirely (name on line 1, then email/contact lines).`;

  const line2Directive = targetCurrentRoleTitle
    ? `LINE 2 IS THE TITLE TAGLINE: the second line of the contact block is the candidate's CURRENT role title (from ROLE TITLE ALIGNMENT above). It must appear immediately under the name, BEFORE the email line. The PDF renderer treats this as the title tagline below the name. Do not omit it.`
    : `LINE 2 (optional title tagline): include a role title on line 2 ONLY if the input resume already has one between the name and contact lines. Otherwise skip straight from name to contact info.`;

  const prompt = `You are an expert ATS resume writer. Tailor this resume to pass the ATS scanner for the target job below.

PRIMARY GOAL: emphasize the candidate's EXISTING experience that maps to what this JD asks for, and ensure the user's explicitly selected KEYWORDS TO ADD appear - WITHOUT fabricating experience and WITHOUT adding any new keyword the user did not select.

CRITICAL RULES:
1. PRESERVE every real fact: same companies, same dates, same achievements. Never invent jobs, dates, or numbers. (Note: the CURRENT/most-recent role TITLE is governed by the ROLE TITLE ALIGNMENT directive below - past role titles stay as-is.)
2. Keep all sections from the input resume. You MAY reorder entries inside TECHNICAL SKILLS to surface JD-priority tools first.
3. Output must be plain ASCII. No em-dashes, no smart quotes, no unicode bullets, no emojis, no graphics, no tables, no columns.
4. CLIENT NAME PRIVACY & HONESTY: a client / end-customer name may appear ONLY in a "Client: ClientName (Domain)" subline directly under the relevant job header in PROFESSIONAL EXPERIENCE - that is the only allowed location. Do NOT mention a client name anywhere else: not in PROFESSIONAL SUMMARY, not in KEY ACHIEVEMENTS, not in any bullet, not in skills. Replace any such mention with neutral phrasing like "the organization" or "a major enterprise client", or simply omit it.
   - ONLY add a "Client:" subline when the input resume actually names a real client for that specific role. NEVER invent a client, and NEVER attach a domain label (e.g. "BFSI", "Healthcare", "Retail") to a role unless that domain is explicitly stated in the candidate's own resume. Do not assume any default domain.
5. Allowed transformations:
   a. Convert any tables to "Category: Tool1, Tool2, Tool3" plain-text lines.
   b. Weave KEYWORDS TO ADD naturally into existing bullets where the candidate truthfully has that experience.
   c. Rewrite the Professional Summary per the directive below.
   d. Reorder Skills entries inside TECHNICAL SKILLS to put JD-priority tools first.
   e. Apply the ROLE TITLE directive (below) to the candidate's CURRENT/most-recent role only.

${roleTitleDirective}

PROFESSIONAL SUMMARY DIRECTIVE:
${summaryDirective}

FORMAT (these patterns are what ATS parsers expect):
- Section headers: ALL CAPS, alone on a line. Use exactly these names where applicable: PROFESSIONAL SUMMARY, KEY ACHIEVEMENTS, TECHNICAL SKILLS, CERTIFICATIONS, PROFESSIONAL EXPERIENCE, EDUCATION.
- Every bullet starts with "- " (hyphen + space). Never use "*" or any unicode bullet symbol.
- Job header: "Job Title  |  Company, City  |  Month YYYY - Month YYYY" (straight hyphen between dates).
- Optional client subline directly under job header: "Client: ClientName (Domain)".
- Skills lines: "Category: Tool1, Tool2, Tool3" - one category per line, no tables.
- One blank line between sections. No blank line between job header and its bullets.
${keywordsBlock}
CANDIDATE CONTACT BLOCK (reproduce these lines EXACTLY as given, at the very top, one item per line, in this order — do NOT add, invent, or guess any contact line, e.g. a LinkedIn/GitHub/website/phone that is not listed here):
${contactBlock}

${line2Directive}

CANDIDATE'S CURRENT RESUME (this is the only source of truth - never add experience that is not here):
${args.resumeText.slice(0, 14000)}

TARGET JOB:
Title: ${args.jobTitle}
Company: ${args.jobCompany ?? 'Not specified'}
Description:
${sanitizeJobDescriptionForAI(args.jobDescription).slice(0, 5000)}

Output the complete tailored resume in plain ASCII text. No preamble, no explanation, no markdown fences. Start with the candidate's name on the first line.

CRITICAL: do NOT prefix the output with any header label like "Resume", "RESUME", "Curriculum Vitae", "CV", or "PROFILE". The PDF renderer treats the first non-empty line of your output as the candidate's NAME - if you put "Resume" first, the literal word "Resume" will be rendered huge in the header band where the candidate's name should be. The very first non-empty line MUST be the candidate's full name (exactly as given in the contact block above).${targetCurrentRoleTitle ? ' The very second line MUST be the role title tagline.' : ''}`;

  const raw = await chat(
    'You reformat resumes into ATS-friendly plain ASCII text. Preserve all real content. Never fabricate experience. Output ONLY the resume.',
    prompt,
    0.25,
  );

  // Defense-in-depth ASCII normalization in case the model slipped a unicode char in.
  let resume = normalizeAscii(raw);

  // ── ATS Match Score: % of JD keywords actually present in the resume ────────
  // Score over the JD keywords MINUS anything the user explicitly excluded — a
  // deliberately-removed keyword must not count against the score or surface as
  // "missing". Use whole-token matching (keywordInText) instead of substring
  // includes() so "AI" no longer matches "available" and "Java" no longer
  // matches "JavaScript".
  const scoredJd = jdKeywords.filter(kw => !excludedSet.has(kw.toLowerCase()));

  // Score the resume against the JD keywords. Splits each keyword into:
  //   added      = present now, was NOT in the original resume (model added it)
  //   alreadyHad = present now, was already in the original resume
  //   missing    = not present
  function scoreResume(text: string) {
    const added: string[] = [];
    const alreadyHad: string[] = [];
    const missing: string[] = [];
    for (const kw of scoredJd) {
      if (keywordInText(kw, text)) {
        if (keywordInText(kw, args.resumeText)) alreadyHad.push(kw);
        else added.push(kw);
      } else {
        missing.push(kw);
      }
    }
    return { added, alreadyHad, missing };
  }

  let { added, alreadyHad, missing } = scoreResume(resume);

  // Unauthorized = a JD keyword the model introduced as NEW (not in the original
  // resume) that the user did NOT select. This is exactly the "Grafana/InfluxDB
  // got added even though I didn't pick them" symptom. Strip such items from
  // TECHNICAL SKILLS lines deterministically, then re-score so the returned
  // numbers reflect the cleaned resume.
  const unauthorized = added.filter(kw => !keywordsToAddSet.has(kw.toLowerCase()));
  if (unauthorized.length > 0) {
    const stripped = stripUnauthorizedSkillKeywords(resume, unauthorized);
    if (stripped.removed.length > 0) {
      resume = stripped.text;
      ({ added, alreadyHad, missing } = scoreResume(resume));
      console.log('[generateAtsResume] stripped unauthorized keywords from skills lines',
        JSON.stringify({ removed: stripped.removed }));
    }
    // Anything still flagged after the skills-line strip was injected into prose
    // (a bullet/summary). We don't butcher prose automatically, but we log it as
    // evidence so we can see exactly what the model did.
    const survivors = added.filter(kw => !keywordsToAddSet.has(kw.toLowerCase()));
    if (survivors.length > 0) {
      console.warn('[generateAtsResume] model injected unselected JD keywords into prose (left intact)',
        JSON.stringify({ survivors }));
    }
  }

  // Guarantee every user-selected keyword appears - placed SMARTLY, and with a
  // HARD deterministic backstop so nothing is ever silently dropped (the bug in
  // the previous version: activity/metric keywords were only logged, never
  // inserted, so when the LLM skipped them they stayed missing). Strategy:
  //   1. If the model skipped some selections, run a focused LLM repair pass
  //      that re-inserts ONLY those keywords in their natural location (tools ->
  //      skills, activities/metrics/concepts -> woven into prose). Best quality.
  //   2. Re-apply the unauthorized strip (the repair could, in theory, surface
  //      a sibling tool) and re-score.
  //   3. Deterministic guarantee for whatever the repair STILL missed, by type:
  //      tool-like  -> TECHNICAL SKILLS (ensureSelectedKeywordsPresent)
  //      everything else (activities/metrics/concepts) -> CORE COMPETENCIES
  //      (ensureCompetencyKeywordsPresent). Correctness no longer depends on
  //      the LLM: every selected keyword is present after this block.
  if (keywordsToAdd.length > 0) {
    let stillMissing = keywordsToAdd.filter(kw => !keywordInText(kw, resume));
    if (stillMissing.length > 0) {
      try {
        const repaired = await weaveKeywordsIntoResume({
          resume,
          missingKeywords: stillMissing,
          jobTitle: args.jobTitle,
        });
        if (repaired && repaired.length >= 200) {
          resume = repaired;
          // The repair pass may surface a sibling tool; re-strip unauthorized.
          ({ added, alreadyHad, missing } = scoreResume(resume));
          const unauth = added.filter(kw => !keywordsToAddSet.has(kw.toLowerCase()));
          if (unauth.length > 0) {
            const s = stripUnauthorizedSkillKeywords(resume, unauth);
            if (s.removed.length > 0) resume = s.text;
          }
          ({ added, alreadyHad, missing } = scoreResume(resume));
          console.log('[generateAtsResume] repair pass wove in skipped keywords',
            JSON.stringify({ requested: stillMissing }));
        }
      } catch (e) {
        console.warn('[generateAtsResume] repair pass failed, falling back to deterministic net',
          JSON.stringify({ error: (e as Error).message }));
      }

      // Deterministic guarantee for whatever the LLM still skipped, placed by
      // type: tool-like -> TECHNICAL SKILLS; activity/metric/concept -> CORE
      // COMPETENCIES (never force-listed as a technical skill). After this,
      // every selected keyword is guaranteed present.
      stillMissing = keywordsToAdd.filter(kw => !keywordInText(kw, resume));
      const toolLeftovers = stillMissing.filter(isToolKeyword);
      const proseLeftovers = stillMissing.filter(kw => !isToolKeyword(kw));
      if (toolLeftovers.length > 0) {
        const ensured = ensureSelectedKeywordsPresent(resume, toolLeftovers);
        if (ensured.added.length > 0) {
          resume = ensured.text;
          ({ added, alreadyHad, missing } = scoreResume(resume));
          console.log('[generateAtsResume] appended tool-like leftovers to TECHNICAL SKILLS',
            JSON.stringify({ appended: ensured.added }));
        }
      }
      if (proseLeftovers.length > 0) {
        const comp = ensureCompetencyKeywordsPresent(resume, proseLeftovers);
        if (comp.added.length > 0) {
          resume = comp.text;
          ({ added, alreadyHad, missing } = scoreResume(resume));
          console.log('[generateAtsResume] guaranteed activity/metric keywords via CORE COMPETENCIES',
            JSON.stringify({ added: comp.added }));
        }
      }

      // Last-resort: append any selected keyword still absent verbatim.
      stillMissing = keywordsToAdd.filter(kw => !keywordInText(kw, resume));
      if (stillMissing.length > 0) {
        const comp = ensureCompetencyKeywordsPresent(resume, stillMissing);
        if (comp.added.length > 0) {
          resume = comp.text;
          ({ added, alreadyHad, missing } = scoreResume(resume));
          console.log('[generateAtsResume] last-resort CORE COMPETENCIES append',
            JSON.stringify({ added: comp.added }));
        }
      }
    }
  }

  const present = added.length + alreadyHad.length;
  const ats_match_score = scoredJd.length > 0
    ? Math.round((present / scoredJd.length) * 100)
    : 0;

  // Deterministic guarantee: never ship a PDF with a blank title band because
  // the LLM dropped line 2 despite the contact block in the prompt.
  if (targetCurrentRoleTitle) {
    const titleFix = ensureContactBlockTitle(
      resume,
      candidateName,
      targetCurrentRoleTitle,
    );
    if (titleFix.inserted) {
      resume = titleFix.text;
      console.log('[generateAtsResume] ensured contact block title on line 2',
        JSON.stringify({ title: targetCurrentRoleTitle }));
    }
  }

  console.log('[generateAtsResume] result',
    JSON.stringify({ ats_match_score, added, alreadyHad_count: alreadyHad.length, missing }));

  return {
    resume,
    ats_match_score,
    jd_keywords: scoredJd,
    added,
    alreadyHad,
    missing,
  };
}

/**
 * Programmatically check if a skill keyword is present in the job description or title.
 * @deprecated import from `./jd-skill-match` — re-export kept for existing callers.
 */
export { isSkillPresentInJd } from './jd-skill-match';

/**
 * Generate a hyper-personalized outreach message for a referral or recruiter connection.
 */
export async function generateOutreachMessage(args: {
  resume: string;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string | null;
  template: 'peer' | 'recruiter' | 'warm';
  candidateName: string | null;
  profileId: string;
}): Promise<string> {
  const { resume, jobTitle, jobCompany, jobDescription, template, candidateName, profileId } = args;

  const systemPrompt = `You are a world-class professional career coach and copywriter specializing in high-conversion job search outreach.
Your task is to write a highly tailored, authentic, and compelling outreach message.
Rules:
1. Be extremely concise (under 110 words) - suitable for a LinkedIn connection request note or short message.
2. Align specific tool/specialty accomplishments from the candidate's resume with the job requirements.
3. Keep the tone warm, confident, and professional. Avoid AI clichés (e.g., "I hope this message finds you well", "Dear [Name]").
4. Use placeholder '[Name]' for the recipient's name.
5. Sign off with '${candidateName || '[Your Name]'}'.`;

  let templateInstructions = '';
  if (template === 'peer') {
    templateInstructions = `Write to a potential peer/colleague working at ${jobCompany}. The goal is to ask for a brief chat about the team culture or a potential referral. Highlight a shared technology or domain alignment.`;
  } else if (template === 'recruiter') {
    templateInstructions = `Write directly to the hiring manager or recruiter at ${jobCompany}. Keep it punchy, focus on your direct match for the ${jobTitle} role, and invite them for a brief chat.`;
  } else {
    templateInstructions = `Write to a mutual connection (a warm contact) asking if they would be open to introducing you to someone they know at ${jobCompany} regarding the ${jobTitle} role.`;
  }

  const userPrompt = `Candidate Resume:
${resume}

Job Title: ${jobTitle}
Company: ${jobCompany}
Job Description:
${jobDescription ?? 'No description.'}

Outreach Template Type: ${template.toUpperCase()} (${templateInstructions})

Draft the message now:`;

  try {
    const text = await chat(systemPrompt, userPrompt, 0.7, false, 'generateOutreachMessage', profileId);
    return text.trim();
  } catch (err: any) {
    console.error('[gemini] Failed to generate outreach message:', err.message);
    throw err;
  }
}

/** Semantic ATS field mapping (Simplify-style) for extension autofill gaps. */
export async function mapAutofillFormFields(args: {
  fields: { id: number; label: string; type: string }[];
  profile: import('./extension/profile').AutofillProfile;
  jobTitle?: string;
  company?: string;
}): Promise<{ id: number; value: string }[]> {
  if (!args.fields.length) return [];

  const prompt = `You map job application form fields to candidate data.

JOB: ${args.jobTitle || 'unknown'} at ${args.company || 'unknown'}

CANDIDATE PROFILE (JSON):
${JSON.stringify(args.profile, null, 2).slice(0, 14000)}

EMPTY FORM FIELDS (fill only when confident):
${args.fields.map((f) => `${f.id}. [${f.type}] ${f.label}`).join('\n')}

Return strict JSON: { "mappings": [ { "id": <number>, "value": "<string>" } ] }
Rules:
- Prefer structured_work_history / work_history entries with start/end dates for experience date fields.
- Workday month spinbuttons: two-digit month (01-12). Year spinbuttons: four-digit year (e.g. 2020).
- Match work experience row index from labels like workExperience-19 to work_history[0], workExperience-20 to [1], etc.
- Role description / job summary: use work_history[n].summary when label references that row.
- Education school/university: use full school name from education[0].school (e.g. "SRM University, Chennai").
- GPA / overall result: only numeric GPA if present in profile; never put degree names in GPA fields.
- Facebook/LinkedIn "willing to share" text fields: put profile links.linkedin / links URL if available; otherwise skip.
- Radio / yes-no: answer exactly "Yes" or "No".
- Use custom_qa when the label matches a saved question.
- Skip fields you cannot fill confidently.
- Max 120 words per textarea.
- Output JSON only.`;

  const text = await chat(
    'You map ATS form fields to candidate profile JSON. Output JSON only.',
    prompt,
    0.1,
    true,
    'mapAutofillFormFields',
  );

  try {
    const parsed = JSON.parse(text) as {
      mappings?: { id: number; value: string }[];
    };
    if (!Array.isArray(parsed.mappings)) return [];
    return parsed.mappings
      .filter(
        (m) =>
          typeof m.id === 'number' &&
          typeof m.value === 'string' &&
          m.value.trim().length > 0,
      )
      .slice(0, 25);
  } catch {
    return [];
  }
}

const SEMANTIC_FIELD_KEYS = [
  'email',
  'phone',
  'first_name',
  'last_name',
  'full_name',
  'current_title',
  'current_company',
  'current_location',
  'linkedin',
  'github',
  'portfolio',
  'notice_period_days',
  'total_experience_years',
  'current_ctc',
  'expected_ctc',
  'willing_to_relocate',
  'require_sponsorship',
  'authorized_to_work',
  'gender',
  'skip',
] as const;

/** Tier B: map form structure to semantic keys only — never send user PII to the LLM. */
export async function mapFormFieldsSemantic(args: {
  domain: string;
  fields: {
    field_fp: string;
    label: string;
    widget_kind: string;
    options?: string[];
  }[];
}): Promise<{ field_fp: string; semantic_key: string; confidence: number }[]> {
  if (!args.fields.length) return [];

  const fieldLines = args.fields
    .slice(0, 35)
    .map((f) => {
      const opts =
        f.options?.length && f.options.length <= 12
          ? ` options=[${f.options.map((o) => JSON.stringify(o)).join(', ')}]`
          : f.options?.length
            ? ` options_count=${f.options.length}`
            : '';
      return `- ${f.field_fp}: label=${JSON.stringify(f.label)} kind=${f.widget_kind}${opts}`;
    })
    .join('\n');

  const prompt = `Map job application form fields to semantic keys for domain "${args.domain}".

FIELDS (structure only — do NOT invent or output user values):
${fieldLines}

Allowed semantic_key values:
${SEMANTIC_FIELD_KEYS.join(', ')}

Return strict JSON:
{ "mappings": [ { "field_fp": "<string>", "semantic_key": "<key>", "confidence": 0.0-1.0 } ] }

Rules:
- Map by label meaning only (e.g. "Notice Period" → notice_period_days).
- Use skip for captcha, file upload, cover letter upload, referral free-text, or unknown fields.
- For dropdowns with options, semantic_key describes what the field asks for; do not pick an option value.
- confidence 0.9+ when label clearly matches; 0.5-0.8 when plausible; skip if unsure.
- Output JSON only.`;

  const text = await chat(
    'You map form field labels to semantic keys. No PII. Output JSON only.',
    prompt,
    0.05,
    true,
    'mapFormFieldsSemantic',
  );

  try {
    const parsed = JSON.parse(text) as {
      mappings?: { field_fp: string; semantic_key: string; confidence?: number }[];
    };
    if (!Array.isArray(parsed.mappings)) return [];
    const allowed = new Set<string>(SEMANTIC_FIELD_KEYS);
    return parsed.mappings
      .filter(
        (m) =>
          typeof m.field_fp === 'string' &&
          typeof m.semantic_key === 'string' &&
          allowed.has(m.semantic_key),
      )
      .map((m) => ({
        field_fp: m.field_fp,
        semantic_key: m.semantic_key,
        confidence:
          typeof m.confidence === 'number'
            ? Math.max(0, Math.min(1, m.confidence))
            : 0.7,
      }))
      .slice(0, 35);
  } catch {
    return [];
  }
}


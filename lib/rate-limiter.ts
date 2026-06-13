/**
 * Sliding Window Rate Limiter — multi-tenant, multi-bucket.
 *
 * Algorithms used:
 *   1. Sliding Window Log — O(log n) per check via binary search on timestamp arrays.
 *      More accurate than fixed-window counters (no boundary spikes).
 *   2. Token-aware limiting — each request carries a "cost" (tokens consumed),
 *      so a single large generation can't exhaust the budget.
 *   3. Three-tier buckets — per-user, per-key (API key RPM), and global aggregate.
 *      A request must pass ALL buckets to proceed.
 *
 * Memory: each active user/key stores an array of timestamps for the window.
 * Entries older than the window are lazily pruned on every check.
 * Inactive entries (no requests for 2× window) are GC'd.
 *
 * Usage:
 *   const limiter = getRateLimiter();
 *   const allowed = limiter.check('user:abc123', { cost: 1500 });
 *   if (!allowed) throw new RateLimitError('Too many tokens. Try again in 30s.');
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitBucket {
  /** Unique key for this bucket, e.g. "user:<profileId>", "key:<keyId>", "global" */
  key: string;
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Max total token cost allowed in the window */
  maxTokens: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Human label for error messages */
  label: string;
}

export interface RateLimitCheck {
  /** Token cost of this operation (e.g. prompt_tokens + completion_tokens estimate) */
  cost?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  /** Current usage for this bucket after accepting (or rejecting) */
  currentRequests: number;
  currentTokens: number;
  limit: { maxRequests: number; maxTokens: number };
}

// ---------------------------------------------------------------------------
// Default limits — tweak per deployment
// ---------------------------------------------------------------------------

export const DEFAULT_BUCKETS: RateLimitBucket[] = [
  // Per-user limits (applied to every chat() call by profileId)
  { key: 'user:',    maxRequests: 120, maxTokens: 500_000,  windowMs: 60_000,  label: 'user' },
  // Per-key RPM (applied per API key)
  { key: 'key:',     maxRequests: 30,  maxTokens: 200_000,  windowMs: 60_000,  label: 'API key' },
  // Global aggregate (all users combined, last resort circuit breaker)
  { key: 'global',   maxRequests: 300, maxTokens: 2_000_000, windowMs: 60_000,  label: 'global' },
];

/**
 * Generate stable bucket keys.
 */
export function userBucket(profileId: string): string      { return `user:${profileId}`; }
export function keyBucket(keyId: string): string           { return `key:${keyId}`; }

// ---------------------------------------------------------------------------
// Sliding Window Log — core data structure
// ---------------------------------------------------------------------------

/**
 * Each tracked bucket has a sorted array of { timestamp, cost } entries.
 * On every check we:
 *  1. Binary-search for the cutoff index (entries older than windowMs).
 *  2. Splice the pruned prefix (amortized O(1) since each entry is removed once).
 *  3. Sum costs with a simple loop over the active window.
 *  4. Insert the new entry if allowed.
 *
 * Memory: ~32 bytes per entry (timestamp + cost + array overhead).
 * At 120 req/min for 1000 users = 120K entries = ~4 MB. Fine for Node.
 */
interface WindowEntry {
  t: number;  // timestamp ms
  c: number;  // token cost
}

class SlidingWindowStore {
  private buckets = new Map<string, WindowEntry[]>();
  private readonly pruneIntervalMs = 30_000; // full GC every 30s
  private lastGc = Date.now();

  /**
   * Check if a request is allowed. Mutates state ONLY if allowed.
   * Returns the result with current usage stats.
   */
  check(
    bucketKey: string,
    limits: { maxRequests: number; maxTokens: number; windowMs: number },
    cost: number,
  ): RateLimitResult {
    const now = Date.now();
    const cutoff = now - limits.windowMs;

    // Get or create entry array
    let entries = this.buckets.get(bucketKey);
    if (!entries) {
      entries = [];
      this.buckets.set(bucketKey, entries);
    }

    // ── Prune expired entries (binary search) ──────────────────────────
    // Since entries are always appended in chronological order, the array
    // stays sorted. We find the first index >= cutoff and drop everything before it.
    const pruneIdx = this.lowerBound(entries, cutoff);
    if (pruneIdx > 0) {
      entries.splice(0, pruneIdx);
    }

    // ── Compute current usage ──────────────────────────────────────────
    const currentRequests = entries.length;
    let currentTokens = 0;
    for (let i = 0; i < entries.length; i++) {
      currentTokens += entries[i].c;
    }

    // ── Enforce limits ─────────────────────────────────────────────────
    if (currentRequests >= limits.maxRequests) {
      const oldestInWindow = entries[0]?.t ?? now;
      const retryAfterMs = Math.max(1, oldestInWindow + limits.windowMs - now);
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.maxRequests} requests per ${limits.windowMs / 1000}s (${currentRequests} used)`,
        retryAfterMs,
        currentRequests,
        currentTokens,
        limit: { maxRequests: limits.maxRequests, maxTokens: limits.maxTokens },
      };
    }

    if (currentTokens + cost > limits.maxTokens) {
      const retryAfterMs = Math.max(1, Math.ceil(limits.windowMs * 0.5)); // approximate
      return {
        allowed: false,
        reason: `Token budget exceeded: ~${currentTokens + cost} tokens would exceed ${limits.maxTokens} limit`,
        retryAfterMs,
        currentRequests,
        currentTokens,
        limit: { maxRequests: limits.maxRequests, maxTokens: limits.maxTokens },
      };
    }

    // ── Record this request ────────────────────────────────────────────
    entries.push({ t: now, c: cost });

    // ── Periodic GC: remove stale bucket keys ──────────────────────────
    if (now - this.lastGc > this.pruneIntervalMs) {
      this.lastGc = now;
      this.gc();
    }

    return {
      allowed: true,
      currentRequests: currentRequests + 1,
      currentTokens: currentTokens + cost,
      limit: { maxRequests: limits.maxRequests, maxTokens: limits.maxTokens },
    };
  }

  /** Binary search: first index where entry.t >= target */
  private lowerBound(arr: WindowEntry[], target: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].t < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Remove bucket keys that have been idle for 2× the default window */
  private gc(): void {
    const maxAge = 120_000; // 2 min
    const now = Date.now();
    for (const [key, entries] of this.buckets) {
      if (entries.length === 0) {
        this.buckets.delete(key);
        continue;
      }
      // If the newest entry is older than maxAge, the user is idle
      const newest = entries[entries.length - 1].t;
      if (now - newest > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  /** For testing / admin: get current stats for a bucket */
  getStats(bucketKey: string): { requests: number; tokens: number } | null {
    const entries = this.buckets.get(bucketKey);
    if (!entries || entries.length === 0) return null;
    let tokens = 0;
    for (const e of entries) tokens += e.c;
    return { requests: entries.length, tokens };
  }

  /** Total tracked buckets (diagnostic) */
  get bucketCount(): number { return this.buckets.size; }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!_instance) _instance = new RateLimiter();
  return _instance;
}

export class RateLimiter {
  private store = new SlidingWindowStore();
  private buckets: RateLimitBucket[];

  constructor(buckets?: RateLimitBucket[]) {
    this.buckets = buckets ?? [...DEFAULT_BUCKETS];
  }

  /**
   * Check a request against ALL matching buckets.
   * Provide the specific bucket keys to check (user, key, or both).
   *
   * Example:
   *   check('user:abc123', { cost: 1500 })
   *   check(['user:abc123', 'key:key_xyz'], { cost: 800 })
   */
  check(
    bucketKeys: string | string[],
    opts?: RateLimitCheck,
  ): RateLimitResult {
    const keys = Array.isArray(bucketKeys) ? bucketKeys : [bucketKeys];
    const cost = opts?.cost ?? 1;

    for (const bk of keys) {
      // Find matching bucket config
      let config: RateLimitBucket | undefined;
      for (const b of this.buckets) {
        if (bk.startsWith(b.key)) {
          config = b;
          break;
        }
      }
      if (!config) continue; // unknown bucket -> skip

      // Clone config with the specific key
      const bucketConfig = { ...config, key: bk };
      const result = this.store.check(bk, bucketConfig, cost);
      if (!result.allowed) return result;
    }

    // All buckets passed
    return {
      allowed: true,
      currentRequests: 0,
      currentTokens: 0,
      limit: { maxRequests: 0, maxTokens: 0 },
    };
  }

  /** Access the inner store for diagnostics */
  getStore(): SlidingWindowStore { return this.store; }

  /**
   * Estimate token cost for an operation BEFORE calling the LLM.
   * Used to pre-check rate limits so we fail fast instead of wasting a call.
   *
   * Rough heuristic: ~4 chars per token for English text.
   */
  static estimateTokenCost(
    systemPrompt: string,
    userPrompt: string,
    expectedOutputTokens = 500,
  ): number {
    const input = systemPrompt.length + userPrompt.length;
    return Math.ceil(input / 4) + expectedOutputTokens;
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs = 30_000) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Intelligent Key Rotator — weighted selection with health tracking.
 *
 * Algorithm: Weighted Priority Scoring
 * ────────────────────────────────────
 * Each key gets a score (0–100) from 5 weighted factors:
 *   - capacity_remaining (30%): % of daily token budget left
 *   - health_score      (25%): success rate over sliding 5-min window
 *   - rpm_headroom      (20%): % of RPM budget remaining this minute
 *   - latency_score     (15%): inverse of recent avg latency (faster = better)
 *   - priority_bonus    (10%): explicit admin-set priority (lower number = higher priority)
 *
 * The highest-scoring key is selected. If multiple keys have close scores
 * (within 5 points), one is picked randomly weighted by score (softmax)
 * to avoid "thundering herd" on a single key.
 *
 * Exponential Backoff
 * ───────────────────
 * On each 429, the cooldown duration doubles: 65s → 130s → 260s → 520s (max 10 min).
 * On success, the failure count decays by 1 (recovers gradually).
 *
 * Usage Tracking
 * ──────────────
 * Tracks per-key RPM in a sliding window (same algorithm as the rate limiter).
 * Also tracks latency and success/error counts over 5-minute windows.
 */

import { PROVIDER_DEFAULTS } from './llm-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeyHealth {
  consecutiveFailures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  /** Sliding window: timestamps of recent successes */
  successTimestamps: number[];
  /** Sliding window: timestamps of recent failures */
  failureTimestamps: number[];
  /** Sliding window: latency measurements in ms */
  latencySamples: number[];
  /** When this key was last checked/used */
  lastActivityAt: number;
}

export interface KeyScore {
  keyId: string;
  provider: string;
  label: string;
  score: number;
  factors: {
    capacity: number;
    health: number;
    rpmHeadroom: number;
    latency: number;
    priority: number;
  };
  isOnCooldown: boolean;
}

export interface ScoredProviderEntry {
  name: string;
  keyId: string;
  provider: string;
  score: number;
  isAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cooldown ranges for exponential backoff */
const BASE_COOLDOWN_MS = 65_000;
const MAX_COOLDOWN_MS = 600_000; // 10 min
const COOLDOWN_MULTIPLIER = 2;

/** Health tracking window */
const HEALTH_WINDOW_MS = 300_000; // 5 min
const LATENCY_WINDOW_MS = 300_000;

/** RPM tracking window */
const RPM_WINDOW_MS = 60_000;

/** Score weights (must sum to 1.0) */
const WEIGHTS = {
  capacity: 0.30,
  health: 0.25,
  rpm: 0.20,
  latency: 0.15,
  priority: 0.10,
};

/** Score tie threshold for randomized selection */
const TIE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Key Health Store
// ---------------------------------------------------------------------------

class KeyHealthStore {
  private health = new Map<string, KeyHealth>();
  private rpmBuckets = new Map<string, number[]>();  // keyId -> [timestamps]
  private readonly maxRpmWindow = RPM_WINDOW_MS;

  getOrCreate(keyId: string): KeyHealth {
    let h = this.health.get(keyId);
    if (!h) {
      h = {
        consecutiveFailures: 0,
        lastFailureAt: 0,
        lastSuccessAt: 0,
        successTimestamps: [],
        failureTimestamps: [],
        latencySamples: [],
        lastActivityAt: Date.now(),
      };
      this.health.set(keyId, h);
    }
    return h;
  }

  recordSuccess(keyId: string, latencyMs: number): void {
    const h = this.getOrCreate(keyId);
    const now = Date.now();
    h.lastSuccessAt = now;
    h.lastActivityAt = now;
    h.successTimestamps.push(now);
    h.latencySamples.push(latencyMs);
    // Decay failures on success (can't go below 0)
    h.consecutiveFailures = Math.max(0, h.consecutiveFailures - 1);

    // Trim old entries
    this.trimTimestamps(h);
    this.trimLatency(h);
    this.recordRpmCall(keyId);
  }

  recordFailure(keyId: string): void {
    const h = this.getOrCreate(keyId);
    const now = Date.now();
    h.lastFailureAt = now;
    h.lastActivityAt = now;
    h.failureTimestamps.push(now);
    h.consecutiveFailures++;
    this.trimTimestamps(h);
  }

  recordRpmCall(keyId: string): void {
    let bucket = this.rpmBuckets.get(keyId);
    if (!bucket) {
      bucket = [];
      this.rpmBuckets.set(keyId, bucket);
    }
    const now = Date.now();
    bucket.push(now);
    // Prune old entries
    const cutoff = now - this.maxRpmWindow;
    while (bucket.length > 0 && bucket[0] < cutoff) {
      bucket.shift();
    }
  }

  /**
   * Get RPM count for a key in the last minute.
   */
  getRpmCount(keyId: string): number {
    const bucket = this.rpmBuckets.get(keyId);
    if (!bucket || bucket.length === 0) return 0;
    const now = Date.now();
    const cutoff = now - this.maxRpmWindow;
    // Binary search for first valid entry
    let lo = 0, hi = bucket.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (bucket[mid] < cutoff) lo = mid + 1;
      else hi = mid;
    }
    return bucket.length - lo;
  }

  /**
   * Get the exponential backoff cooldown duration for a key.
   */
  getCooldownDuration(keyId: string): number {
    const h = this.health.get(keyId);
    if (!h || h.consecutiveFailures === 0) return 0;
    return Math.min(
      BASE_COOLDOWN_MS * Math.pow(COOLDOWN_MULTIPLIER, h.consecutiveFailures - 1),
      MAX_COOLDOWN_MS,
    );
  }

  /**
   * Check if a key is still on cooldown.
   */
  isOnCooldown(keyId: string): boolean {
    const h = this.health.get(keyId);
    if (!h || h.consecutiveFailures === 0) return false;
    const duration = this.getCooldownDuration(keyId);
    return (Date.now() - h.lastFailureAt) < duration;
  }

  /**
   * Get health score (0-1) based on success rate in the last 5 minutes.
   */
  getHealthScore(keyId: string): number {
    const h = this.health.get(keyId);
    if (!h) return 1.0; // unknown = healthy

    const cutoff = Date.now() - HEALTH_WINDOW_MS;
    let successes = 0, failures = 0;

    for (const t of h.successTimestamps) {
      if (t >= cutoff) successes++;
    }
    for (const t of h.failureTimestamps) {
      if (t >= cutoff) failures++;
    }

    const total = successes + failures;
    if (total === 0) return 1.0; // no data = healthy
    return successes / total;
  }

  /**
   * Get average latency in ms (last N samples, defaults to 10).
   */
  getAvgLatency(keyId: string): number | null {
    const h = this.health.get(keyId);
    if (!h || h.latencySamples.length === 0) return null;

    const samples = h.latencySamples.slice(-10);
    const sum = samples.reduce((a, b) => a + b, 0);
    return sum / samples.length;
  }

  /**
   * Get latency score (0-1). Inverse of avg latency, capped at 100ms → 1.0, 10s → 0.0.
   */
  getLatencyScore(keyId: string): number {
    const avg = this.getAvgLatency(keyId);
    if (avg === null) return 0.5; // no data = neutral
    // Map: 100ms → 1.0, 5s → 0.5, 10s → 0.0
    return Math.max(0, Math.min(1, 1 - (avg - 100) / 9900));
  }

  /** Prune old entries beyond health window */
  private trimTimestamps(h: KeyHealth): void {
    const cutoff = Date.now() - HEALTH_WINDOW_MS;
    this.trimArray(h.successTimestamps, cutoff);
    this.trimArray(h.failureTimestamps, cutoff);
  }

  /** Prune old latency samples beyond latency window */
  private trimLatency(h: KeyHealth): void {
    const cutoff = Date.now() - LATENCY_WINDOW_MS;
    // Latency samples are paired with success timestamps by index.
    // We trim based on successTimestamps already being trimmed.
    // Keep only last 20 latency samples regardless.
    if (h.latencySamples.length > 20) {
      h.latencySamples = h.latencySamples.slice(-20);
    }
  }

  private trimArray(arr: number[], cutoff: number): void {
    while (arr.length > 0 && arr[0] < cutoff) {
      arr.shift();
    }
  }

  /** Get total tracked keys (diagnostic) */
  get trackedKeyCount(): number { return this.health.size; }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _healthStore: KeyHealthStore | null = null;

export function getKeyHealthStore(): KeyHealthStore {
  if (!_healthStore) _healthStore = new KeyHealthStore();
  return _healthStore;
}

// ---------------------------------------------------------------------------
// Scoring Functions
// ---------------------------------------------------------------------------

/**
 * Compute the capacity score (0-1) based on how much of the daily budget remains.
 */
export function computeCapacityScore(
  tokensUsedToday: number,
  dailyTokenLimit: number,
): number {
  if (dailyTokenLimit <= 0) return 0.5; // no limit = neutral
  const remaining = Math.max(0, dailyTokenLimit - tokensUsedToday);
  return Math.min(1, remaining / dailyTokenLimit);
}

/**
 * Compute the RPM headroom score (0-1) based on recent request count.
 * Assumes a soft RPM limit (e.g., 10 RPM for free keys, 60 for paid).
 */
export function computeRpmHeadroomScore(
  recentRpm: number,
  estimatedRpmLimit: number,
): number {
  if (estimatedRpmLimit <= 0) return 0.5;
  const headroom = Math.max(0, estimatedRpmLimit - recentRpm);
  return Math.min(1, headroom / estimatedRpmLimit);
}

/**
 * Compute the priority score (0-1). Lower priority number = higher score.
 * Priority 0 → 1.0, Priority 10 → 0.5, Priority 100 → 0.0
 */
export function computePriorityScore(priority: number): number {
  return Math.max(0, Math.min(1, 1 - priority / 100));
}

/**
 * Compute the overall score for a key.
 */
export function computeKeyScore(opts: {
  capacityRemaining: number;  // 0-1
  healthScore: number;         // 0-1
  rpmHeadroom: number;         // 0-1
  latencyScore: number;        // 0-1
  priority: number;            // raw priority value
  onCooldown: boolean;
}): number {
  if (opts.onCooldown) return -1; // cooldown = ineligible

  const priorityScore = computePriorityScore(opts.priority);

  return (
    opts.capacityRemaining * WEIGHTS.capacity +
    opts.healthScore * WEIGHTS.health +
    opts.rpmHeadroom * WEIGHTS.rpm +
    opts.latencyScore * WEIGHTS.latency +
    priorityScore * WEIGHTS.priority
  ) * 100; // scale to 0-100
}

/**
 * Select the best key from a list of scored candidates.
 * Uses highest-score-first, with random tie-breaking within TIE_THRESHOLD.
 */
export function selectOptimalKey(
  candidates: Array<{
    keyId: string;
    provider: string;
    score: number;
    label: string;
  }>,
): { keyId: string; provider: string; label: string } | null {
  if (candidates.length === 0) return null;

  // Filter only available (non-negative score)
  const available = candidates.filter(c => c.score >= 0);
  if (available.length === 0) return null;

  // Sort by score descending
  available.sort((a, b) => b.score - a.score);

  // If the top score is significantly higher, pick it directly
  if (available.length === 1 || available[0].score - available[1].score > TIE_THRESHOLD) {
    return available[0];
  }

  // Within tie threshold: weighted random selection (softmax)
  const topTier = available.filter(
    c => available[0].score - c.score <= TIE_THRESHOLD,
  );

  // Softmax probabilities
  const scores = topTier.map(c => Math.max(0.001, c.score)); // avoid zero
  const sumScores = scores.reduce((a, b) => a + b, 0);
  const probs = scores.map(s => s / sumScores);

  // Weighted random pick
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < topTier.length; i++) {
    cumulative += probs[i];
    if (rand <= cumulative) return topTier[i];
  }

  return topTier[topTier.length - 1]; // fallback
}

/**
 * Estimate the soft RPM limit for a provider.
 * Free providers have tighter limits than paid ones.
 */
export function estimateProviderRpmLimit(provider: string): number {
  switch (provider) {
    case 'bluesminds': return 20;   // free tier per doc.bluesminds.com
    case 'openai': return 60;     // paid
    case 'groq': return 15;       // free tier
    case 'cerebras': return 10;   // free tier (reduced)
    case 'gemini': return 10;     // free tier
    case 'mistral': return 20;    // free tier
    case 'sambanova': return 15;  // free tier
    default: return 10;
  }
}

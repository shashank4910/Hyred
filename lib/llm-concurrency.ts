/**
 * Global LLM concurrency gate — limits simultaneous in-flight chat/embed calls
 * across all Vercel instances (Supabase-backed semaphore).
 */

const DEFAULT_MAX_SLOTS = 25;
const DEFAULT_MAX_WAIT_MS = 45_000;
const POLL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryAcquireSlot(): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc('acquire_llm_chat_slot', {
      p_max_slots: DEFAULT_MAX_SLOTS,
    });
    if (error) {
      console.warn('[llm-concurrency] acquire failed:', error.message);
      return true; // fail open if migration not run yet
    }
    return data === true;
  } catch {
    return true; // fail open without DB
  }
}

async function releaseSlot(): Promise<void> {
  try {
    const { supabaseAdmin } = await import('./supabase/server');
    const sb = supabaseAdmin();
    await sb.rpc('release_llm_chat_slot');
  } catch {
    // non-fatal
  }
}

/** Wait for a global LLM slot, run fn, then release. */
export async function withLlmChatSlot<T>(
  fn: () => Promise<T>,
  opts?: { maxWaitMs?: number },
): Promise<T> {
  const deadline = Date.now() + (opts?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
  while (Date.now() < deadline) {
    if (await tryAcquireSlot()) {
      try {
        return await fn();
      } finally {
        await releaseSlot();
      }
    }
    await sleep(POLL_MS + Math.floor(Math.random() * 200));
  }
  throw new Error(
    'AI is busy right now (too many concurrent requests). Please try again in a few seconds.',
  );
}

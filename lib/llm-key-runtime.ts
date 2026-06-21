/**
 * Distributed LLM key runtime — cooldowns stored in Supabase so all Vercel
 * instances share the same RPM backoff state.
 */
import { supabaseAdmin } from './supabase/server';

const BASE_COOLDOWN_SEC = 65;
const MAX_COOLDOWN_SEC = 600;

export function cooldownSecondsForFailures(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BASE_COOLDOWN_SEC * Math.pow(2, failures - 1), MAX_COOLDOWN_SEC);
}

/** True when key is still in DB-backed RPM cooldown. */
export async function isKeyOnCooldownDb(keyId: string): Promise<boolean> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('llm_key_runtime')
      .select('cooldown_until')
      .eq('key_id', keyId)
      .maybeSingle();
    if (!data?.cooldown_until) return false;
    return new Date(data.cooldown_until as string).getTime() > Date.now();
  } catch {
    return false;
  }
}

export async function getKeyFailureCount(keyId: string): Promise<number> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('llm_key_runtime')
      .select('consecutive_failures')
      .eq('key_id', keyId)
      .maybeSingle();
    return (data?.consecutive_failures as number | undefined) ?? 0;
  } catch {
    return 0;
  }
}

export async function setKeyCooldownDb(keyId: string, failures: number): Promise<void> {
  const secs = cooldownSecondsForFailures(failures);
  if (secs <= 0) return;
  try {
    const sb = supabaseAdmin();
    await sb.rpc('set_llm_key_cooldown', {
      p_key_id: keyId,
      p_cooldown_seconds: Math.round(secs),
      p_failures: failures,
    });
  } catch (e) {
    console.warn('[llm-key-runtime] set cooldown failed:', (e as Error).message);
  }
}

export async function clearKeyCooldownDb(keyId: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.rpc('clear_llm_key_cooldown', { p_key_id: keyId });
  } catch {
    // non-fatal
  }
}

/** Batch: which key ids are currently cooling down. */
export async function getCooldownKeyIds(keyIds: string[]): Promise<Set<string>> {
  const cooling = new Set<string>();
  if (keyIds.length === 0) return cooling;
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('llm_key_runtime')
      .select('key_id, cooldown_until')
      .in('key_id', keyIds);
    const now = Date.now();
    for (const row of data ?? []) {
      const until = row.cooldown_until as string | null;
      if (until && new Date(until).getTime() > now) {
        cooling.add(row.key_id as string);
      }
    }
  } catch {
    // fall through — treat none as cooling
  }
  return cooling;
}

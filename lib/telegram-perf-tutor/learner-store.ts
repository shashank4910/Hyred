import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '../supabase/admin';
import type { Difficulty, LearnerProfile } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'telegram-perf-learners.json');

type StoreFile = Record<string, LearnerProfile>;

let supabaseAvailable: boolean | null = null;

function blankProfile(telegramId: number, displayName: string): LearnerProfile {
  const now = new Date().toISOString();
  return {
    telegramId,
    displayName,
    level: 1,
    strengths: [],
    weaknesses: [],
    topicsSeen: [],
    topicScores: {},
    consecutiveStrong: 0,
    consecutiveWeak: 0,
    totalAnswered: 0,
    pending: null,
    history: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

function readFileStore(): StoreFile {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
  } catch {
    return {};
  }
}

function writeFileStore(store: StoreFile): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

async function canUseSupabase(): Promise<boolean> {
  if (supabaseAvailable != null) return supabaseAvailable;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAvailable = false;
    return false;
  }
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from('telegram_perf_learners').select('telegram_id').limit(1);
    if (error) {
      console.warn('[learner-store] Supabase unavailable, using local file store:', error.message);
      supabaseAvailable = false;
      return false;
    }
    supabaseAvailable = true;
    return true;
  } catch (err) {
    console.warn('[learner-store] Supabase check failed, using local file store:', err);
    supabaseAvailable = false;
    return false;
  }
}

export async function getLearner(telegramId: number): Promise<LearnerProfile | null> {
  if (await canUseSupabase()) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('telegram_perf_learners')
      .select('profile')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (error) throw new Error(`Learner load failed: ${error.message}`);
    if (!data?.profile) return null;
    return data.profile as LearnerProfile;
  }
  return readFileStore()[String(telegramId)] ?? null;
}

export async function createLearner(
  telegramId: number,
  displayName: string,
): Promise<LearnerProfile> {
  const profile = blankProfile(telegramId, displayName);
  await saveLearner(profile);
  return profile;
}

export async function saveLearner(profile: LearnerProfile): Promise<void> {
  profile.updatedAt = new Date().toISOString();
  if (profile.history.length > 80) {
    profile.history = profile.history.slice(-80);
  }

  if (await canUseSupabase()) {
    const sb = supabaseAdmin();
    const { error } = await sb.from('telegram_perf_learners').upsert(
      {
        telegram_id: profile.telegramId,
        display_name: profile.displayName,
        profile,
        updated_at: profile.updatedAt,
        created_at: profile.createdAt,
      },
      { onConflict: 'telegram_id' },
    );
    if (error) throw new Error(`Learner save failed: ${error.message}`);
    return;
  }

  const store = readFileStore();
  store[String(profile.telegramId)] = profile;
  writeFileStore(store);
}

export async function resetLearner(
  telegramId: number,
  displayName: string,
): Promise<LearnerProfile> {
  return createLearner(telegramId, displayName);
}

export function clampLevel(n: number): Difficulty {
  return Math.max(1, Math.min(10, Math.round(n))) as Difficulty;
}

/**
 * Apply an AI-chosen level with a stability clamp (±1 per answer).
 * This is NOT score-threshold leveling — the AI picks the target; we only
 * prevent one noisy grade from leaping many levels at once.
 */
export function applyAiLevel(
  profile: LearnerProfile,
  recommendedLevel: number,
): Difficulty {
  const target = clampLevel(recommendedLevel);
  const cur = profile.level;
  let next = target;
  if (target > cur + 1) next = clampLevel(cur + 1);
  if (target < cur - 1) next = clampLevel(cur - 1);
  profile.level = next;
  // Clear legacy streak counters so old logic cannot leak back in.
  profile.consecutiveStrong = 0;
  profile.consecutiveWeak = 0;
  return next;
}

export function mergeTags(existing: string[], incoming: string[], max = 12): string[] {
  const set = new Set(existing.map((s) => s.trim()).filter(Boolean));
  for (const tag of incoming) {
    const t = tag.trim();
    if (t) set.add(t);
  }
  return [...set].slice(-max);
}

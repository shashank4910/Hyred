import { supabaseAdmin } from '../supabase/admin';
import type { Difficulty, LearnerProfile } from './types';

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

export async function getLearner(telegramId: number): Promise<LearnerProfile | null> {
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

export function adaptLevel(
  profile: LearnerProfile,
  score: number,
  verdict: 'strong' | 'partial' | 'weak',
): Difficulty {
  let next = profile.level;

  if (verdict === 'strong' || score >= 80) {
    profile.consecutiveStrong += 1;
    profile.consecutiveWeak = 0;
    if (profile.consecutiveStrong >= 2) {
      next = clampLevel(next + 1);
      profile.consecutiveStrong = 0;
    }
  } else if (verdict === 'weak' || score < 45) {
    profile.consecutiveWeak += 1;
    profile.consecutiveStrong = 0;
    if (profile.consecutiveWeak >= 2) {
      next = clampLevel(next - 1);
      profile.consecutiveWeak = 0;
    }
  } else {
    profile.consecutiveStrong = 0;
    profile.consecutiveWeak = 0;
  }

  profile.level = next;
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

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getPremiumAccess } from '@/lib/premium';
import { embed, extractResumeInsights } from '@/lib/gemini';
import {
  clearMatchesForResumeChange,
  preferencesFromResumeInsights,
  stripSearchProfile,
} from '@/lib/profile-insights';
import type { Preferences } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/profile/resume
 * Premium-only: replace profiles.resume_text from Fix Studio (in-session → saved).
 * Body: { resume_text: string }
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const access = await getPremiumAccess(profile.id);
  if (access.plan === 'free') {
    return NextResponse.json(
      {
        error: 'premium_upgrade_required',
        message: 'Saving a fixed resume to your Hyred profile is a Premium feature.',
      },
      { status: 402 },
    );
  }

  let body: { resume_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const resumeText = (body.resume_text ?? '').trim();
  if (resumeText.length < 50) {
    return NextResponse.json({ error: 'Resume text too short.' }, { status: 400 });
  }

  if (profile.resume_text === resumeText) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const sb = supabaseAdmin();
  let embedding: number[] | null = null;
  let insights = profile.insights ?? null;
  let preferences: Preferences = (profile.preferences as Preferences) ?? {};

  try {
    const [vec, ins] = await Promise.all([
      embed(resumeText, 'embed', profile.id),
      extractResumeInsights(resumeText, profile.id).catch(() => null),
    ]);
    embedding = vec;
    if (ins) insights = ins;
  } catch (e) {
    return NextResponse.json(
      { error: `Embed failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  insights = stripSearchProfile(insights);
  preferences = preferencesFromResumeInsights(preferences, insights);

  const cleared = await clearMatchesForResumeChange(sb, profile.id);

  const { error } = await sb
    .from('profiles')
    .update({
      resume_text: resumeText,
      resume_embedding: embedding,
      insights,
      preferences,
    })
    .eq('id', profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared_matches: cleared,
    message:
      cleared > 0
        ? 'Resume saved. Previous matches were cleared so the next scan can re-score.'
        : 'Resume saved to your Hyred profile.',
  });
}

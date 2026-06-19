import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { embed, extractResumeInsights } from '@/lib/gemini';
import { parseResume } from '@/lib/resume';
import {
  preferencesFromResumeInsights,
  stripSearchProfile,
  clearMatchesForResumeChange,
} from '@/lib/profile-insights';
import type { Preferences, ResumeInsights } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type JsonBody = {
  email: string;
  full_name?: string;
  resume_text?: string;
  preferences?: Preferences;
  insights?: ResumeInsights;
};

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let email: string;
  let fullName: string | null = null;
  let resumeText: string;
  let preferences: Preferences = {};
  let providedInsights: ResumeInsights | null = null;

  if (contentType.includes('multipart/form-data')) {
    // File upload path
    const form = await req.formData();
    email = String(form.get('email') ?? '');
    fullName = (form.get('full_name') as string | null) || null;
    const prefsRaw = form.get('preferences');
    if (typeof prefsRaw === 'string' && prefsRaw) {
      try {
        preferences = JSON.parse(prefsRaw);
      } catch {
        return NextResponse.json(
          { error: 'invalid preferences JSON' },
          { status: 400 },
        );
      }
    }
    const insightsRaw = form.get('insights');
    if (typeof insightsRaw === 'string' && insightsRaw) {
      try {
        providedInsights = JSON.parse(insightsRaw);
      } catch {
        // ignore - we'll re-extract
      }
    }

    const file = form.get('resume') as File | null;
    const fallbackText = (form.get('resume_text') as string | null) || '';

    if (file && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'file too large (max 5MB)' },
          { status: 400 },
        );
      }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        resumeText = await parseResume({
          buffer,
          filename: file.name,
          mimeType: file.type,
        });
      } catch (e) {
        return NextResponse.json(
          { error: `Could not parse resume: ${(e as Error).message}` },
          { status: 400 },
        );
      }
    } else {
      resumeText = fallbackText;
    }
  } else {
    // JSON path
    let body: JsonBody;
    try {
      body = (await req.json()) as JsonBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    email = body.email;
    fullName = body.full_name ?? null;
    resumeText = body.resume_text ?? '';
    preferences = body.preferences ?? {};
    providedInsights = body.insights ?? null;
  }

  if (resumeText.length < 50) {
    return NextResponse.json(
      { error: 'resume text is too short' },
      { status: 400 },
    );
  }

  // Identity comes from the Supabase Auth session — NOT the request body.
  // getCurrentProfile() returns (creating/linking if needed) the row owned by
  // the signed-in user, so a user can only ever write their own profile.
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const existing = profile;

  const resumeChanged =
    !existing.resume_text ||
    existing.resume_text !== resumeText ||
    !existing.resume_embedding;

  let embedding: number[] | null = existing.resume_embedding ?? null;
  let insights = providedInsights ?? existing.insights ?? null;

  if (resumeChanged) {
    try {
      // If client already extracted insights (via /api/profile/parse), skip LLM call here.
      const insightsPromise =
        providedInsights != null
          ? Promise.resolve(providedInsights)
          : extractResumeInsights(resumeText).catch(() => null);

      const [vec, ins] = await Promise.all([
        embed(resumeText),
        insightsPromise,
      ]);
      embedding = vec;
      if (ins) insights = ins;
    } catch (e) {
      return NextResponse.json(
        { error: `Embed failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }

    // Resume changed → drop cached ingest profile + refresh target roles from
    // the NEW resume (not stale preferences adopted from a prior session).
    insights = stripSearchProfile(insights);
    preferences = preferencesFromResumeInsights(preferences, insights);

    const cleared = await clearMatchesForResumeChange(sb, profile.id);
    if (cleared > 0) {
      console.log(
        `[profile] Resume changed — cleared ${cleared} match(es) so the next scan can re-score.`,
      );
    }
  }

  // email stays bound to the auth identity; the form value is only a fallback
  // for a freshly-created profile that has no email yet (placeholder).
  const canonicalEmail = existing.email && !existing.email.endsWith('@users.noreply')
    ? existing.email
    : email || existing.email;

  const updatePayload = {
    email: canonicalEmail,
    full_name: fullName,
    resume_text: resumeText,
    resume_embedding: embedding,
    insights,
    preferences,
  };

  const { data, error } = await sb
    .from('profiles')
    .update(updatePayload)
    .eq('id', profile.id)
    .select('id, email, insights')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (resumeChanged) {
    try {
      const { extractAndSaveStructuredProfile } = await import(
        '@/lib/structured-profile-service'
      );
      await extractAndSaveStructuredProfile(sb, profile.id, resumeText);
    } catch (e) {
      console.warn('[profile] structured extract failed:', (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    profile: data,
    reembedded: resumeChanged,
    resume_chars: resumeText.length,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { embed, extractResumeInsights } from '@/lib/gemini';
import { parseResume } from '@/lib/resume';
import type { Preferences } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type JsonBody = {
  email: string;
  full_name?: string;
  resume_text?: string;
  preferences?: Preferences;
};

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let email: string;
  let fullName: string | null = null;
  let resumeText: string;
  let preferences: Preferences = {};

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
    // JSON path (legacy / preferences-only updates)
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
  }

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (resumeText.length < 50) {
    return NextResponse.json(
      { error: 'resume text is too short' },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from('profiles')
    .select('id, resume_text, resume_embedding, insights')
    .eq('email', email)
    .maybeSingle();

  const resumeChanged =
    !existing ||
    existing.resume_text !== resumeText ||
    !existing.resume_embedding;

  let embedding: number[] | null = (existing?.resume_embedding as number[]) ?? null;
  let insights = existing?.insights ?? null;

  if (resumeChanged) {
    try {
      // Run embedding + insights extraction in parallel
      const [vec, ins] = await Promise.all([
        embed(resumeText),
        extractResumeInsights(resumeText).catch(() => null),
      ]);
      embedding = vec;
      if (ins) insights = ins;
    } catch (e) {
      return NextResponse.json(
        { error: `Embed failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }
  }

  const upsertPayload = {
    email,
    full_name: fullName,
    resume_text: resumeText,
    resume_embedding: embedding,
    insights,
    preferences,
  };

  const { data, error } = await sb
    .from('profiles')
    .upsert(upsertPayload, { onConflict: 'email' })
    .select('id, email, insights')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile: data,
    reembedded: resumeChanged,
    resume_chars: resumeText.length,
  });
}

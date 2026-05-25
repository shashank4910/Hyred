import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { embed } from '@/lib/gemini';
import type { Preferences } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  email: string;
  full_name?: string;
  resume_text: string;
  preferences?: Preferences;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.email || !body.resume_text) {
    return NextResponse.json(
      { error: 'email and resume_text are required' },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  // Re-embed only if resume changed (or no embedding exists)
  const { data: existing } = await sb
    .from('profiles')
    .select('id, resume_text, resume_embedding')
    .eq('email', body.email)
    .maybeSingle();

  const resumeChanged =
    !existing ||
    existing.resume_text !== body.resume_text ||
    !existing.resume_embedding;

  let embedding: number[] | null = (existing?.resume_embedding as number[]) ?? null;
  if (resumeChanged) {
    try {
      embedding = await embed(body.resume_text);
    } catch (e) {
      return NextResponse.json(
        { error: `Embed failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }
  }

  const upsertPayload = {
    email: body.email,
    full_name: body.full_name ?? null,
    resume_text: body.resume_text,
    resume_embedding: embedding,
    preferences: body.preferences ?? {},
  };

  const { data, error } = await sb
    .from('profiles')
    .upsert(upsertPayload, { onConflict: 'email' })
    .select('id, email')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data, reembedded: resumeChanged });
}

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import type { CustomQa } from '@/lib/extension/profile';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/save-qa
 * Body: { question: string, answer: string }
 *
 * Saves a screening Q&A to apply_profiles.custom_qa (Simplify-style reuse).
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { question?: string; answer?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }

  const question = body.question?.trim();
  const answer = body.answer?.trim();
  if (!question || question.length < 5 || !answer) {
    return corsResponse({ error: 'question and answer required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('apply_profiles')
    .select('id, custom_qa')
    .eq('profile_id', auth.profile_id)
    .maybeSingle();

  const existing = (Array.isArray(row?.custom_qa)
    ? row!.custom_qa
    : []) as CustomQa[];

  const normQ = question.toLowerCase().replace(/\s+/g, ' ');
  const filtered = existing.filter(
    (r) =>
      String(r.question || '')
        .toLowerCase()
        .replace(/\s+/g, ' ') !== normQ,
  );
  const custom_qa = [{ question, answer }, ...filtered].slice(0, 100);

  if (row?.id) {
    await sb
      .from('apply_profiles')
      .update({ custom_qa, updated_at: new Date().toISOString() })
      .eq('id', row.id);
  } else {
    await sb.from('apply_profiles').insert({
      profile_id: auth.profile_id,
      custom_qa,
    });
  }

  return corsResponse({ ok: true });
}

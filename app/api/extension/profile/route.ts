import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { buildAutofillProfile } from '@/lib/extension/profile';
import type { ResumeInsights } from '@/lib/types';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/profile
 * Returns the autofill-shaped profile (first/last name split, links extracted).
 */
export async function GET(req: NextRequest) {
  if (!(await isExtAuthed(req))) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('profiles')
    .select('email, full_name, resume_text, insights')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) {
    return corsResponse({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return corsResponse({ error: 'no profile' }, { status: 404 });
  }
  const profile = buildAutofillProfile({
    email: row.email,
    full_name: row.full_name,
    resume_text: row.resume_text,
    insights: (row.insights as ResumeInsights | null) ?? null,
  });
  return corsResponse({ ok: true, profile });
}

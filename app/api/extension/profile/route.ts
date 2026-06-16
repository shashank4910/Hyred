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
 * Scoped to the user identified by the extension JWT.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();

  // If the JWT has a profile_id, use it directly
  if (auth.profile_id) {
    const { data: row, error } = await sb
      .from('profiles')
      .select('email, full_name, resume_text, insights')
      .eq('id', auth.profile_id)
      .maybeSingle();
    if (error) {
      return corsResponse({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return corsResponse({ error: 'no profile' }, { status: 404 });
    }
    const { data: apply } = await sb
      .from('apply_profiles')
      .select('*')
      .eq('profile_id', auth.profile_id)
      .maybeSingle();
    const profile = buildAutofillProfile(
      {
        email: row.email,
        full_name: row.full_name,
        resume_text: row.resume_text,
        insights: (row.insights as ResumeInsights | null) ?? null,
      },
      apply,
    );
    return corsResponse({ ok: true, profile });
  }

  // Fallback: legacy tokens without profile_id (APP_PASSWORD flow)
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

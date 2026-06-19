import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { buildAutofillProfile } from '@/lib/extension/profile';
import {
  markStructureReviewed,
  saveStructuredProfileEdits,
} from '@/lib/structured-profile-service';
import type { ResumeInsights } from '@/lib/types';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/structure
 * Save structured work/education edits from extension Profile tab, or mark reviewed.
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    structured_work_history?: unknown;
    structured_education?: unknown;
    mark_reviewed?: boolean;
  };
  const sb = supabaseAdmin();
  try {
    if (body.mark_reviewed && !body.structured_work_history && !body.structured_education) {
      await markStructureReviewed(sb, auth.profile_id);
    } else {
      await saveStructuredProfileEdits(sb, auth.profile_id, {
        structured_work_history: body.structured_work_history as never,
        structured_education: body.structured_education as never,
        mark_reviewed: !!body.mark_reviewed,
      });
    }
    const { data: row } = await sb
      .from('profiles')
      .select('email, full_name, resume_text, insights')
      .eq('id', auth.profile_id)
      .maybeSingle();
    const { data: apply } = await sb
      .from('apply_profiles')
      .select('*')
      .eq('profile_id', auth.profile_id)
      .maybeSingle();
    const profile = buildAutofillProfile(
      {
        email: row!.email,
        full_name: row!.full_name,
        resume_text: row!.resume_text,
        insights: (row!.insights as ResumeInsights | null) ?? null,
      },
      apply,
    );
    return corsResponse({ ok: true, profile });
  } catch (e) {
    return corsResponse({ error: String((e as Error).message) }, { status: 500 });
  }
}

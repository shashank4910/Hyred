import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import {
  extractAndSaveStructuredProfile,
} from '@/lib/structured-profile-service';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function OPTIONS() {
  return corsPreflight();
}

/** POST — re-extract work history + education from stored resume (AI only). */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('profiles')
    .select('resume_text')
    .eq('id', auth.profile_id)
    .maybeSingle();
  if (error) {
    return corsResponse({ error: error.message }, { status: 500 });
  }
  if (!row?.resume_text || row.resume_text.length < 80) {
    return corsResponse({ error: 'no_resume_text' }, { status: 400 });
  }
  try {
    const result = await extractAndSaveStructuredProfile(
      sb,
      auth.profile_id,
      row.resume_text,
    );
    return corsResponse({
      ok: true,
      work_count: result.work_history.length,
      education_count: result.education.length,
      source: result.source,
      warnings: result.warnings,
    });
  } catch (e) {
    return corsResponse({ error: String((e as Error).message) }, { status: 500 });
  }
}

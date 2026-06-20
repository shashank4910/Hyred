import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { generateAndSaveCoverLetterForMatch } from '@/lib/generate-match-cover-letter';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/coverletter
 * Body: { match_id: string }
 *
 * Same generation path as POST /api/coverletter — extension Bearer auth.
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { match_id?: string };
  try {
    body = await req.json();
  } catch {
    return corsResponse({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.match_id) {
    return corsResponse({ error: 'match_id required' }, { status: 400 });
  }

  try {
    const coverLetter = await generateAndSaveCoverLetterForMatch(
      supabaseAdmin(),
      body.match_id,
      auth.profile_id,
    );
    return corsResponse({ ok: true, cover_letter: coverLetter });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'Match not found' ? 404 : msg === 'Profile has no resume_text' ? 400 : 500;
    return corsResponse({ error: msg }, { status });
  }
}

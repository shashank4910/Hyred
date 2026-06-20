import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { generateAndSaveCoverLetterForMatch } from '@/lib/generate-match-cover-letter';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { match_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.match_id) {
    return NextResponse.json({ error: 'match_id required' }, { status: 400 });
  }

  const profile0 = await getCurrentProfile();
  if (!profile0) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const coverLetter = await generateAndSaveCoverLetterForMatch(
      supabaseAdmin(),
      body.match_id,
      profile0.id,
    );
    return NextResponse.json({ ok: true, cover_letter: coverLetter });
  } catch (e) {
    const msg = (e as Error).message;
    const status =
      msg === 'Match not found' ? 404 : msg === 'Profile has no resume_text' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

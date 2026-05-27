import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateCoverLetter } from '@/lib/gemini';
import { ensureFullDescription } from '@/lib/jd-fetcher';

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

  const sb = supabaseAdmin();

  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id, profile_id, job_id,
       profile:profiles(full_name, resume_text),
       job:jobs(id, title, company, description, url)`,
    )
    .eq('id', body.match_id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json(
      { error: matchErr?.message || 'Match not found' },
      { status: 404 },
    );
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    resume_text: string | null;
  };
  const job = match.job as unknown as {
    id: string;
    title: string;
    company: string | null;
    description: string | null;
    url: string | null;
  };

  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'Profile has no resume_text' },
      { status: 400 },
    );
  }

  // Ensure we have the full JD before drafting the cover letter — without
  // it, the cover letter would only reference the first ~500 chars of the
  // job intro and miss the actual responsibilities/requirements.
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  try {
    const coverLetter = await generateCoverLetter({
      resume: profile.resume_text,
      candidateName: profile.full_name,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: fullDescription,
    });

    await sb
      .from('matches')
      .update({ cover_letter: coverLetter })
      .eq('id', match.id);

    return NextResponse.json({ ok: true, cover_letter: coverLetter });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
